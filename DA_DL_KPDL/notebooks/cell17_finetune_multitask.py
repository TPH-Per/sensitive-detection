"""
Cell 17: Multitask Moderation Fine-tuning
=========================================
Kết hợp CLIP + SwAV + Optical Flow → 3 Task Tokens (V, S, N) → Phân loại

Điều kiện tiên quyết:
  ✅ Cell 1-5 đã chạy → tạo labels + manifests
  ✅ Cell 14/15/15b đã khôi phục → features .npy có sẵn
  ✅ Manifest files tồn tại tại /kaggle/working/artifacts/data_prep/manifests/

Tính năng tự động:
  - pos_weight: Class Weights tự tính (Self-harm sẽ nhận trọng số cao)
  - WeightedRandomSampler: Đảm bảo mỗi batch đều có mẫu thiểu số
  - Label Smoothing 0.1: Giảm overfitting
  - Confusion Matrix + F1-Macro: Log chi tiết mỗi epoch
  - Early Stopping patience=5: Dừng sớm nếu model không cải thiện
"""
import os
import subprocess
import sys
from pathlib import Path

import yaml
import pandas as pd

# ═══════════════════════════════════════════════════════════════
# 1. CẤU HÌNH
# ═══════════════════════════════════════════════════════════════
OUTPUT_ROOT   = Path("/kaggle/working/artifacts")
MANIFEST_DIR  = OUTPUT_ROOT / "manifests"         # ← Đúng: output_root/manifests/multitask_*.csv
CONFIG_DIR    = OUTPUT_ROOT / "runtime_configs"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

# Checkpoint SwAV để warm-start (KHÔNG BẮT BUỘC — model sẽ học từ features đã trích xuất)
# Nhưng nếu có, nó sẽ giúp các Transformer layers hội tụ nhanh hơn
RESUME_CKPT = None  # Không cần resume — đây là fine-tuning stage mới

# ═══════════════════════════════════════════════════════════════
# 2. KIỂM TRA ĐIỀU KIỆN TIÊN QUYẾT
# ═══════════════════════════════════════════════════════════════
print("🔍 Kiểm tra điều kiện cho Cell 17:")
ok = True

# Kiểm tra manifests
for name in ["multitask_train.csv", "multitask_val.csv"]:
    p = MANIFEST_DIR / name
    exists = p.exists()
    print(f"  {'✅' if exists else '❌'} {name}")
    if not exists:
        ok = False

# Kiểm tra features có thực sự tồn tại
if ok:
    train_df = pd.read_csv(MANIFEST_DIR / "multitask_train.csv")
    val_df   = pd.read_csv(MANIFEST_DIR / "multitask_val.csv")

    # Đếm labels
    label_cols = ['violence', 'self_harm', 'nsfw']
    existing_labels = [c for c in label_cols if c in train_df.columns]
    if not existing_labels:
        print(f"  ❌ Manifest thiếu cột labels: {label_cols}")
        ok = False
    else:
        print(f"\n  📊 Phân bố dữ liệu Train ({len(train_df)} samples):")
        for col in existing_labels:
            pos = int(train_df[col].sum())
            neg = len(train_df) - pos
            ratio = neg / max(pos, 1)
            print(f"     {col.upper():<10}: pos={pos:>5}  neg={neg:>5}  (ratio 1:{ratio:.1f})")

        print(f"\n  📊 Phân bố dữ liệu Val ({len(val_df)} samples):")
        for col in existing_labels:
            pos = int(val_df[col].sum())
            print(f"     {col.upper():<10}: pos={pos:>5}")

    # Kiểm tra xem ít nhất 1 feature file có tồn tại
    if 'feature_path' in train_df.columns:
        sample_path = str(train_df.iloc[0]['feature_path']).strip()
        # Thử resolve path
        candidates = [
            Path("/kaggle/input") / sample_path,
            Path("/kaggle/working/artifacts") / sample_path,
            Path(sample_path),
        ]
        found = any(c.exists() for c in candidates)
        print(f"\n  {'✅' if found else '❌'} Feature files accessible (sample: {sample_path[:60]}...)")
        if not found:
            ok = False

    # Kiểm tra aux features
    has_aux = 'aux_feature_path' in train_df.columns
    print(f"  {'✅' if has_aux else '⚠️'} Aux features (Optical Flow): {'có' if has_aux else 'không có — model sẽ dùng CLIP only'}")

    # Xác định aux_dim từ dữ liệu thực tế
    aux_dim = 0
    if has_aux:
        sample_aux = str(train_df.iloc[0].get('aux_feature_path', '')).strip()
        if sample_aux:
            for c in [Path("/kaggle/input") / sample_aux, Path("/kaggle/working/artifacts") / sample_aux, Path(sample_aux)]:
                if c.exists():
                    import numpy as np
                    arr = np.load(c)
                    aux_dim = arr.shape[-1] if arr.ndim >= 2 else arr.shape[0]
                    print(f"     → aux_dim detected: {aux_dim}")
                    break

if not ok:
    print("\n❌ DỪNG LẠI — Chạy Cell 1-5 và khôi phục features (14/15/15b) trước!")
else:
    # ═══════════════════════════════════════════════════════════════
    # 3. TẠO RUNTIME CONFIG
    # ═══════════════════════════════════════════════════════════════
    # Detect input_dim từ feature file thực tế
    input_dim = 768  # default CLIP
    if 'feature_path' in train_df.columns:
        import numpy as np
        sample_feat = str(train_df.iloc[0]['feature_path']).strip()
        for c in [Path("/kaggle/input") / sample_feat, Path("/kaggle/working/artifacts") / sample_feat, Path(sample_feat)]:
            if c.exists():
                arr = np.load(c)
                input_dim = arr.shape[-1] if arr.ndim >= 2 else arr.shape[0]
                print(f"\n  🔬 Detected input_dim: {input_dim}")
                break

    finetune_cfg = {
        "inherits": "configs/base.yaml",
        "stage": "finetune_multitask",
        "data": {
            "train_manifest": str(MANIFEST_DIR / "multitask_train.csv"),
            "val_manifest":   str(MANIFEST_DIR / "multitask_val.csv"),
            "frames_per_clip": 64,
        },
        "model": {
            "name": "task_prompted_transformer",
            "input_dim": input_dim,
            "d_model": min(input_dim, 768),  # d_model không nên lớn hơn input
            "aux_dim": aux_dim,
            "n_heads": 8,
            "n_layers": 4,
            "ff_dim": min(input_dim, 768) * 4,
            "dropout": 0.2,
            "qformer_layers": 2,
        },
        "optimizer": {
            "name": "adamw",
            "backbone_lr": 0.00001,   # LR thấp cho Transformer backbone
            "heads_lr": 0.0002,       # LR cao cho V/S/N heads
            "weight_decay": 0.01,
        },
        "target": {
            "epochs": 25,
            "batch_size": 4,
            "grad_accum_steps": 4,     # Effective batch = 4 * 4 = 16
            "label_smoothing": 0.1,
            "decision_threshold": 0.5,
            "early_stopping_patience": 5,
            "use_pos_weight": True,    # ← Class weights tự động
            "pos_weight_cap": 20.0,
            "use_weighted_sampler": True,  # ← Weighted sampling
            "sampler_weight_cap": 10.0,
        },
        "checkpoint": {
            "monitor": "val_f1_macro",
            "mode": "max",
            "save_last": True,
        },
    }

    cfg_path = CONFIG_DIR / "finetune_multitask_kaggle.yaml"
    with open(cfg_path, "w") as f:
        yaml.dump(finetune_cfg, f, default_flow_style=False)

    print(f"\n  📝 Config saved: {cfg_path.name}")
    print(f"     model: task_prompted_transformer")
    print(f"     input_dim={input_dim}, aux_dim={aux_dim}, d_model={min(input_dim, 768)}")
    print(f"     batch_size=4 × grad_accum=4 = effective 16")
    print(f"     pos_weight: ON (auto), weighted_sampler: ON")
    print(f"     label_smoothing: 0.1, early_stopping: 5 epochs")

    # ═══════════════════════════════════════════════════════════════
    # 4. CHẠY TRAINING
    # ═══════════════════════════════════════════════════════════════
    print(f"\n{'='*60}")
    print(f"  🚀 Bắt đầu Cell 17: Multitask Moderation Fine-tuning")
    print(f"{'='*60}")
    print(f"  💡 Theo dõi: F1-Macro, Recall cho từng task (V/S/N)")
    print(f"  💡 Quan trọng nhất: SELF_HARM recall phải > 0\n")

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    cmd = [
        sys.executable, "scripts/train_finetune.py",
        "--config",      str(cfg_path),
        "--data_root",   "/kaggle/input",
        "--output_root", str(OUTPUT_ROOT),
    ]

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, env=env, bufsize=1,
    )

    for line in proc.stdout:
        print(line, end="", flush=True)

    proc.wait()

    if proc.returncode == 0:
        print(f"\n{'='*60}")
        print(f"  ✅ Cell 17 hoàn tất!")
        print(f"  Best checkpoint: {OUTPUT_ROOT}/checkpoints/finetune_multitask_best.pth")
        print(f"  History CSV:     {OUTPUT_ROOT}/metrics/finetune_multitask_history.csv")
        print(f"{'='*60}")
    else:
        print(f"\n❌ Lỗi (exit code {proc.returncode})")
