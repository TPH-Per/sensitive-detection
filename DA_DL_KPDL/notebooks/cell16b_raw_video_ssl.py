"""
Cell 16b-v2: Raw Video SSL (Fixed Architecture)
Áp dụng 5 fixes từ fixcell16b.md:
  Fix #1: Sigmoid + BCEWithLogitsLoss
  Fix #2: Progressive unfreeze (layer4 → layer3 → layer2 → layer1)
  Fix #3: Self-Attention thay Conv1D (RF=16 thay vì 5)
  Fix #5: Projector MLP chống dimensional collapse
  Fix #6: Diagnostic metrics (cosine sim, rank, variance)
"""
import os, subprocess, sys, yaml
from pathlib import Path
import pandas as pd

OUTPUT_ROOT = Path("/kaggle/working/artifacts")
LABELS_ROOT = OUTPUT_ROOT / "data_prep" / "labels"
SWAV_CKPT   = "/kaggle/input/datasets/caoqucph/trong-so/trong_so/ssl_spatial_best.pth"

# 1. Runtime config v2
CONFIG_DIR = OUTPUT_ROOT / "runtime_configs"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

raw_ssl_cfg = {
    "inherits": "configs/base.yaml",
    "stage": "raw_video_ssl_v2",
    "data": {
        "train_labels": str(LABELS_ROOT / "labels_temporal_train.csv"),
        "val_labels":   str(LABELS_ROOT / "labels_temporal_val.csv"),
        "n_frames": 16, "frame_size": 112,
    },
    "model": {
        "backbone": "resnet18",
        "hidden_dim": 512,
        "proj_dim": 256,
        "dropout": 0.3,
    },
    "optimizer": {"name": "adamw", "lr": 0.0005, "weight_decay": 0.01},
    "target": {"epochs": 25, "batch_size": 8, "num_workers": 2, "early_stopping_patience": 8},
    "checkpoint": {"monitor": "val_loss", "mode": "min", "save_last": True},
}
cfg_path = CONFIG_DIR / "raw_video_ssl_v2_kaggle.yaml"
with open(cfg_path, "w") as f:
    yaml.dump(raw_ssl_cfg, f, default_flow_style=False)

# 2. Kiểm tra
print("🔍 Kiểm tra điều kiện:")
ok = True
for p in [LABELS_ROOT/"labels_temporal_train.csv", LABELS_ROOT/"labels_temporal_val.csv", Path(SWAV_CKPT)]:
    e = p.exists()
    print(f"  {'✅' if e else '❌'} {p.name}")
    if not e: ok = False

if not ok:
    print("\n❌ Thiếu file. Chạy lại Cell 1-5 trước.")
else:
    df = pd.read_csv(LABELS_ROOT / "labels_temporal_train.csv")
    n = (df['media_type']=='video').sum() if 'media_type' in df.columns else len(df)
    print(f"\n  📊 Train: {n} videos | Config: {cfg_path.name}")
    print("  🔧 Fixes: Sigmoid/BCE, Progressive Unfreeze, Self-Attention, Projector, Diagnostics")

    # 3. Chạy
    print("\n🚀 Cell 16b-v2: Raw Video SSL (Fixed)...")
    print("💡 Xem Diagnostics để biết backbone có bị collapse không\n")

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    cmd = [sys.executable, "scripts/train_raw_video_ssl.py",
           "--config", str(cfg_path),
           "--data_root", "/kaggle/input",
           "--output_root", str(OUTPUT_ROOT),
           "--resume", SWAV_CKPT]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, env=env, bufsize=1)
    for line in proc.stdout:
        print(line, end="", flush=True)
    proc.wait()

    if proc.returncode == 0:
        print("\n✅ Cell 16b-v2 hoàn tất!")
    else:
        print(f"\n❌ Lỗi (code {proc.returncode})")
