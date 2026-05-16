"""
probe_shortcut.py — V6.1
=========================
3 probe tests để xác nhận V_Gate shortcut learning trước khi train V6.1.

Chạy trên V5.2 weights TRƯỚC khi áp dụng VideoQualityAugmentor.
Kết quả quyết định mức độ ưu tiên quality augmentation.

Kết quả diễn giải:
  Cả 3 FAIL → Shortcut nghiêm trọng, aug_prob=0.5 bắt buộc
  1-2 FAIL   → Shortcut một phần, aug_prob=0.3 khuyến nghị
  Tất cả PASS → Model đang học đúng, quality aug optional (vẫn nên dùng)

Usage:
  python scripts/probe_shortcut.py \
    --model_weight trong_so/task_gated_v6_best.pth \
    --features_dir /kaggle/working/features_v6 \
    --val_manifest /kaggle/working/manifests_v6/val_manifest.csv
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import argparse
import logging
import torch
import numpy as np
import pandas as pd

from src.models.task_gated_model import TaskGatedModelV6

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


# ─────────────────────────────────────────────────────────────────────────────
# Helper: load model + run forward
# ─────────────────────────────────────────────────────────────────────────────

@torch.no_grad()
def run_model_on_feat(model, feat_npy: np.ndarray, device: torch.device):
    """feat_npy: [T, D] → v_prob: float, v_attn: [T]"""
    x = torch.FloatTensor(feat_npy).unsqueeze(0).to(device)  # [1, T, D]
    D = x.shape[-1]
    # Unpack aux: flow(3) + yolo(1) + gore(1) + selfharm(1) + nsfw(1)
    clip_x  = x[:, :, :768]
    flow_x  = x[:, :, 768:771]
    yolo_x  = x[:, :, 771:772]
    gore_x  = x[:, :, 772:773]
    selfharm_x = x[:, :, 773:774] if D >= 775 else gore_x  # fallback cho 774-dim
    nsfw_x  = x[:, :, -1:]

    v_logit, S_score, N_score, saliency = model(
        clip_x, flow_x, yolo_x, gore_x, nsfw_x, selfharm_x
    )
    v_prob = torch.sigmoid(v_logit).squeeze().item()
    v_attn = saliency['violence'].squeeze().cpu().numpy()  # [T]
    return v_prob, v_attn


def resolve_feature_path(row: pd.Series, features_dir: Path) -> Path | None:
    if 'feature_path' in row and str(row['feature_path']).strip():
        raw = Path(str(row['feature_path']).strip())
        return raw if raw.is_absolute() else features_dir / raw

    if 'video_id' in row and str(row['video_id']).strip():
        return features_dir / f"{str(row['video_id']).strip()}.npy"

    return None


def get_violence_column(df: pd.DataFrame) -> str:
    if 'violence' in df.columns:
        return 'violence'
    if 'label_violence' in df.columns:
        return 'label_violence'
    raise ValueError("Manifest must contain either 'violence' or 'label_violence'.")


# ─────────────────────────────────────────────────────────────────────────────
# Probe Test 1: Blur Effect
# ─────────────────────────────────────────────────────────────────────────────

def probe_test_1_blur_effect(model, val_manifest_path, features_dir, device, n_samples=20):
    """
    Nếu model dùng shortcut quality:
    Thêm blur vào CLIP embedding của non-violence video → V_score phải TĂNG
    (vì blurry ≈ surveillance ≈ violence trong model's world-view)

    Cách simulate: thêm Gaussian noise vào CLIP features của normal videos.
    (Không thể re-extract CLIP cho blurred frames, nhưng có thể perturb embedding)
    """
    df = pd.read_csv(val_manifest_path)
    violence_col = get_violence_column(df)
    normal_df = df[df[violence_col] == 0]
    normal_rows = normal_df.sample(n=min(n_samples, len(normal_df)), random_state=42)

    deltas = []
    for _, row in normal_rows.iterrows():
        feat_path = resolve_feature_path(row, Path(features_dir))
        if feat_path is None or not feat_path.exists():
            continue
        feat = np.load(feat_path).astype(np.float32)
        score_clean, _ = run_model_on_feat(model, feat, device)

        # Simulate degradation: thêm noise vào CLIP (dims 0:768)
        feat_blur = feat.copy()
        feat_blur[:, :768] += np.random.normal(0, 0.3, feat_blur[:, :768].shape).astype(np.float32)
        score_blurry, _ = run_model_on_feat(model, feat_blur, device)

        deltas.append(score_blurry - score_clean)

    if not deltas:
        print("  [SKIP] Không đủ samples.")
        return None

    mean_delta = np.mean(deltas)
    result = "⚠️  SHORTCUT CONFIRMED" if mean_delta > 0.10 else "✅  OK"
    print(f"\n[Probe 1] Blur Effect:")
    print(f"  Mean Δscore (blurry − clean): {mean_delta:+.4f}")
    print(f"  Result: {result}")
    print(f"  Diễn giải: Nếu Δ > 0 → model coi blurry = violent (shortcut)")
    return mean_delta


# ─────────────────────────────────────────────────────────────────────────────
# Probe Test 2: HD Violence Score
# ─────────────────────────────────────────────────────────────────────────────

def probe_test_2_hd_violence(model, val_manifest_path, features_dir, device, n_samples=20):
    """
    Violence videos trong dataset thường blurry (CCTV).
    Nếu model shortcut: Violence videos HD (UCF-101 Boxing) → V_score THẤP.

    Trong val manifest, lấy violence samples và kiểm tra mean score.
    So sánh với threshold dự kiến 0.5.
    """
    df = pd.read_csv(val_manifest_path)
    violence_col = get_violence_column(df)
    violence_df = df[df[violence_col] == 1]
    violence_rows = violence_df.sample(n=min(n_samples, len(violence_df)), random_state=42)

    scores = []
    for _, row in violence_rows.iterrows():
        feat_path = resolve_feature_path(row, Path(features_dir))
        if feat_path is None or not feat_path.exists():
            continue
        feat = np.load(feat_path).astype(np.float32)
        score, _ = run_model_on_feat(model, feat, device)
        scores.append(score)

    if not scores:
        print("  [SKIP] Không đủ samples.")
        return None

    mean_score = np.mean(scores)
    result = "⚠️  POSSIBLE SHORTCUT" if mean_score < 0.40 else "✅  OK"
    print(f"\n[Probe 2] Violence Mean Score:")
    print(f"  Mean V_score trên {len(scores)} violence videos: {mean_score:.4f}")
    print(f"  Result: {result}")
    print(f"  Diễn giải: Nếu score < 0.40 → model không nhận ra violence (shortcut likely)")
    return mean_score


# ─────────────────────────────────────────────────────────────────────────────
# Probe Test 3: Attention Entropy
# ─────────────────────────────────────────────────────────────────────────────

def probe_test_3_attention_entropy(model, val_manifest_path, features_dir, device, n_samples=30):
    """
    Nếu model shortcut quality:
    - Attention sẽ phân tán đều (không focus vào action frames)
    - Entropy ratio cao (gần 1.0)

    Model học đúng:
    - Attention tập trung vào frames có hành vi đánh nhau
    - Entropy ratio thấp hơn (có selective focus)
    """
    df = pd.read_csv(val_manifest_path)
    violence_col = get_violence_column(df)
    violence_df = df[df[violence_col] == 1]
    rows = violence_df.sample(n=min(n_samples, len(violence_df)), random_state=99)

    entropy_ratios = []
    for _, row in rows.iterrows():
        feat_path = resolve_feature_path(row, Path(features_dir))
        if feat_path is None or not feat_path.exists():
            continue
        feat = np.load(feat_path).astype(np.float32)
        _, v_attn = run_model_on_feat(model, feat, device)

        T = len(v_attn)
        max_entropy = np.log(T)
        entropy = -(v_attn * np.log(v_attn + 1e-8)).sum()
        entropy_ratios.append(entropy / max_entropy)

    if not entropy_ratios:
        print("  [SKIP] Không đủ samples.")
        return None

    mean_ratio = np.mean(entropy_ratios)
    result = "⚠️  ATTENTION FLAT (shortcut possible)" if mean_ratio > 0.85 else "✅  FOCUSED"
    print(f"\n[Probe 3] Attention Entropy Ratio:")
    print(f"  Mean entropy ratio: {mean_ratio:.4f}")
    print(f"  Result: {result}")
    print(f"  Diễn giải: ratio→1.0 = attention phẳng đều (model không focus hành động)")
    return mean_ratio


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model_weight',    required=True)
    parser.add_argument('--val_manifest',    required=True)
    parser.add_argument('--features_dir',    required=True)
    parser.add_argument('--device', default='cuda' if torch.cuda.is_available() else 'cpu')
    parser.add_argument('--n_samples', type=int, default=20)
    args = parser.parse_args()

    device = torch.device(args.device)

    # Load model
    logging.info(f"Loading model from {args.model_weight}...")
    model = TaskGatedModelV6(clip_dim=768, d_model=256).to(device)
    ckpt = torch.load(args.model_weight, map_location=device, weights_only=False)
    state = ckpt.get('model_state_dict', ckpt.get('model_state', ckpt))
    model.load_state_dict(state, strict=False)
    model.eval()

    print("\n" + "="*60)
    print("  V_GATE SHORTCUT PROBE TESTS — V6.1")
    print("="*60)
    print("Mục đích: Xác nhận shortcut learning trước khi áp dụng VideoQualityAugmentor")

    r1 = probe_test_1_blur_effect(
        model, args.val_manifest, args.features_dir, device, args.n_samples
    )
    r2 = probe_test_2_hd_violence(
        model, args.val_manifest, args.features_dir, device, args.n_samples
    )
    r3 = probe_test_3_attention_entropy(
        model, args.val_manifest, args.features_dir, device, args.n_samples * 2
    )

    print("\n" + "="*60)
    print("  SUMMARY")
    print("="*60)
    fails = sum([
        r1 is not None and r1 > 0.10,
        r2 is not None and r2 < 0.40,
        r3 is not None and r3 > 0.85,
    ])
    if fails == 3:
        print("  ❌  CẢ 3 TEST FAIL — Shortcut nghiêm trọng")
        print("  → aug_prob=0.5 là BẮT BUỘC")
    elif fails > 0:
        print(f"  ⚠️   {fails}/3 TEST FAIL — Shortcut một phần")
        print("  → aug_prob=0.3 được khuyến nghị")
    else:
        print("  ✅  TẤT CẢ PASS — Model đang học đúng hành vi")
        print("  → Quality aug vẫn nên dùng để tổng quát hóa tốt hơn (aug_prob=0.2)")
    print("="*60)


if __name__ == '__main__':
    main()
