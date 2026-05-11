"""
validate_experts.py — V6.1
===========================
Gate 1 + Gate 2 validation cho cả 3 Expert Detectors trước khi Extract Features.

Gate 1 — Expert Detector Performance:
Gate 1 — Expert Detector Performance:
  GoreDetector:       AUC >= 0.88, Recall >= 0.80
  SelfHarmDetector:   AUC >= 0.78, Recall >= 0.75  (n=87, CI 95% +-0.08)
  NSFWClassifier:     AUC >= 0.91, drawings_mean < 0.35

Gate 2 — Calibration Check (trước khi dùng làm Teacher):
  ECE < 0.10
  Nếu ECE > 0.10 -> auto Temperature Scaling, save best_T

Nếu fail bất kỳ Gate nào -> in FAIL rõ ràng và exit(1)
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import glob
import logging
import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader
from sklearn.metrics import roc_auc_score, recall_score, precision_score

from src.models.gore_detector import GoreDetector, get_default_transform
from src.models.nsfw_classifier import NSFWClassifier, NSFWDataset, nsfw_val_transform
from src.models.selfharm_detector import SelfHarmDetector, SelfHarmDataset, selfharm_val_transform
from scripts.train_gore_v6 import categorize_image
from src.data.split_utils import get_split_from_id

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


# ─────────────────────────────────────────────────────────────────────────────
# Gate 2 — Calibration helpers
# ─────────────────────────────────────────────────────────────────────────────

def compute_ece(all_probs, all_labels, n_bins=15):
    """
    Weighted ECE (Expected Calibration Error).
    This is more stable than unweighted-bin averaging when bins are sparse.
    """
    probs = np.asarray(all_probs, dtype=np.float32)
    labels = np.asarray(all_labels, dtype=np.float32)

    if probs.size == 0:
        return float('inf')

    probs = np.clip(probs, 1e-6, 1.0 - 1e-6)
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1, dtype=np.float32)
    bin_ids = np.digitize(probs, bin_edges[1:-1], right=False)

    ece = 0.0
    n = float(probs.size)
    for b in range(n_bins):
        mask = (bin_ids == b)
        if not np.any(mask):
            continue
        conf = float(np.mean(probs[mask]))
        acc = float(np.mean(labels[mask]))
        ece += (float(np.sum(mask)) / n) * abs(acc - conf)
    return float(ece)


def compute_brier(all_probs, all_labels):
    probs = np.asarray(all_probs, dtype=np.float32)
    labels = np.asarray(all_labels, dtype=np.float32)
    if probs.size == 0:
        return float('inf')
    return float(np.mean((probs - labels) ** 2))


def tune_temperature(model, val_loader, device, T_range=None):
    """
    Tìm Temperature T tốt nhất để minimize ECE trên val set.
    Tie-break bằng Brier score.
    """
    if T_range is None:
        T_range = (
            [0.25, 0.5, 0.75, 1.0]
            + [1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0]
            + [5.0, 6.0, 8.0, 10.0, 12.0]
        )

    # Collect logits and labels
    all_logits, all_labels = [], []
    model.eval()
    with torch.no_grad():
        for x, y in val_loader:
            logits = model(x.to(device))
            all_logits.extend(logits.cpu().squeeze(-1).numpy())
            all_labels.extend(y.cpu().squeeze(-1).numpy())

    all_logits = np.array(all_logits)
    all_labels = np.array(all_labels)

    best_T, best_ece, best_brier = 1.0, float('inf'), float('inf')
    for T in T_range:
        logits_t = np.clip(all_logits / float(T), -30.0, 30.0)
        probs = 1.0 / (1.0 + np.exp(-logits_t))
        ece = compute_ece(probs, all_labels)
        brier = compute_brier(probs, all_labels)
        if (ece < best_ece) or (abs(ece - best_ece) < 1e-6 and brier < best_brier):
            best_ece, best_brier, best_T = ece, brier, T

    return best_T, best_ece, best_brier


# ─────────────────────────────────────────────────────────────────────────────
# Gate 1 + 2 — GoreDetector
# ─────────────────────────────────────────────────────────────────────────────

def validate_gore(args, device):
    logging.info("\n" + "="*60)
    logging.info("  GATE 1+2 — GoreDetector Validation")
    logging.info("="*60)

    model = GoreDetector(unfreeze_from_layer=0).to(device)
    
    state = torch.load(args.gore_weight, map_location='cpu', weights_only=False)
    if 'model_state' in state: state = state['model_state']
    model.load_state_dict(state)
    model.eval()

    # Collect val images — ONLY Blood_Violence test split (no train leakage)
    pos_paths = []
    neg_paths = []

    # Blood_Violence -> categorised via YOLO labels
    blood_viol_test = sorted(glob.glob(str(Path(args.blood_violence_dir) / "test/images/*.jpg")))
    for img_path in blood_viol_test:
        lbl_path = img_path.replace("/images/", "/labels/").replace(".jpg", ".txt")
        cat = categorize_image(lbl_path)
        if cat in ["positive_clean", "positive_contaminated"]:
            pos_paths.append(img_path)
        elif cat in ["negative_clean", "negative_violent"]:
            neg_paths.append(img_path)

    if not pos_paths:
        logging.error("FAIL: No positive Gore val images found. Check paths.")
        return False, 1.0

    transform = get_default_transform(is_train=False)
    all_probs, all_labels = [], []

    def predict_images(paths, label):
        for p in paths:
            try:
                img = Image.open(p).convert('RGB')
                x = transform(img).unsqueeze(0).to(device)
                with torch.no_grad():
                    prob = model.predict_proba(x).item()
                all_probs.append(prob)
                all_labels.append(label)
            except Exception:
                pass

    predict_images(pos_paths[:500], 1)
    predict_images(neg_paths[:500], 0)

    all_probs  = np.array(all_probs)
    all_labels = np.array(all_labels)

    auc    = roc_auc_score(all_labels, all_probs)
    preds  = (all_probs >= 0.5).astype(int)
    recall = recall_score(all_labels, preds, zero_division=0)

    logging.info(f"  AUC:    {auc:.4f}  (need >= 0.88)")
    logging.info(f"  Recall: {recall:.4f}  (need >= 0.80)")

    gate1_pass = (auc >= 0.88) and (recall >= 0.80)
    if gate1_pass:
        logging.info("  [PASS] Gate 1 GoreDetector")
    else:
        logging.error("  [FAIL] Gate 1 GoreDetector — DUNG LAI!")
        return False, 1.0

    # Gate 2 — Calibration
    ece = compute_ece(all_probs, all_labels)
    brier = compute_brier(all_probs, all_labels)
    logging.info(f"  ECE: {ece:.4f}  (need < 0.10)")
    logging.info(f"  Brier: {brier:.4f}")

    best_T = 1.0
    if ece >= 0.10:
        logging.warning("  [WARN] ECE >= 0.10 — Applying Temperature Scaling...")
        # Need DataLoader for tune_temperature
        class SimpleDS(torch.utils.data.Dataset):
            def __init__(self, paths, labels, transform):
                self.paths = paths; self.labels = labels; self.transform = transform
            def __len__(self): return len(self.paths)
            def __getitem__(self, i):
                try: img = Image.open(self.paths[i]).convert('RGB')
                except: img = Image.new('RGB', (224, 224))
                return self.transform(img), torch.tensor([self.labels[i]], dtype=torch.float32)

        all_paths  = list(pos_paths[:500]) + list(neg_paths[:500])
        all_lbls   = [1]*min(500, len(pos_paths)) + [0]*min(500, len(neg_paths))
        ds = SimpleDS(all_paths, all_lbls, transform)
        loader = DataLoader(ds, batch_size=64, shuffle=False)
        best_T, ece_after, brier_after = tune_temperature(model, loader, device)
        logging.info(f"  --> Best T={best_T:.2f}, ECE after={ece_after:.4f}, Brier after={brier_after:.4f}")
        if ece_after >= 0.10:
            logging.error("  [FAIL] Gate 2 GoreDetector — ECE still >= 0.10 after scaling!")
            return False, best_T
    else:
        logging.info("  [PASS] Gate 2 GoreDetector (calibration OK)")

    return True, best_T


# ─────────────────────────────────────────────────────────────────────────────
# Gate 1 + 2 — NSFWClassifier
# ─────────────────────────────────────────────────────────────────────────────

def validate_nsfw(args, device):
    logging.info("\n" + "="*60)
    logging.info("  GATE 1+2 — NSFWClassifier Validation")
    logging.info("="*60)

    model = NSFWClassifier(unfreeze_from_layer=0).to(device)
    # Load trained weights
    state = torch.load(args.nsfw_weight, map_location='cpu', weights_only=False)
    # Accept either full state_dict or head-only
    if 'model_state' in state: state = state['model_state']
    
    if any(k.startswith('head.') for k in state.keys()):
        model.load_state_dict(state, strict=False)
    else:
        model.head.load_state_dict(state)
    model.eval()

    transform = nsfw_val_transform()
    nsfw_root = Path(args.nsfw_root)

    def filter_split(paths, split_name):
        return [p for p in paths if get_split_from_id(str(p)) == split_name]

    def mean_predict(paths):
        probs = []
        for p in paths[:200]:
            try:
                img = Image.open(p).convert('RGB')
                x = transform(img).unsqueeze(0).to(device)
                with torch.no_grad():
                    prob = model.predict_proba(x).item()
                probs.append(prob)
            except Exception:
                pass
        return float(np.mean(probs)) if probs else 0.0

    porn_paths = filter_split(sorted((nsfw_root / "porn").glob("*.jpg")), "test")
    drawings_paths = filter_split(sorted((nsfw_root / "drawings").glob("*.jpg")), "test")
    sexy_paths = filter_split(sorted((nsfw_root / "sexy").glob("*.jpg")), "test")
    neutral_paths = filter_split(sorted((nsfw_root / "neutral").glob("*.jpg")), "test")

    pos_mean     = mean_predict(porn_paths)
    drawings_mean = mean_predict(drawings_paths)
    sexy_mean    = mean_predict(sexy_paths)
    neutral_mean = mean_predict(neutral_paths)

    # Collect for AUC
    selected_pos_paths = []
    selected_neg_paths = []
    pos_probs = []; neg_probs = []
    for folder in ["porn", "hentai", "sexy"]:
        folder_paths = filter_split(sorted((nsfw_root / folder).glob("*.jpg")), "test")
        selected = list(folder_paths[:100])
        selected_pos_paths.extend(selected)
        for p in selected:
            try:
                img = Image.open(p).convert('RGB')
                x = transform(img).unsqueeze(0).to(device)
                with torch.no_grad():
                    prob = model.predict_proba(x).item()
                pos_probs.append(prob)
            except Exception:
                pass
    for folder in ["neutral", "drawings"]:
        folder_paths = filter_split(sorted((nsfw_root / folder).glob("*.jpg")), "test")
        selected = list(folder_paths[:150])
        selected_neg_paths.extend(selected)
        for p in selected:
            try:
                img = Image.open(p).convert('RGB')
                x = transform(img).unsqueeze(0).to(device)
                with torch.no_grad():
                    prob = model.predict_proba(x).item()
                neg_probs.append(prob)
            except Exception:
                pass

    all_probs  = np.array(pos_probs + neg_probs)
    all_labels = np.array([1]*len(pos_probs) + [0]*len(neg_probs))

    try:
        auc = roc_auc_score(all_labels, all_probs)
    except ValueError:
        auc = 0.0

    logging.info(f"  AUC:          {auc:.4f}  (need >= 0.91)")
    logging.info(f"  porn mean:    {pos_mean:.4f}")
    logging.info(f"  sexy mean:    {sexy_mean:.4f}  (need > 0.55)")
    logging.info(f"  neutral mean: {neutral_mean:.4f}  (need < 0.20)")
    logging.info(f"  drawings mean:{drawings_mean:.4f}  (need < 0.35)")

    gate1_pass = (
        auc >= 0.91 and
        drawings_mean < 0.35 and
        sexy_mean > 0.55 and
        neutral_mean < 0.20
    )

    if gate1_pass:
        logging.info("  [PASS] Gate 1 NSFWClassifier")
    else:
        logging.error("  [FAIL] Gate 1 NSFWClassifier — DUNG LAI!")
        return False, 1.0

    ece = compute_ece(all_probs, all_labels)
    brier = compute_brier(all_probs, all_labels)
    logging.info(f"  ECE: {ece:.4f}  (need < 0.10)")
    logging.info(f"  Brier: {brier:.4f}")
    best_T = 1.0
    if ece >= 0.10:
        logging.warning("  [WARN] ECE >= 0.10 on NSFWClassifier — applying temperature scaling.")
        calib_ds = NSFWDataset(selected_pos_paths, selected_neg_paths, transform=transform)
        calib_loader = DataLoader(calib_ds, batch_size=64, shuffle=False)
        best_T, ece_after, brier_after = tune_temperature(model, calib_loader, device)
        logging.info(f"  --> Best T={best_T:.2f}, ECE after={ece_after:.4f}, Brier after={brier_after:.4f}")
        if ece_after >= 0.10:
            logging.error("  [FAIL] Gate 2 NSFWClassifier — ECE still >= 0.10 after scaling!")
            return False, best_T
    else:
        logging.info("  [PASS] Gate 2 NSFWClassifier (calibration OK)")

    return True, best_T



# ─────────────────────────────────────────────────────────────────────────────
# Gate 1+2 — SelfHarmDetector (V6.1)
# ─────────────────────────────────────────────────────────────────────────────

def validate_selfharm(args, device):
    """
    Gate 1: AUC >= 0.78, Recall >= 0.75
    n=87 (val=58 + test=29), CI 95% ~+-0.08
    Negative pool: Blood_Violence valid + UCF-101 val/test hard negatives.

    Fallback:
      Option A: --unfreeze_last_n 2 --lr 5e-5
      Option B: Them Wound/Cut + Bruises (464 anh) vao positive
      Option C: Chap nhan AUC=0.75 + ghi limitation bao cao
    """
    logging.info("\n" + "="*60)
    logging.info("  GATE 1+2 SELFHARM DETECTOR V6.1")
    logging.info("  n=87 (val=58 + test=29), CI 95% ~+-0.08")
    logging.info("="*60)

    model = SelfHarmDetector(unfreeze_from_layer=0).to(device)
    ckpt  = torch.load(args.selfharm_weight, map_location='cpu', weights_only=False)
    state = ckpt.get('model_state', ckpt)
    model.load_state_dict(state)
    model.eval()

    # Positive: val (58) + test (29) images goc = 87 anh
    pos_paths = []
    for attr in ('sh_val_dir', 'sh_test_dir'):
        d = Path(getattr(args, attr, '') or '')
        if d.exists():
            for ext in ('*.jpg', '*.jpeg', '*.png'):
                pos_paths.extend(list(d.glob(ext)))
    logging.info(f"  Positive samples (val+test): {len(pos_paths)}")

    # Negative: Blood_Violence valid + UCF-101 val/test hard negatives
    neg_paths = list((Path(args.blood_violence_dir) / "valid" / "images").glob('*.jpg'))

    ucf_frames = sorted(Path(args.ucf101_dir).rglob("*.jpg"))
    ucf_hard_neg = [
        p for p in ucf_frames
        if get_split_from_id(str(p), train_ratio=0.7, val_ratio=0.15) in {"val", "test"}
    ]
    if ucf_hard_neg:
        neg_paths.extend(ucf_hard_neg)

    # Keep the negative pool bounded so class imbalance does not dominate recall.
    neg_paths = neg_paths[: max(len(pos_paths) * 6, 300)]

    logging.info(f"  Negative samples (blood valid + UCF val/test): {len(neg_paths)}")

    dataset = SelfHarmDataset(pos_paths, neg_paths, selfharm_val_transform())
    loader  = DataLoader(dataset, batch_size=64, shuffle=False, num_workers=2)

    all_probs, all_labels = [], []
    with torch.no_grad():
        for x, y in loader:
            p = model.predict_proba(x.to(device)).squeeze(-1).cpu().numpy()
            all_probs.extend(p)
            all_labels.extend(y.squeeze(-1).numpy())

    all_probs  = np.array(all_probs)
    all_labels = np.array(all_labels)

    auc    = roc_auc_score(all_labels, all_probs) if len(set(all_labels)) > 1 else 0.0
    preds  = (all_probs >= 0.5).astype(int)
    recall = recall_score(all_labels, preds, zero_division=0)

    logging.info(f"  AUC:    {auc:.4f}  (need >= 0.78)")
    logging.info(f"  Recall: {recall:.4f}  (need >= 0.75)")

    gate1_pass = auc >= 0.78 and recall >= 0.75
    if gate1_pass:
        logging.info("  [PASS] Gate 1 SelfHarmDetector")
    else:
        logging.error("  [FAIL] Gate 1 SelfHarmDetector")
        logging.error("  Fallback A: --unfreeze_last_n 2 --lr 5e-5")
        logging.error("  Fallback B: Them Wound/Cut+Bruises (464 anh) vao positive")
        logging.error("  Fallback C: Chap nhan AUC=0.75 + ghi limitation bao cao")
        return False, 1.0

    ece = compute_ece(all_probs, all_labels)
    brier = compute_brier(all_probs, all_labels)
    logging.info(f"  ECE: {ece:.4f}  (need < 0.10)")
    logging.info(f"  Brier: {brier:.4f}")
    best_T = 1.0
    if ece >= 0.10:
        logging.warning("  [WARN] ECE >= 0.10 -> applying temperature scaling.")
        best_T, ece_after, brier_after = tune_temperature(model, loader, device)
        logging.info(f"  --> Best T={best_T:.2f}, ECE after={ece_after:.4f}, Brier after={brier_after:.4f}")
        if ece_after >= 0.10:
            logging.error("  [FAIL] Gate 2 SelfHarmDetector — ECE still >= 0.10 after scaling!")
            return False, best_T
    else:
        logging.info("  [PASS] Gate 2 SelfHarmDetector (calibration OK)")

    return True, best_T


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gore_weight',        required=True)
    parser.add_argument('--nsfw_weight',        required=True)
    parser.add_argument('--selfharm_weight',    required=True,  help='SelfHarmDetector weight (V6.1)')
    parser.add_argument('--blood_violence_dir', required=True)
    parser.add_argument('--sh_val_dir',         required=True,  help='Self Harm valid/images (58 anh goc)')
    parser.add_argument('--sh_test_dir',        required=True,  help='Self Harm test/images (29 anh goc)')
    parser.add_argument('--ucf101_dir',         required=True)
    parser.add_argument('--nsfw_root',          required=True)
    args = parser.parse_args()

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    gore_ok,     gore_T     = validate_gore(args, device)
    selfharm_ok, selfharm_T = validate_selfharm(args, device)
    nsfw_ok,     nsfw_T     = validate_nsfw(args, device)

    print("\n" + "="*60)
    print("  EXPERT VALIDATION SUMMARY V6.1")
    print("="*60)
    print(f"  GoreDetector:      {'[PASS]' if gore_ok     else '[FAIL]'}  best_T={gore_T:.2f}")
    print(f"  SelfHarmDetector:  {'[PASS]' if selfharm_ok else '[FAIL]'}  best_T={selfharm_T:.2f}  [V6.1]")
    print(f"  NSFWClassifier:    {'[PASS]' if nsfw_ok     else '[FAIL]'}  best_T={nsfw_T:.2f}")

    all_ok = gore_ok and selfharm_ok and nsfw_ok
    if all_ok:
        print("\n  [GO] Tat ca 3 experts validated. Proceed to feature extraction.")
        print(f"  Cell 5 args: --gore_T {gore_T:.2f} --nsfw_T {nsfw_T:.2f} --selfharm_T {selfharm_T:.2f}")
        sys.exit(0)
    else:
        print("\n  [NO-GO] Fix expert validation failures before proceeding.")
        sys.exit(1)


if __name__ == '__main__':
    main()
