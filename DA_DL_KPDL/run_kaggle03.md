# RUN KAGGLE 03 - SESSION 3 (V7 VideoMAE + LoRA)

Ngay cap nhat: 2026-05-05

Pham vi file nay:
- Chi danh cho SESSION 3 (V7 video-native).
- Chi chay sau khi SESSION 2 (`run_kaggle02.md`) da xong va da co:
  - `manifests_v6/train_manifest.csv`, `val_manifest.csv`, `test_manifest.csv`
  - `features_v6/features_manifest.csv`

---

## Cell S3.0 - Path Profile + Model Source
Muc tieu: gom tat ca path dung chung vao 1 cell de giam loi.

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

def pick_manifest_dir():
    cands = [Path("/kaggle/working/manifests_v6")]
    cands += sorted(Path("/kaggle/input").glob("*/manifests_v6"))
    cands += sorted(Path("/kaggle/input").glob("*/*/manifests_v6"))
    for p in cands:
        if p.exists():
            return p
    return None

# Path ban da dung o Session 2
FEATURES_DIR = Path("/kaggle/input/datasets/caoqucph/ferurev6/kaggle/working/features_v6")
if not FEATURES_DIR.exists():
    FEATURES_DIR = pick_dir("features_v6")

MANIFESTS_V6_DIR = pick_manifest_dir()
V7_MANIFESTS_DIR = Path("/kaggle/working/manifests_v7_video")
V7_WEIGHTS_DIR = Path("/kaggle/working/trong_so_v7")
REPO_DIR = Path("/kaggle/working/DA_DL_KPDL")

# Neu internet OFF, doi MODEL_NAME thanh local HF snapshot path
# vi du: "/kaggle/input/videomae-small-finetuned-ssv2"
MODEL_NAME = "MCG-NJU/videomae-small-finetuned-ssv2"

if FEATURES_DIR is None:
    raise FileNotFoundError("Khong tim thay features_v6")
if MANIFESTS_V6_DIR is None:
    raise FileNotFoundError("Khong tim thay manifests_v6")

V7_MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)
V7_WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

print("FEATURES_DIR     =", FEATURES_DIR)
print("MANIFESTS_V6_DIR =", MANIFESTS_V6_DIR)
print("V7_MANIFESTS_DIR =", V7_MANIFESTS_DIR)
print("V7_WEIGHTS_DIR   =", V7_WEIGHTS_DIR)
print("MODEL_NAME       =", MODEL_NAME)
print("REPO_DIR exists  =", REPO_DIR.exists())
```

---

## Cell S3.1 - Precheck Script + Input Files
Chan som loi thieu file truoc khi train.

```python
from pathlib import Path

req = [
    REPO_DIR / "scripts/prepare_video_manifests_v7.py",
    REPO_DIR / "scripts/train_v7_videomae_lora.py",
    REPO_DIR / "scripts/calibrate_v7.py",
    REPO_DIR / "scripts/evaluate_v7.py",
    FEATURES_DIR / "features_manifest.csv",
    MANIFESTS_V6_DIR / "train_manifest.csv",
    MANIFESTS_V6_DIR / "val_manifest.csv",
    MANIFESTS_V6_DIR / "test_manifest.csv",
]
missing = [str(p) for p in req if not p.exists()]
if missing:
    raise FileNotFoundError("Missing required files:\\n- " + "\\n- ".join(missing))

print("PRECHECK PASS")
```

---

## Cell S3.2 - Dependency Check (VideoMAE)
Chi can chay pip neu cell nay bao missing.

```python
import importlib

mods = ["torch", "torchvision", "cv2", "numpy", "pandas", "sklearn", "tqdm", "transformers"]
missing = []
for m in mods:
    try:
        importlib.import_module(m)
    except Exception:
        missing.append(m)

print("missing_modules =", missing)
```

Neu `missing_modules` khac rong:

```python
!pip -q install -r /kaggle/working/DA_DL_KPDL/requirements-kaggle.txt
```

---

## Cell S3.3 - Build V7 Video Manifests
Map nguoc tu split V6 sang `video_path` cho train raw video.

```python
!python scripts/prepare_video_manifests_v7.py \
  --split_manifest_dir "{MANIFESTS_V6_DIR}" \
  --features_manifest "{FEATURES_DIR}/features_manifest.csv" \
  --output_dir "{V7_MANIFESTS_DIR}"
```

---

## Cell S3.4 - Audit V7 Manifest Coverage (Bat buoc)
Neu `missing_video_path > 0` hoac `missing_video_file > 0` thi NO-GO.

```python
import pandas as pd
from pathlib import Path

def resolve_feature(raw_path: str):
    p = Path(str(raw_path).strip())
    if p.is_absolute() and p.exists():
        return p
    cands = [
        FEATURES_DIR / p,
        V7_MANIFESTS_DIR / p,
        MANIFESTS_V6_DIR / p,
        Path("/kaggle/working/artifacts") / p,
    ]
    for c in cands:
        if c.exists():
            return c
    return None

def resolve_video(raw_path: str, manifest_path: Path):
    p = Path(str(raw_path).strip())
    if p.is_absolute() and p.exists():
        return p
    cands = [
        manifest_path.parent / p,
        FEATURES_DIR / p,
        MANIFESTS_V6_DIR / p,
        Path("/kaggle/working/artifacts") / p,
    ]
    for c in cands:
        if c.exists():
            return c
    return None

for split in ["train", "val", "test"]:
    p = V7_MANIFESTS_DIR / f"{split}_video_manifest.csv"
    assert p.exists(), f"Missing {p}"
    df = pd.read_csv(p)
    assert "video_path" in df.columns and "feature_path" in df.columns and "violence" in df.columns

    missing_video_path = int((df["video_path"].fillna("").astype(str).str.strip() == "").sum())
    missing_video_file = 0
    for vp in df["video_path"].astype(str):
        if resolve_video(vp, p) is None:
            missing_video_file += 1
    missing_feat_file = 0
    for rp in df["feature_path"].astype(str):
        if resolve_feature(rp) is None:
            missing_feat_file += 1

    print(
        f"[{split}] rows={len(df)} | "
        f"missing_video_path={missing_video_path} | "
        f"missing_video_file={missing_video_file} | "
        f"missing_feature_file={missing_feat_file}"
    )
```

---

## Cell S3.5 - Preload VideoMAE Checkpoint (Khuyen nghi)
Cell nay test kha nang load pretrained truoc khi train lau.

```python
from transformers import VideoMAEModel

_ = VideoMAEModel.from_pretrained(MODEL_NAME)
print("VideoMAE pretrained load OK")
```

---

## Cell S3.5b - Smoke Test LoRA Compatibility (Khuyen nghi manh)
Bat loi som cac van de wrapper (vd: `LoRALinear` khong tuong thich cach goi `.weight` cua transformers).

```python
import torch
import importlib
import src.models.v7_videomae_lora as v7mod

# Neu vua overwrite file code, reload de tranh dung ban cache trong kernel
importlib.reload(v7mod)
LoRALinear = v7mod.LoRALinear
V7Config = v7mod.V7Config
VideoModerationV7 = v7mod.VideoModerationV7

assert hasattr(LoRALinear, "weight"), "LoRALinear chua co property weight -> code tren Kaggle chua duoc sync ban fix"
print("LoRALinear has weight property: OK")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
cfg = V7Config(model_name="MCG-NJU/videomae-small-finetuned-ssv2", lora_r=8, lora_alpha=16, lora_dropout=0.05, lora_last_n_layers=4)
model = VideoModerationV7(cfg).to(device).eval()

x = torch.randn(1, 16, 3, 224, 224, device=device)
aux = torch.zeros(1, 7, device=device)
with torch.no_grad():
    v, s, n = model(x, aux)
print("SMOKE PASS", v.shape, s.shape, n.shape)
```

---

## Cell S3.6 - Train V7 (VideoMAE-Small + LoRA)
Preset an toan cho Kaggle T4, dong thoi hop ly voi huong chong shortcut.

```python
!python scripts/train_v7_videomae_lora.py \
  --train_manifest "{V7_MANIFESTS_DIR}/train_video_manifest.csv" \
  --val_manifest "{V7_MANIFESTS_DIR}/val_video_manifest.csv" \
  --features_dir "{FEATURES_DIR}" \
  --output_dir "{V7_WEIGHTS_DIR}" \
  --model_name "{MODEL_NAME}" \
  --num_frames 16 --image_size 224 \
  --batch_size 2 --grad_accum_steps 8 \
  --epochs 20 --patience 6 \
  --lr_lora 3e-4 --lr_head 1e-3 \
  --lora_r 8 --lora_alpha 16 --lora_dropout 0.05 --lora_last_n_layers 4 \
  --violence_pos_weight -1 --sampler_pos_weight -1 \
  --violence_label_smoothing 0.02 \
  --quality_aug_prob 0.35 \
  --quality_blur_prob 0.35 --quality_noise_prob 0.35 --quality_jpeg_prob 0.35 \
  --quality_noise_std_min 0.01 --quality_noise_std_max 0.06 \
  --quality_jpeg_qmin 25 --quality_jpeg_qmax 55 \
  --lambda_s 0.3 --lambda_n 0.3 --min_teacher_coverage 0.8 \
  --sn_topk_ratio 0.2 --sn_topk_min 3 \
  --amp
```

Neu OOM, giam VRAM theo thu tu:
1. `--batch_size 1`
2. `--grad_accum_steps 16`
3. `--num_workers 1`

---

## Cell S3.7 - Calibrate V7 Thresholds (VAL)

```python
!python scripts/calibrate_v7.py \
  --val_manifest "{V7_MANIFESTS_DIR}/val_video_manifest.csv" \
  --features_dir "{FEATURES_DIR}" \
  --model_weight "{V7_WEIGHTS_DIR}/v7_videomae_lora_best.pth" \
  --v_objective precision_floor --v_precision_min 0.65 \
  --s_quantile 0.98 --n_quantile 0.995 \
  --output_json "{V7_WEIGHTS_DIR}/calibration_v7.json" \
  --batch_size 2 --num_workers 2 --num_frames 16 --image_size 224
```

---

## Cell S3.8 - Evaluate V7 (TEST)
Doc threshold tu calibration JSON de tranh nhap tay sai.

```python
!python scripts/evaluate_v7.py \
  --test_manifest "{V7_MANIFESTS_DIR}/test_video_manifest.csv" \
  --features_dir "{FEATURES_DIR}" \
  --model_weight "{V7_WEIGHTS_DIR}/v7_videomae_lora_best.pth" \
  --calibration_json "{V7_WEIGHTS_DIR}/calibration_v7.json" \
  --batch_size 2 --num_workers 2 --num_frames 16 --image_size 224
```

---

## Cell S3.9 - Pack V7 Weight De Tai Ve

```python
from pathlib import Path
import zipfile
import hashlib
from IPython.display import FileLink, display

weights_dir = Path(V7_WEIGHTS_DIR)
out_zip = Path("/kaggle/working/v7_weights_only.zip")
needed = ["v7_videomae_lora_best.pth"]

missing = [n for n in needed if not (weights_dir / n).exists()]
if missing:
    raise FileNotFoundError("Thieu V7 weights:\\n- " + "\\n- ".join(missing))

if out_zip.exists():
    out_zip.unlink()

with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for name in needed:
        fp = weights_dir / name
        zf.write(fp, arcname=f"trong_so_v7/{name}")

sha256 = hashlib.sha256(out_zip.read_bytes()).hexdigest()
print(f"Created: {out_zip}")
print(f"Size MB: {out_zip.stat().st_size / (1024 * 1024):.2f}")
print(f"SHA256 : {sha256}")
display(FileLink(str(out_zip)))
```

---

## GO / NO-GO Nhanh
- GO neu:
  - Cell S3.4 khong con missing video/feature path
  - Cell S3.6 train on dinh, co `v7_videomae_lora_best.pth`
  - Cell S3.7 + S3.8 chay het
- NO-GO neu:
  - manifest map sai `video_path`
  - `VideoMAEModel.from_pretrained` fail do internet/cache
  - train bi OOM lien tuc du da giam batch
