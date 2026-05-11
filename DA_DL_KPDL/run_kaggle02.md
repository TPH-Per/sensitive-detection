# RUN KAGGLE 02 - SESSION 2 (ON DINH)

Ngay cap nhat: 2026-05-05

Pham vi file nay:
- Chi danh cho SESSION 2 (tu Cell 6 den Cell 8) cua nhanh V6.1.
- Khong dung cac file nhanh cu V5.x nhu `manifests/multitask_*.csv`, `proxy_*.csv`.

---

## Cell S2.0 - Path Profile (bat buoc)
Muc tieu: giam loi sai path khi du lieu nam o `/kaggle/input` hoac `/kaggle/working`.

```python
from pathlib import Path

def pick_dir(name: str):
    cands = [Path(f"/kaggle/working/{name}")]
    cands += sorted(Path("/kaggle/input").glob(f"*/{name}"))
    cands += sorted(Path("/kaggle/input").glob(f"*/*/{name}"))
    for p in cands:
        if p.exists():
            return p
    return None

# === PATH BAN DA CUNG CAP ===
FEATURES_DIR = Path("/kaggle/input/datasets/caoqucph/ferurev6/kaggle/working/features_v6")
GORE_WEIGHT_SRC = Path("/kaggle/input/datasets/caoqucph/trong-sov6/trongsoV6/gore_backup/kaggle/working/trong_so/gore_detector_v6_best.pth")
NSFW_WEIGHT_SRC = Path("/kaggle/input/datasets/caoqucph/trong-sov6/trongsoV6/nsfw_backup/kaggle/working/trong_so/nsfw_classifier_v6_best.pth")
SELFHARM_WEIGHT_SRC = Path("/kaggle/input/datasets/caoqucph/trong-sov6/trongsoV6/selfharm_backup/kaggle/working/trong_so/selfharm_detector_v6_best.pth")
YOLO_WEIGHT_SRC = Path("/kaggle/input/datasets/caoqucph/trong-sov6/trongsoV6/yolo_backup_epoch100/kaggle/working/trong_so/yolov8_weapon_v6_best.pt")

# Fallback neu duong dan tren khong ton tai
if not FEATURES_DIR.exists():
    FEATURES_DIR = pick_dir("features_v6")

V6_WEIGHTS_DIR = Path("/kaggle/working/trong_so")
MANIFESTS_DIR = Path("/kaggle/working/manifests_v6")

if FEATURES_DIR is None:
    raise FileNotFoundError("Khong tim thay features_v6 trong /kaggle/working hoac /kaggle/input")

V6_WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

print("FEATURES_DIR   =", FEATURES_DIR)
print("V6_WEIGHTS_DIR =", V6_WEIGHTS_DIR)
print("MANIFESTS_DIR  =", MANIFESTS_DIR)
print("GORE_WEIGHT_SRC    =", GORE_WEIGHT_SRC)
print("NSFW_WEIGHT_SRC    =", NSFW_WEIGHT_SRC)
print("SELFHARM_WEIGHT_SRC=", SELFHARM_WEIGHT_SRC)
print("YOLO_WEIGHT_SRC    =", YOLO_WEIGHT_SRC)
```

---

## Cell S2.1 - Precheck tai san Session 1
Dam bao da co du feature + dong bo 4 backup weights ve `/kaggle/working/trong_so`.

```python
from pathlib import Path
import shutil

req = [
    Path(FEATURES_DIR) / "features_manifest.csv",
    Path("/kaggle/working/DA_DL_KPDL/scripts/prepare_data_v6.py"),
    Path("/kaggle/working/DA_DL_KPDL/scripts/train_e2e_v6.py"),
    Path("/kaggle/working/DA_DL_KPDL/scripts/calibrate_v6.py"),
    Path("/kaggle/working/DA_DL_KPDL/scripts/evaluate_v6.py"),
    GORE_WEIGHT_SRC,
    NSFW_WEIGHT_SRC,
    SELFHARM_WEIGHT_SRC,
    YOLO_WEIGHT_SRC,
]

missing = [str(p) for p in req if not p.exists()]
if missing:
    raise FileNotFoundError("Missing required files:\\n- " + "\\n- ".join(missing))

# Copy backup experts + yolo vao working cho dong nhat
copies = [
    (GORE_WEIGHT_SRC, V6_WEIGHTS_DIR / "gore_detector_v6_best.pth"),
    (NSFW_WEIGHT_SRC, V6_WEIGHTS_DIR / "nsfw_classifier_v6_best.pth"),
    (SELFHARM_WEIGHT_SRC, V6_WEIGHTS_DIR / "selfharm_detector_v6_best.pth"),
    (YOLO_WEIGHT_SRC, V6_WEIGHTS_DIR / "yolov8_weapon_v6_best.pt"),
]
for src, dst in copies:
    shutil.copy2(src, dst)
    print(f"Copied: {src} -> {dst}")

print("PRECHECK PASS")
```

---

## Cell 6 - Tao manifest split 70/15/15

```python
!python scripts/prepare_data_v6.py \
  --features_dir "{FEATURES_DIR}" \
  --output_dir "{MANIFESTS_DIR}" \
  --val_ratio 0.15 --test_ratio 0.15 --seed 42
```

---

## Cell 6.1 - Audit manifest truoc train
Cell nay chan som loi path + kiem tra `video_path` coverage.

```python
import pandas as pd
from pathlib import Path

FEATURES_DIR = Path(FEATURES_DIR)
MANIFEST_DIR = Path(MANIFESTS_DIR)

def resolve_feature_path(raw_path: str, manifest_dir: Path):
    p = Path(str(raw_path).strip())
    if p.is_absolute() and p.exists():
        return p
    cands = [
        FEATURES_DIR / p,
        manifest_dir / p,
        Path("/kaggle/working/artifacts") / p,
        Path("/kaggle/working/DA_DL_KPDL") / p,
    ]
    for c in cands:
        if c.exists():
            return c
    return None

for split in ["train", "val", "test"]:
    mp = MANIFEST_DIR / f"{split}_manifest.csv"
    assert mp.exists(), f"Missing {mp}"
    df = pd.read_csv(mp)
    assert "feature_path" in df.columns, f"{mp} missing feature_path"

    missing_feat = 0
    for rp in df["feature_path"].astype(str):
        if resolve_feature_path(rp, mp.parent) is None:
            missing_feat += 1

    video_cov = 0.0
    if "video_path" in df.columns:
        video_cov = (df["video_path"].fillna("").astype(str).str.strip() != "").mean()

    print(f"[{split}] rows={len(df)} | missing_feature_path={missing_feat} | video_path_coverage={video_cov:.3f}")
```

Neu `missing_feature_path > 0` thi dung lai va sua path truoc khi train.

---

## Cell 7 (optional) - Ablation T nhanh
Khuyen nghi chay neu ban muon chot lai `temperature`.

```python
!python scripts/train_e2e_v6.py \
  --train_manifest "{MANIFESTS_DIR}/train_manifest.csv" \
  --val_manifest "{MANIFESTS_DIR}/val_manifest.csv" \
  --features_dir "{FEATURES_DIR}" \
  --output_dir /kaggle/working/ablation_T \
  --epochs 20 --ablation
```

---

## Cell 7b - Train full V6.1
Lenh duoi day dung config hien tai de giam shortcut CLIP va giu S/N theo event.

```python
!python scripts/train_e2e_v6.py \
  --train_manifest "{MANIFESTS_DIR}/train_manifest.csv" \
  --val_manifest "{MANIFESTS_DIR}/val_manifest.csv" \
  --features_dir "{FEATURES_DIR}" \
  --output_dir "{V6_WEIGHTS_DIR}" \
  --temperature 2.0 \
  --epochs 50 --lambda_dist 0.5 --lambda_ent 0.1 --warmup_epochs 5 --patience 10 \
  --sn_pooling topk_noisy_or --sn_topk_ratio 0.2 --sn_topk_min 3 \
  --v_clip_scale 0.35 --s_clip_scale 0.45 --n_clip_scale 0.65 \
  --violence_pos_weight 6 --sampler_pos_weight 6
```

---

## Cell 7.5 - Calibrate tren val

```python
!python scripts/calibrate_v6.py \
  --val_manifest "{MANIFESTS_DIR}/val_manifest.csv" \
  --features_dir "{FEATURES_DIR}" \
    --model_weight "{V6_WEIGHTS_DIR}/task_gated_v6_best.pth" \
    --output_json "{V6_WEIGHTS_DIR}/calibration_v6.json"
```

---

## Cell 8 - Final evaluate tren test
Dung calibration JSON tu Cell 7.5, khong nhap tay threshold.

```python
!python scripts/evaluate_v6.py \
  --test_manifest "{MANIFESTS_DIR}/test_manifest.csv" \
  --features_dir "{FEATURES_DIR}" \
    --model_weight "{V6_WEIGHTS_DIR}/task_gated_v6_best.pth" \
    --calibration_json "{V6_WEIGHTS_DIR}/calibration_v6.json"
```

---

## Cell 8.5 - Dong goi trong so de tai ve

```python
from pathlib import Path
import zipfile
import hashlib
from IPython.display import FileLink, display

weights_dir = Path(globals().get("V6_WEIGHTS_DIR", "/kaggle/working/trong_so"))
out_zip = Path("/kaggle/working/v6_weights_only.zip")

needed = [
    "yolov8_weapon_v6_best.pt",
    "gore_detector_v6_best.pth",
    "selfharm_detector_v6_best.pth",
    "nsfw_classifier_v6_best.pth",
    "task_gated_v6_best.pth",
]

missing = [n for n in needed if not (weights_dir / n).exists()]
if missing:
    raise FileNotFoundError("Thieu trong so:\\n- " + "\\n- ".join(missing))

if out_zip.exists():
    out_zip.unlink()

with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for name in needed:
        fp = weights_dir / name
        zf.write(fp, arcname=f"trong_so/{name}")

sha256 = hashlib.sha256(out_zip.read_bytes()).hexdigest()
print(f"Created: {out_zip}")
print(f"Size MB: {out_zip.stat().st_size / (1024 * 1024):.2f}")
print(f"SHA256 : {sha256}")
display(FileLink(str(out_zip)))
```

---

## GO/NO-GO nhanh truoc khi sang V7
- GO neu: Cell 6.1 khong con `missing_feature_path`, Cell 7b train on dinh, Cell 7.5 + Cell 8 chay het.
- NO-GO neu: mat file feature, NaN loss, hoac model weight khong sinh ra o `{V6_WEIGHTS_DIR}`.
