# Walkthrough: Cập nhật Logging & Sửa OOM cho Pipeline V5.2

## Tổng quan
Cập nhật toàn bộ pipeline huấn luyện để:
1. In log thời gian thực mỗi epoch cho **tất cả** các stage
2. Sửa lỗi **CUDA OutOfMemory** trên Kaggle T4 (15GB VRAM)

---

## Thay đổi đã thực hiện

### 1. Sửa OOM (Critical)

#### [proxy_efficientnet.yaml](file:///d:/python/DA_DL_KPDL/configs/proxy_efficientnet.yaml)
- `batch_size`: 32 → **16**
- Lý do: Mỗi mẫu video có 8 frame. batch=32 × 8 = 256 ảnh cùng lúc → vượt 15GB VRAM

```diff:proxy_efficientnet.yaml
inherits: configs/base.yaml
stage: proxy_efficientnet

data:
  train_manifest: manifests/proxy_train.csv
  val_manifest: manifests/proxy_val.csv
  test_manifest: manifests/proxy_test.csv
  image_size: 224

model:
  name: efficientnet_b0
  pretrained: true

optimizer:
  name: adamw
  lr: 0.0003
  weight_decay: 0.01

target:
  epochs: 12
  batch_size: 32
  label_smoothing: 0.05
  early_stopping_patience: 3

checkpoint:
  monitor: val_recall_risky
  mode: max
===
inherits: configs/base.yaml
stage: proxy_efficientnet

data:
  train_manifest: manifests/proxy_train.csv
  val_manifest: manifests/proxy_val.csv
  test_manifest: manifests/proxy_test.csv
  image_size: 224

model:
  name: efficientnet_b0
  pretrained: true

optimizer:
  name: adamw
  lr: 0.0003
  weight_decay: 0.01

target:
  epochs: 12
  batch_size: 16
  label_smoothing: 0.05
  early_stopping_patience: 3

checkpoint:
  monitor: val_recall_risky
  mode: max
```

#### [proxy_trainer.py](file:///d:/python/DA_DL_KPDL/src/training/proxy_trainer.py) — Chunked Forward
- Thay vì đẩy tất cả frame vào GPU cùng lúc, chia thành nhóm 32 frame/lần
- Phòng trường hợp batch_size bị set cao bất ngờ

```diff:proxy_trainer.py
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, precision_score, recall_score
from torch.utils.data import DataLoader
from torchvision import transforms

from src.data.image_manifest_dataset import ImageManifestDataset
from src.data.proxy_array_dataset import ProxyArrayDataset
from src.models.proxy_efficientnet import build_proxy_efficientnet


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def _save_ckpt(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, path)


def _build_dataset(manifest_path: Path, data_root: Path, transform):
    import pandas as pd

    header = pd.read_csv(manifest_path, nrows=0).columns.tolist()
    if 'array_path' in header:
        return ProxyArrayDataset(manifest_path, data_root, transform=transform)
    return ImageManifestDataset(manifest_path, data_root, transform=transform)


def _forward_proxy_logits(model: nn.Module, x: torch.Tensor) -> torch.Tensor:
    if x.ndim == 5:
        bsz, time_steps, channels, height, width = x.shape
        logits = model(x.reshape(bsz * time_steps, channels, height, width))
        logits = logits.view(bsz, time_steps, -1).mean(dim=1)
        return logits
    return model(x)


def train_proxy_stage(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    opt_cfg = config.get('optimizer', {})

    _set_seed(int(project_cfg.get('seed', 42)))

    image_size = int(data_cfg.get('image_size', 224))
    train_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(0.2, 0.2, 0.2, 0.1),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    val_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    train_manifest = Path(data_cfg['train_manifest'])
    val_manifest = Path(data_cfg['val_manifest'])
    train_ds = _build_dataset(train_manifest, data_root, transform=train_tfm)
    val_ds = _build_dataset(val_manifest, data_root, transform=val_tfm)

    batch_size = int(target_cfg.get('batch_size', 32))
    num_workers = int(runtime_cfg.get('num_workers', 4))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin_memory)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    model = build_proxy_efficientnet(num_classes=2, pretrained=bool(config.get('model', {}).get('pretrained', True))).to(device)

    label_smoothing = float(target_cfg.get('label_smoothing', 0.0))
    criterion = nn.CrossEntropyLoss(label_smoothing=label_smoothing)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(opt_cfg.get('lr', 3e-4)),
        weight_decay=float(opt_cfg.get('weight_decay', 0.01)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))

    start_epoch = 1
    best_recall = -1.0
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        model.load_state_dict(state['model_state'])
        optimizer.load_state_dict(state['optimizer_state'])
        scheduler.load_state_dict(state['scheduler_state'])
        start_epoch = int(state.get('epoch', 0)) + 1
        best_recall = float(state.get('best_recall', -1.0))

    history_csv = output_root / 'metrics' / 'proxy_history.csv'
    ckpt_dir = output_root / 'checkpoints'

    epochs = int(target_cfg.get('epochs', 5))
    patience = int(target_cfg.get('early_stopping_patience', 0))
    no_improve_epochs = 0
    best_confusion = {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0}
    for epoch in range(start_epoch, epochs + 1):
        model.train()
        running = 0.0
        n = 0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            logits = _forward_proxy_logits(model, x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            running += loss.item()
            n += 1

        model.eval()
        y_true = []
        y_pred = []
        val_loss = 0.0
        m = 0
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device, non_blocking=True)
                y = y.to(device, non_blocking=True)
                logits = _forward_proxy_logits(model, x)
                loss = criterion(logits, y)
                pred = torch.argmax(logits, dim=1)
                y_true.extend(y.cpu().tolist())
                y_pred.extend(pred.cpu().tolist())
                val_loss += loss.item()
                m += 1

        # positive class recall for risky content (label=1)
        val_recall = recall_score(y_true, y_pred, pos_label=1, zero_division=0)
        val_precision = precision_score(y_true, y_pred, pos_label=1, zero_division=0)
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
        scheduler.step()

        row = {
            'epoch': epoch,
            'train_loss': running / max(n, 1),
            'val_loss': val_loss / max(m, 1),
            'val_recall_risky': val_recall,
            'val_precision_risky': val_precision,
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_recall': best_recall,
        }
        _save_ckpt(ckpt_dir / 'proxy_efficientnet_last.pth', state)

        if val_recall > best_recall:
            best_recall = float(val_recall)
            state['best_recall'] = best_recall
            _save_ckpt(ckpt_dir / 'proxy_efficientnet_best.pth', state)
            best_confusion = {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
            no_improve_epochs = 0
        else:
            no_improve_epochs += 1

        if patience > 0 and no_improve_epochs >= patience:
            break

    summary = {
        'stage': 'proxy_efficientnet',
        'status': 'finished',
        'best_recall_risky': best_recall,
        'best_confusion_matrix': best_confusion,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'proxy_efficientnet_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'proxy_efficientnet_last.pth'),
    }
    (output_root / 'metrics' / 'proxy_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
===
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, precision_score, recall_score
from torch.utils.data import DataLoader
from torchvision import transforms

from src.data.image_manifest_dataset import ImageManifestDataset
from src.data.proxy_array_dataset import ProxyArrayDataset
from src.models.proxy_efficientnet import build_proxy_efficientnet


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def _save_ckpt(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, path)


def _build_dataset(manifest_path: Path, data_root: Path, transform):
    import pandas as pd

    header = pd.read_csv(manifest_path, nrows=0).columns.tolist()
    if 'array_path' in header:
        return ProxyArrayDataset(manifest_path, data_root, transform=transform)
    return ImageManifestDataset(manifest_path, data_root, transform=transform)


def _forward_proxy_logits(model: nn.Module, x: torch.Tensor, max_chunk: int = 32) -> torch.Tensor:
    if x.ndim == 5:
        bsz, time_steps, channels, height, width = x.shape
        flat = x.reshape(bsz * time_steps, channels, height, width)
        # Process in chunks to avoid OOM on Kaggle T4 (15GB VRAM)
        parts = []
        for i in range(0, flat.size(0), max_chunk):
            parts.append(model(flat[i : i + max_chunk]))
        logits = torch.cat(parts, dim=0)
        logits = logits.view(bsz, time_steps, -1).mean(dim=1)
        return logits
    return model(x)


def train_proxy_stage(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    opt_cfg = config.get('optimizer', {})

    _set_seed(int(project_cfg.get('seed', 42)))

    image_size = int(data_cfg.get('image_size', 224))
    train_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(0.2, 0.2, 0.2, 0.1),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    val_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    train_manifest = Path(data_cfg['train_manifest'])
    val_manifest = Path(data_cfg['val_manifest'])
    train_ds = _build_dataset(train_manifest, data_root, transform=train_tfm)
    val_ds = _build_dataset(val_manifest, data_root, transform=val_tfm)

    batch_size = int(target_cfg.get('batch_size', 32))
    num_workers = int(runtime_cfg.get('num_workers', 4))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin_memory)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    model = build_proxy_efficientnet(num_classes=2, pretrained=bool(config.get('model', {}).get('pretrained', True))).to(device)

    label_smoothing = float(target_cfg.get('label_smoothing', 0.0))
    criterion = nn.CrossEntropyLoss(label_smoothing=label_smoothing)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(opt_cfg.get('lr', 3e-4)),
        weight_decay=float(opt_cfg.get('weight_decay', 0.01)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))

    start_epoch = 1
    best_recall = -1.0
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        model.load_state_dict(state['model_state'])
        optimizer.load_state_dict(state['optimizer_state'])
        scheduler.load_state_dict(state['scheduler_state'])
        start_epoch = int(state.get('epoch', 0)) + 1
        best_recall = float(state.get('best_recall', -1.0))

    history_csv = output_root / 'metrics' / 'proxy_history.csv'
    ckpt_dir = output_root / 'checkpoints'

    epochs = int(target_cfg.get('epochs', 5))
    patience = int(target_cfg.get('early_stopping_patience', 0))
    no_improve_epochs = 0
    best_confusion = {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0}
    for epoch in range(start_epoch, epochs + 1):
        model.train()
        running = 0.0
        n = 0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            logits = _forward_proxy_logits(model, x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            running += loss.item()
            n += 1

        model.eval()
        y_true = []
        y_pred = []
        val_loss = 0.0
        m = 0
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device, non_blocking=True)
                y = y.to(device, non_blocking=True)
                logits = _forward_proxy_logits(model, x)
                loss = criterion(logits, y)
                pred = torch.argmax(logits, dim=1)
                y_true.extend(y.cpu().tolist())
                y_pred.extend(pred.cpu().tolist())
                val_loss += loss.item()
                m += 1

        # positive class recall for risky content (label=1)
        val_recall = recall_score(y_true, y_pred, pos_label=1, zero_division=0)
        val_precision = precision_score(y_true, y_pred, pos_label=1, zero_division=0)
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
        scheduler.step()

        train_loss_avg = running / max(n, 1)
        val_loss_avg = val_loss / max(m, 1)
        val_acc = (tn + tp) / max(tn + fp + fn + tp, 1)

        row = {
            'epoch': epoch,
            'train_loss': train_loss_avg,
            'val_loss': val_loss_avg,
            'val_recall_risky': val_recall,
            'val_precision_risky': val_precision,
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        # ── Per-epoch console log ──
        print(f"\n{'='*60}")
        print(f"  [Proxy Gate] Epoch {epoch}/{epochs}")
        print(f"{'='*60}")
        print(f"  Train Loss : {train_loss_avg:.4f}")
        print(f"  Val   Loss : {val_loss_avg:.4f}  (gap: {abs(val_loss_avg - train_loss_avg):.4f})")
        print(f"  Val Accuracy : {val_acc:.4f}")
        print(f"  Val Recall   : {val_recall:.4f}  (risky class)")
        print(f"  Val Precision: {val_precision:.4f}  (risky class)")
        print(f"  Confusion Matrix:")
        print(f"               Pred=Safe  Pred=Risky")
        print(f"    True=Safe   {tn:>7}    {fp:>7}")
        print(f"    True=Risky  {fn:>7}    {tp:>7}")
        print(f"  LR: {optimizer.param_groups[0]['lr']:.2e}")

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_recall': best_recall,
        }
        _save_ckpt(ckpt_dir / 'proxy_efficientnet_last.pth', state)

        if val_recall > best_recall:
            best_recall = float(val_recall)
            state['best_recall'] = best_recall
            _save_ckpt(ckpt_dir / 'proxy_efficientnet_best.pth', state)
            best_confusion = {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
            no_improve_epochs = 0
            print(f"  ★ New Best Recall = {best_recall:.4f} → checkpoint saved")
        else:
            no_improve_epochs += 1
            print(f"  No improvement ({no_improve_epochs}/{patience if patience > 0 else '∞'})")

        if patience > 0 and no_improve_epochs >= patience:
            print(f"\n  ⛔ Early stopping triggered after {no_improve_epochs} epochs without improvement")
            break

    summary = {
        'stage': 'proxy_efficientnet',
        'status': 'finished',
        'best_recall_risky': best_recall,
        'best_confusion_matrix': best_confusion,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'proxy_efficientnet_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'proxy_efficientnet_last.pth'),
    }
    (output_root / 'metrics' / 'proxy_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
```

---

### 2. Thêm Logging cho từng loại model

| File | Stage | Loại Model | Metrics được log mỗi epoch |
|------|-------|------------|---------------------------|
| [proxy_trainer.py](file:///d:/python/DA_DL_KPDL/src/training/proxy_trainer.py) | Cell 10 | Supervised Binary | Train/Val Loss, Accuracy, **Recall**, Precision, Confusion Matrix |
| [nsfw_trainer.py](file:///d:/python/DA_DL_KPDL/src/training/nsfw_trainer.py) | Cell 11 | Supervised Binary | Train/Val Loss, Accuracy, **F1**, Recall, Precision, Confusion Matrix |
| [swav_trainer.py](file:///d:/python/DA_DL_KPDL/src/training/swav_trainer.py) | Cell 12 | SSL (SwAV) | **Contrastive Loss**, KNN Accuracy |
| [temporal_ssl_trainer.py](file:///d:/python/DA_DL_KPDL/src/training/temporal_ssl_trainer.py) | Cell 16 | SSL Pretext | Pretext Loss, **AOT Accuracy**, **Sort Accuracy** |
| [engine.py](file:///d:/python/DA_DL_KPDL/src/training/engine.py) | Cell 17, 18 | Supervised Multitask | Train/Val Loss, **F1-Macro**, Per-task CM (violence/self_harm/nsfw) |

> [!NOTE]
> **YOLO (Cell 13)** không cần sửa — Ultralytics đã tự log mAP/Precision/Recall.

```diff:nsfw_trainer.py
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from torch.utils.data import DataLoader
from torchvision import transforms

from src.data.image_manifest_dataset import ImageManifestDataset
from src.models.proxy_efficientnet import build_proxy_efficientnet


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def _save_ckpt(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, path)


def train_nsfw_stage(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    opt_cfg = config.get('optimizer', {})
    model_cfg = config.get('model', {})

    _set_seed(int(project_cfg.get('seed', 42)))

    image_size = int(data_cfg.get('image_size', 224))
    train_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(0.2, 0.2, 0.2, 0.05),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    eval_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    train_ds = ImageManifestDataset(Path(data_cfg['train_manifest']), data_root, label_col='label', transform=train_tfm)
    val_ds = ImageManifestDataset(Path(data_cfg['val_manifest']), data_root, label_col='label', transform=eval_tfm)

    batch_size = int(target_cfg.get('batch_size', 32))
    num_workers = int(runtime_cfg.get('num_workers', 4))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin_memory)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    model = build_proxy_efficientnet(num_classes=2, pretrained=bool(model_cfg.get('pretrained', False))).to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=float(target_cfg.get('label_smoothing', 0.0)))
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(opt_cfg.get('lr', 3e-4)),
        weight_decay=float(opt_cfg.get('weight_decay', 0.01)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))

    start_epoch = 1
    best_f1 = -1.0
    ckpt_dir = output_root / 'checkpoints'
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        model.load_state_dict(state['model_state'])
        optimizer.load_state_dict(state['optimizer_state'])
        scheduler.load_state_dict(state['scheduler_state'])
        start_epoch = int(state.get('epoch', 0)) + 1
        best_f1 = float(state.get('best_f1', -1.0))

    history_csv = output_root / 'metrics' / 'nsfw_scorer_history.csv'
    epochs = int(target_cfg.get('epochs', 5))
    patience = int(target_cfg.get('early_stopping_patience', 0))
    no_improve_epochs = 0
    best_confusion = {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0}

    for epoch in range(start_epoch, epochs + 1):
        model.train()
        train_loss = 0.0
        train_steps = 0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            train_steps += 1

        model.eval()
        val_loss = 0.0
        val_steps = 0
        y_true = []
        y_pred = []
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device, non_blocking=True)
                y = y.to(device, non_blocking=True)
                logits = model(x)
                loss = criterion(logits, y)
                preds = torch.argmax(logits, dim=1)
                val_loss += loss.item()
                val_steps += 1
                y_true.extend(y.cpu().tolist())
                y_pred.extend(preds.cpu().tolist())

        scheduler.step()
        val_f1 = f1_score(y_true, y_pred, pos_label=1, zero_division=0)
        val_precision = precision_score(y_true, y_pred, pos_label=1, zero_division=0)
        val_recall = recall_score(y_true, y_pred, pos_label=1, zero_division=0)
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()

        row = {
            'epoch': epoch,
            'train_loss': train_loss / max(train_steps, 1),
            'val_loss': val_loss / max(val_steps, 1),
            'val_f1_nsfw': val_f1,
            'val_precision_nsfw': val_precision,
            'val_recall_nsfw': val_recall,
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_f1': best_f1,
        }
        _save_ckpt(ckpt_dir / 'nsfw_scorer_last.pth', state)

        if val_f1 > best_f1:
            best_f1 = float(val_f1)
            state['best_f1'] = best_f1
            _save_ckpt(ckpt_dir / 'nsfw_scorer_best.pth', state)
            best_confusion = {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
            no_improve_epochs = 0
        else:
            no_improve_epochs += 1

        if patience > 0 and no_improve_epochs >= patience:
            break

    summary = {
        'stage': 'nsfw_scorer',
        'status': 'finished',
        'best_f1_nsfw': best_f1,
        'best_confusion_matrix': best_confusion,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'nsfw_scorer_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'nsfw_scorer_last.pth'),
    }
    (output_root / 'metrics' / 'nsfw_scorer_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
===
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from torch.utils.data import DataLoader
from torchvision import transforms

from src.data.image_manifest_dataset import ImageManifestDataset
from src.models.proxy_efficientnet import build_proxy_efficientnet


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def _save_ckpt(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, path)


def train_nsfw_stage(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    opt_cfg = config.get('optimizer', {})
    model_cfg = config.get('model', {})

    _set_seed(int(project_cfg.get('seed', 42)))

    image_size = int(data_cfg.get('image_size', 224))
    train_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(0.2, 0.2, 0.2, 0.05),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    eval_tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    train_ds = ImageManifestDataset(Path(data_cfg['train_manifest']), data_root, label_col='label', transform=train_tfm)
    val_ds = ImageManifestDataset(Path(data_cfg['val_manifest']), data_root, label_col='label', transform=eval_tfm)

    batch_size = int(target_cfg.get('batch_size', 32))
    num_workers = int(runtime_cfg.get('num_workers', 4))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin_memory)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    model = build_proxy_efficientnet(num_classes=2, pretrained=bool(model_cfg.get('pretrained', False))).to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=float(target_cfg.get('label_smoothing', 0.0)))
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(opt_cfg.get('lr', 3e-4)),
        weight_decay=float(opt_cfg.get('weight_decay', 0.01)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))

    start_epoch = 1
    best_f1 = -1.0
    ckpt_dir = output_root / 'checkpoints'
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        model.load_state_dict(state['model_state'])
        optimizer.load_state_dict(state['optimizer_state'])
        scheduler.load_state_dict(state['scheduler_state'])
        start_epoch = int(state.get('epoch', 0)) + 1
        best_f1 = float(state.get('best_f1', -1.0))

    history_csv = output_root / 'metrics' / 'nsfw_scorer_history.csv'
    epochs = int(target_cfg.get('epochs', 5))
    patience = int(target_cfg.get('early_stopping_patience', 0))
    no_improve_epochs = 0
    best_confusion = {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0}

    for epoch in range(start_epoch, epochs + 1):
        model.train()
        train_loss = 0.0
        train_steps = 0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            train_steps += 1

        model.eval()
        val_loss = 0.0
        val_steps = 0
        y_true = []
        y_pred = []
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device, non_blocking=True)
                y = y.to(device, non_blocking=True)
                logits = model(x)
                loss = criterion(logits, y)
                preds = torch.argmax(logits, dim=1)
                val_loss += loss.item()
                val_steps += 1
                y_true.extend(y.cpu().tolist())
                y_pred.extend(preds.cpu().tolist())

        scheduler.step()
        val_f1 = f1_score(y_true, y_pred, pos_label=1, zero_division=0)
        val_precision = precision_score(y_true, y_pred, pos_label=1, zero_division=0)
        val_recall = recall_score(y_true, y_pred, pos_label=1, zero_division=0)
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()

        train_loss_avg = train_loss / max(train_steps, 1)
        val_loss_avg = val_loss / max(val_steps, 1)
        val_acc = (tn + tp) / max(tn + fp + fn + tp, 1)

        row = {
            'epoch': epoch,
            'train_loss': train_loss_avg,
            'val_loss': val_loss_avg,
            'val_f1_nsfw': val_f1,
            'val_precision_nsfw': val_precision,
            'val_recall_nsfw': val_recall,
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        # ── Per-epoch console log ──
        print(f"\n{'='*60}")
        print(f"  [NSFW Scorer] Epoch {epoch}/{epochs}")
        print(f"{'='*60}")
        print(f"  Train Loss : {train_loss_avg:.4f}")
        print(f"  Val   Loss : {val_loss_avg:.4f}  (gap: {abs(val_loss_avg - train_loss_avg):.4f})")
        print(f"  Val Accuracy : {val_acc:.4f}")
        print(f"  Val F1       : {val_f1:.4f}  (nsfw class)")
        print(f"  Val Recall   : {val_recall:.4f}  (nsfw class)")
        print(f"  Val Precision: {val_precision:.4f}  (nsfw class)")
        print(f"  Confusion Matrix:")
        print(f"               Pred=Safe  Pred=NSFW")
        print(f"    True=Safe   {tn:>7}    {fp:>7}")
        print(f"    True=NSFW   {fn:>7}    {tp:>7}")
        print(f"  LR: {optimizer.param_groups[0]['lr']:.2e}")

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_f1': best_f1,
        }
        _save_ckpt(ckpt_dir / 'nsfw_scorer_last.pth', state)

        if val_f1 > best_f1:
            best_f1 = float(val_f1)
            state['best_f1'] = best_f1
            _save_ckpt(ckpt_dir / 'nsfw_scorer_best.pth', state)
            best_confusion = {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
            no_improve_epochs = 0
            print(f"  ★ New Best F1 = {best_f1:.4f} → checkpoint saved")
        else:
            no_improve_epochs += 1
            print(f"  No improvement ({no_improve_epochs}/{patience if patience > 0 else '∞'})")

        if patience > 0 and no_improve_epochs >= patience:
            print(f"\n  ⛔ Early stopping triggered after {no_improve_epochs} epochs without improvement")
            break

    summary = {
        'stage': 'nsfw_scorer',
        'status': 'finished',
        'best_f1_nsfw': best_f1,
        'best_confusion_matrix': best_confusion,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'nsfw_scorer_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'nsfw_scorer_last.pth'),
    }
    (output_root / 'metrics' / 'nsfw_scorer_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
```
```diff:swav_trainer.py
from __future__ import annotations

import csv
import json
import random
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.neighbors import NearestNeighbors
from torch.utils.data import DataLoader
from torchvision import transforms

from src.data.swav_dataset import SwAVMultiCropDataset, SwAVEvalDataset
from src.models.swav_model import SwAVModel


class MultiCropTransform:
    def __init__(self, image_size: int, local_size: int, global_crops: int, local_crops: int) -> None:
        normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        self.global_transform = transforms.Compose(
            [
                transforms.RandomResizedCrop(image_size, scale=(0.5, 1.0)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ColorJitter(0.4, 0.4, 0.2, 0.1),
                transforms.RandomGrayscale(p=0.1),
                transforms.GaussianBlur(kernel_size=23, sigma=(0.1, 2.0)),
                transforms.ToTensor(),
                normalize,
            ]
        )
        self.local_transform = transforms.Compose(
            [
                transforms.RandomResizedCrop(local_size, scale=(0.14, 0.5)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ColorJitter(0.4, 0.4, 0.2, 0.1),
                transforms.RandomGrayscale(p=0.1),
                transforms.ToTensor(),
                normalize,
            ]
        )
        self.global_crops = global_crops
        self.local_crops = local_crops

    def __call__(self, image):
        crops = [self.global_transform(image) for _ in range(self.global_crops)]
        crops.extend(self.local_transform(image) for _ in range(self.local_crops))
        return crops


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def sinkhorn(logits: torch.Tensor, epsilon: float, iterations: int) -> torch.Tensor:
    q = torch.exp(logits / epsilon).t()
    q /= torch.sum(q)
    k, bsz = q.shape

    for _ in range(iterations):
        q /= torch.sum(q, dim=1, keepdim=True)
        q /= k
        q /= torch.sum(q, dim=0, keepdim=True)
        q /= bsz

    q *= bsz
    return q.t()


@torch.no_grad()
def compute_knn_score(model: SwAVModel, train_loader: DataLoader, val_loader: DataLoader, device: torch.device, max_points: int) -> float:
    model.eval()

    def encode(loader: DataLoader):
        embeddings = []
        labels = []
        for x, signatures in loader:
            x = x.to(device, non_blocking=True)
            _, proj, _ = model(x)
            embeddings.append(proj.detach().cpu().numpy())
            labels.extend(list(signatures))
            if max_points > 0 and len(labels) >= max_points:
                break
        if not embeddings:
            return np.zeros((0, 1), dtype=np.float32), []
        arr = np.concatenate(embeddings, axis=0)
        if max_points > 0:
            arr = arr[:max_points]
            labels = labels[:max_points]
        return arr.astype(np.float32), labels

    train_embeddings, train_labels = encode(train_loader)
    val_embeddings, val_labels = encode(val_loader)
    if len(train_labels) == 0 or len(val_labels) == 0:
        return 0.0

    n_neighbors = min(5, len(train_labels))
    knn = NearestNeighbors(n_neighbors=n_neighbors, metric='cosine')
    knn.fit(train_embeddings)
    indices = knn.kneighbors(val_embeddings, return_distance=False)
    preds = []
    for row in indices:
        votes = [train_labels[idx] for idx in row]
        preds.append(Counter(votes).most_common(1)[0][0])
    score = float(np.mean([pred == true for pred, true in zip(preds, val_labels)]))
    return score


def train_swav_stage(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    model_cfg = config.get('model', {})
    target_cfg = config.get('target', {})
    optimizer_cfg = config.get('optimizer', {})

    _set_seed(int(project_cfg.get('seed', 42)))

    image_size = int(data_cfg.get('image_size', 224))
    crops_cfg = data_cfg.get('crops', {})
    global_crops = int(crops_cfg.get('global_crops', 2))
    local_crops = int(crops_cfg.get('local_crops', 4))
    local_size = int(crops_cfg.get('local_size', 96))

    train_transform = MultiCropTransform(image_size=image_size, local_size=local_size, global_crops=global_crops, local_crops=local_crops)
    eval_transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    train_ds = SwAVMultiCropDataset(Path(data_cfg['train_manifest']), data_root, transform=train_transform)
    train_eval_ds = SwAVEvalDataset(Path(data_cfg['train_manifest']), data_root, transform=eval_transform)
    val_eval_ds = SwAVEvalDataset(Path(data_cfg['val_manifest']), data_root, transform=eval_transform)

    batch_size = int(target_cfg.get('batch_size', 16))
    num_workers = int(runtime_cfg.get('num_workers', 4))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin_memory, drop_last=True)
    train_eval_loader = DataLoader(train_eval_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)
    val_eval_loader = DataLoader(val_eval_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    model = SwAVModel(
        backbone_name=str(model_cfg.get('backbone', 'resnet18')),
        projection_dim=int(model_cfg.get('projection_dim', 128)),
        hidden_dim=int(model_cfg.get('hidden_dim', 512)),
        n_prototypes=int(model_cfg.get('n_prototypes', 300)),
    ).to(device)

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(optimizer_cfg.get('lr', 3e-4)),
        weight_decay=float(optimizer_cfg.get('weight_decay', 1e-4)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))

    temperature = float(model_cfg.get('temperature', 0.1))
    epsilon = float(model_cfg.get('epsilon', 0.05))
    sinkhorn_iterations = int(model_cfg.get('sinkhorn_iterations', 3))
    max_knn_points = int(target_cfg.get('max_knn_points', 2000))

    start_epoch = 1
    best_knn = -1.0
    ckpt_dir = output_root / 'checkpoints'
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        model.load_state_dict(state['model_state'])
        optimizer.load_state_dict(state['optimizer_state'])
        scheduler.load_state_dict(state['scheduler_state'])
        start_epoch = int(state.get('epoch', 0)) + 1
        best_knn = float(state.get('best_knn', -1.0))

    history_csv = output_root / 'metrics' / 'ssl_spatial_history.csv'
    epochs = int(target_cfg.get('epochs', 20))
    patience = int(target_cfg.get('early_stopping_patience', 0))
    no_improve_epochs = 0

    for epoch in range(start_epoch, epochs + 1):
        model.train()
        running_loss = 0.0
        steps = 0
        for views in train_loader:
            views = [view.to(device, non_blocking=True) for view in views]
            model.normalize_prototypes()

            outputs = [model(view) for view in views]
            logits = [item[2] for item in outputs]
            n_views = len(logits)
            n_global = min(global_crops, n_views)

            loss = 0.0
            for i in range(n_global):
                assignments = sinkhorn(logits[i].detach(), epsilon=epsilon, iterations=sinkhorn_iterations)
                for j in range(n_views):
                    if i == j:
                        continue
                    loss = loss + torch.mean(torch.sum(-assignments * torch.log_softmax(logits[j] / temperature, dim=1), dim=1))
            loss = loss / max(n_global * max(n_views - 1, 1), 1)

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()

            running_loss += float(loss.item())
            steps += 1

        scheduler.step()
        val_knn = compute_knn_score(model, train_eval_loader, val_eval_loader, device=device, max_points=max_knn_points)

        row = {
            'epoch': epoch,
            'train_loss': running_loss / max(steps, 1),
            'val_knn': val_knn,
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_knn': best_knn,
        }
        torch.save(state, ckpt_dir / 'ssl_spatial_last.pth')

        if val_knn > best_knn:
            best_knn = float(val_knn)
            state['best_knn'] = best_knn
            torch.save(state, ckpt_dir / 'ssl_spatial_best.pth')
            no_improve_epochs = 0
        else:
            no_improve_epochs += 1

        if patience > 0 and no_improve_epochs >= patience:
            break

    summary = {
        'stage': 'ssl_spatial',
        'status': 'finished',
        'best_val_knn': best_knn,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'ssl_spatial_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'ssl_spatial_last.pth'),
    }
    (output_root / 'metrics' / 'ssl_spatial_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
===
from __future__ import annotations

import csv
import json
import random
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.neighbors import NearestNeighbors
from torch.utils.data import DataLoader
from torchvision import transforms

from src.data.swav_dataset import SwAVMultiCropDataset, SwAVEvalDataset
from src.models.swav_model import SwAVModel


class MultiCropTransform:
    def __init__(self, image_size: int, local_size: int, global_crops: int, local_crops: int) -> None:
        normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        self.global_transform = transforms.Compose(
            [
                transforms.RandomResizedCrop(image_size, scale=(0.5, 1.0)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ColorJitter(0.4, 0.4, 0.2, 0.1),
                transforms.RandomGrayscale(p=0.1),
                transforms.GaussianBlur(kernel_size=23, sigma=(0.1, 2.0)),
                transforms.ToTensor(),
                normalize,
            ]
        )
        self.local_transform = transforms.Compose(
            [
                transforms.RandomResizedCrop(local_size, scale=(0.14, 0.5)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ColorJitter(0.4, 0.4, 0.2, 0.1),
                transforms.RandomGrayscale(p=0.1),
                transforms.ToTensor(),
                normalize,
            ]
        )
        self.global_crops = global_crops
        self.local_crops = local_crops

    def __call__(self, image):
        crops = [self.global_transform(image) for _ in range(self.global_crops)]
        crops.extend(self.local_transform(image) for _ in range(self.local_crops))
        return crops


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def sinkhorn(logits: torch.Tensor, epsilon: float, iterations: int) -> torch.Tensor:
    q = torch.exp(logits / epsilon).t()
    q /= torch.sum(q)
    k, bsz = q.shape

    for _ in range(iterations):
        q /= torch.sum(q, dim=1, keepdim=True)
        q /= k
        q /= torch.sum(q, dim=0, keepdim=True)
        q /= bsz

    q *= bsz
    return q.t()


@torch.no_grad()
def compute_knn_score(model: SwAVModel, train_loader: DataLoader, val_loader: DataLoader, device: torch.device, max_points: int) -> float:
    model.eval()

    def encode(loader: DataLoader):
        embeddings = []
        labels = []
        for x, signatures in loader:
            x = x.to(device, non_blocking=True)
            _, proj, _ = model(x)
            embeddings.append(proj.detach().cpu().numpy())
            labels.extend(list(signatures))
            if max_points > 0 and len(labels) >= max_points:
                break
        if not embeddings:
            return np.zeros((0, 1), dtype=np.float32), []
        arr = np.concatenate(embeddings, axis=0)
        if max_points > 0:
            arr = arr[:max_points]
            labels = labels[:max_points]
        return arr.astype(np.float32), labels

    train_embeddings, train_labels = encode(train_loader)
    val_embeddings, val_labels = encode(val_loader)
    if len(train_labels) == 0 or len(val_labels) == 0:
        return 0.0

    n_neighbors = min(5, len(train_labels))
    knn = NearestNeighbors(n_neighbors=n_neighbors, metric='cosine')
    knn.fit(train_embeddings)
    indices = knn.kneighbors(val_embeddings, return_distance=False)
    preds = []
    for row in indices:
        votes = [train_labels[idx] for idx in row]
        preds.append(Counter(votes).most_common(1)[0][0])
    score = float(np.mean([pred == true for pred, true in zip(preds, val_labels)]))
    return score


def train_swav_stage(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    model_cfg = config.get('model', {})
    target_cfg = config.get('target', {})
    optimizer_cfg = config.get('optimizer', {})

    _set_seed(int(project_cfg.get('seed', 42)))

    image_size = int(data_cfg.get('image_size', 224))
    crops_cfg = data_cfg.get('crops', {})
    global_crops = int(crops_cfg.get('global_crops', 2))
    local_crops = int(crops_cfg.get('local_crops', 4))
    local_size = int(crops_cfg.get('local_size', 96))

    train_transform = MultiCropTransform(image_size=image_size, local_size=local_size, global_crops=global_crops, local_crops=local_crops)
    eval_transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    train_ds = SwAVMultiCropDataset(Path(data_cfg['train_manifest']), data_root, transform=train_transform)
    train_eval_ds = SwAVEvalDataset(Path(data_cfg['train_manifest']), data_root, transform=eval_transform)
    val_eval_ds = SwAVEvalDataset(Path(data_cfg['val_manifest']), data_root, transform=eval_transform)

    batch_size = int(target_cfg.get('batch_size', 16))
    num_workers = int(runtime_cfg.get('num_workers', 4))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin_memory, drop_last=True)
    train_eval_loader = DataLoader(train_eval_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)
    val_eval_loader = DataLoader(val_eval_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    model = SwAVModel(
        backbone_name=str(model_cfg.get('backbone', 'resnet18')),
        projection_dim=int(model_cfg.get('projection_dim', 128)),
        hidden_dim=int(model_cfg.get('hidden_dim', 512)),
        n_prototypes=int(model_cfg.get('n_prototypes', 300)),
    ).to(device)

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(optimizer_cfg.get('lr', 3e-4)),
        weight_decay=float(optimizer_cfg.get('weight_decay', 1e-4)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))

    temperature = float(model_cfg.get('temperature', 0.1))
    epsilon = float(model_cfg.get('epsilon', 0.05))
    sinkhorn_iterations = int(model_cfg.get('sinkhorn_iterations', 3))
    max_knn_points = int(target_cfg.get('max_knn_points', 2000))

    start_epoch = 1
    best_knn = -1.0
    ckpt_dir = output_root / 'checkpoints'
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        model.load_state_dict(state['model_state'])
        optimizer.load_state_dict(state['optimizer_state'])
        scheduler.load_state_dict(state['scheduler_state'])
        start_epoch = int(state.get('epoch', 0)) + 1
        best_knn = float(state.get('best_knn', -1.0))

    history_csv = output_root / 'metrics' / 'ssl_spatial_history.csv'
    epochs = int(target_cfg.get('epochs', 20))
    patience = int(target_cfg.get('early_stopping_patience', 0))
    no_improve_epochs = 0

    for epoch in range(start_epoch, epochs + 1):
        model.train()
        running_loss = 0.0
        steps = 0
        for views in train_loader:
            views = [view.to(device, non_blocking=True) for view in views]
            model.normalize_prototypes()

            outputs = [model(view) for view in views]
            logits = [item[2] for item in outputs]
            n_views = len(logits)
            n_global = min(global_crops, n_views)

            loss = 0.0
            for i in range(n_global):
                assignments = sinkhorn(logits[i].detach(), epsilon=epsilon, iterations=sinkhorn_iterations)
                for j in range(n_views):
                    if i == j:
                        continue
                    loss = loss + torch.mean(torch.sum(-assignments * torch.log_softmax(logits[j] / temperature, dim=1), dim=1))
            loss = loss / max(n_global * max(n_views - 1, 1), 1)

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()

            running_loss += float(loss.item())
            steps += 1

        scheduler.step()
        val_knn = compute_knn_score(model, train_eval_loader, val_eval_loader, device=device, max_points=max_knn_points)

        train_loss_avg = running_loss / max(steps, 1)

        row = {
            'epoch': epoch,
            'train_loss': train_loss_avg,
            'val_knn': val_knn,
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        # ── Per-epoch console log (SSL has no labels → use KNN as proxy) ──
        print(f"\n{'='*60}")
        print(f"  [SwAV Spatial SSL] Epoch {epoch}/{epochs}")
        print(f"{'='*60}")
        print(f"  Train Loss (contrastive): {train_loss_avg:.4f}")
        print(f"  Val KNN Accuracy        : {val_knn:.4f}")
        print(f"  LR: {optimizer.param_groups[0]['lr']:.2e}")

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_knn': best_knn,
        }
        torch.save(state, ckpt_dir / 'ssl_spatial_last.pth')

        if val_knn > best_knn:
            best_knn = float(val_knn)
            state['best_knn'] = best_knn
            torch.save(state, ckpt_dir / 'ssl_spatial_best.pth')
            no_improve_epochs = 0
            print(f"  ★ New Best KNN = {best_knn:.4f} → checkpoint saved")
        else:
            no_improve_epochs += 1
            print(f"  No improvement ({no_improve_epochs}/{patience if patience > 0 else '∞'})")

        if patience > 0 and no_improve_epochs >= patience:
            print(f"\n  ⛔ Early stopping triggered after {no_improve_epochs} epochs without improvement")
            break

    summary = {
        'stage': 'ssl_spatial',
        'status': 'finished',
        'best_val_knn': best_knn,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'ssl_spatial_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'ssl_spatial_last.pth'),
    }
    (output_root / 'metrics' / 'ssl_spatial_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
```
```diff:temporal_ssl_trainer.py
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from src.data.temporal_ssl_dataset import TemporalSSLDataset
from src.models.task_prompted_model import TaskPromptedTemporalModel


class TemporalSSLHead(nn.Module):
    def __init__(self, d_model: int = 768) -> None:
        super().__init__()
        self.backbone = TaskPromptedTemporalModel(input_dim=d_model, d_model=d_model, n_heads=8, n_layers=4)
        self.aot_head = nn.Linear(3, 2)
        self.sort_head = nn.Linear(3, 2)

    def forward(self, x: torch.Tensor):
        logits_3 = self.backbone(x)
        aot = self.aot_head(logits_3)
        sort = self.sort_head(logits_3)
        return aot, sort


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def _load_model_weights_flexible(model: nn.Module, checkpoint_state: dict) -> int:
    """Load compatible weights only, supporting optional backbone prefix remapping."""
    if not checkpoint_state:
        return 0

    model_state = model.state_dict()
    compatible = {}

    for key, tensor in checkpoint_state.items():
        if not isinstance(tensor, torch.Tensor):
            continue

        candidate_keys = [key]
        if key.startswith('backbone.'):
            candidate_keys.append(key[len('backbone.') :])
        else:
            candidate_keys.append(f'backbone.{key}')

        for candidate in candidate_keys:
            if candidate in model_state and model_state[candidate].shape == tensor.shape:
                compatible[candidate] = tensor
                break

    if not compatible:
        return 0

    model_state.update(compatible)
    model.load_state_dict(model_state, strict=False)
    return len(compatible)


def train_temporal_ssl(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    stage_name = 'temporal_ssl_pretext'
    seed = int(config.get('project', {}).get('seed', 42))
    _set_seed(seed)

    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    opt_cfg = config.get('optimizer', {})

    train_ds = TemporalSSLDataset(Path(data_cfg['train_manifest']), data_root, int(data_cfg.get('frames_per_clip', 64)))
    val_ds = TemporalSSLDataset(Path(data_cfg['val_manifest']), data_root, int(data_cfg.get('frames_per_clip', 64)))

    loader_kwargs = {
        'batch_size': int(target_cfg.get('batch_size', 4)),
        'num_workers': int(runtime_cfg.get('num_workers', 2)),
    }
    train_loader = DataLoader(train_ds, shuffle=True, **loader_kwargs)
    val_loader = DataLoader(val_ds, shuffle=False, **loader_kwargs)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    d_model = int(config.get('model', {}).get('d_model', 768))
    model = TemporalSSLHead(d_model=d_model).to(device)

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(opt_cfg.get('lr', 2e-4)),
        weight_decay=float(opt_cfg.get('weight_decay', 0.01)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))
    ce = nn.CrossEntropyLoss()

    start_epoch = 1
    best_val = float('inf')
    resume_mode = 'none'
    loaded_weight_tensors = 0
    ckpt_dir = output_root / 'checkpoints'
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        checkpoint_stage = state.get('stage_name') if isinstance(state, dict) else None
        checkpoint_state = state.get('model_state') if isinstance(state, dict) and 'model_state' in state else state
        if not isinstance(checkpoint_state, dict):
            checkpoint_state = {}

        attempt_full_resume = checkpoint_stage in {None, stage_name}
        if attempt_full_resume:
            try:
                model.load_state_dict(checkpoint_state)
                optimizer.load_state_dict(state['optimizer_state'])
                scheduler.load_state_dict(state['scheduler_state'])
                start_epoch = int(state.get('epoch', 0)) + 1
                best_val = float(state.get('best_val', best_val))
                resume_mode = 'full'
                loaded_weight_tensors = len(checkpoint_state)
            except (KeyError, RuntimeError, ValueError):
                loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
                if loaded_weight_tensors > 0:
                    resume_mode = 'weights_only'
        else:
            loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
            if loaded_weight_tensors > 0:
                resume_mode = 'weights_only'

    history_csv = output_root / 'metrics' / 'temporal_ssl_history.csv'
    epochs = int(target_cfg.get('epochs', 10))

    for epoch in range(start_epoch, epochs + 1):
        model.train()
        train_loss = 0.0
        n = 0
        for batch in train_loader:
            x_aot = batch['x_aot'].to(device)
            y_aot = batch['y_aot'].to(device)
            x_sort = batch['x_sort'].to(device)
            y_sort = batch['y_sort'].to(device)

            optimizer.zero_grad(set_to_none=True)
            pred_aot, _ = model(x_aot)
            _, pred_sort = model(x_sort)
            loss = ce(pred_aot, y_aot) + ce(pred_sort, y_sort)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            n += 1

        model.eval()
        val_loss = 0.0
        m = 0
        with torch.no_grad():
            for batch in val_loader:
                x_aot = batch['x_aot'].to(device)
                y_aot = batch['y_aot'].to(device)
                x_sort = batch['x_sort'].to(device)
                y_sort = batch['y_sort'].to(device)

                pred_aot, _ = model(x_aot)
                _, pred_sort = model(x_sort)
                loss = ce(pred_aot, y_aot) + ce(pred_sort, y_sort)
                val_loss += loss.item()
                m += 1

        scheduler.step()
        row = {
            'epoch': epoch,
            'train_loss': train_loss / max(n, 1),
            'val_loss': val_loss / max(m, 1),
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_val': best_val,
            'stage_name': stage_name,
        }
        torch.save(state, ckpt_dir / 'temporal_ssl_last.pth')

        if row['val_loss'] < best_val:
            best_val = float(row['val_loss'])
            state['best_val'] = best_val
            torch.save(state, ckpt_dir / 'temporal_ssl_best.pth')

    summary = {
        'stage': stage_name,
        'status': 'finished',
        'resume_mode': resume_mode,
        'resume_checkpoint': str(resume) if resume else '',
        'loaded_weight_tensors': loaded_weight_tensors,
        'best_val_loss': best_val,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'temporal_ssl_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'temporal_ssl_last.pth'),
    }
    (output_root / 'metrics' / 'temporal_ssl_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
===
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from src.data.temporal_ssl_dataset import TemporalSSLDataset
from src.models.task_prompted_model import TaskPromptedTemporalModel


class TemporalSSLHead(nn.Module):
    def __init__(self, d_model: int = 768) -> None:
        super().__init__()
        self.backbone = TaskPromptedTemporalModel(input_dim=d_model, d_model=d_model, n_heads=8, n_layers=4)
        self.aot_head = nn.Linear(3, 2)
        self.sort_head = nn.Linear(3, 2)

    def forward(self, x: torch.Tensor):
        logits_3 = self.backbone(x)
        aot = self.aot_head(logits_3)
        sort = self.sort_head(logits_3)
        return aot, sort


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _append_csv(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def _load_model_weights_flexible(model: nn.Module, checkpoint_state: dict) -> int:
    """Load compatible weights only, supporting optional backbone prefix remapping."""
    if not checkpoint_state:
        return 0

    model_state = model.state_dict()
    compatible = {}

    for key, tensor in checkpoint_state.items():
        if not isinstance(tensor, torch.Tensor):
            continue

        candidate_keys = [key]
        if key.startswith('backbone.'):
            candidate_keys.append(key[len('backbone.') :])
        else:
            candidate_keys.append(f'backbone.{key}')

        for candidate in candidate_keys:
            if candidate in model_state and model_state[candidate].shape == tensor.shape:
                compatible[candidate] = tensor
                break

    if not compatible:
        return 0

    model_state.update(compatible)
    model.load_state_dict(model_state, strict=False)
    return len(compatible)


def train_temporal_ssl(config: dict, data_root: Path, output_root: Path, resume: str | None = None) -> dict:
    start = time.time()
    stage_name = 'temporal_ssl_pretext'
    seed = int(config.get('project', {}).get('seed', 42))
    _set_seed(seed)

    runtime_cfg = config.get('runtime', {})
    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    opt_cfg = config.get('optimizer', {})

    train_ds = TemporalSSLDataset(Path(data_cfg['train_manifest']), data_root, int(data_cfg.get('frames_per_clip', 64)))
    val_ds = TemporalSSLDataset(Path(data_cfg['val_manifest']), data_root, int(data_cfg.get('frames_per_clip', 64)))

    loader_kwargs = {
        'batch_size': int(target_cfg.get('batch_size', 4)),
        'num_workers': int(runtime_cfg.get('num_workers', 2)),
    }
    train_loader = DataLoader(train_ds, shuffle=True, **loader_kwargs)
    val_loader = DataLoader(val_ds, shuffle=False, **loader_kwargs)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    d_model = int(config.get('model', {}).get('d_model', 768))
    model = TemporalSSLHead(d_model=d_model).to(device)

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(opt_cfg.get('lr', 2e-4)),
        weight_decay=float(opt_cfg.get('weight_decay', 0.01)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))
    ce = nn.CrossEntropyLoss()

    start_epoch = 1
    best_val = float('inf')
    resume_mode = 'none'
    loaded_weight_tensors = 0
    ckpt_dir = output_root / 'checkpoints'
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    if resume and Path(resume).exists():
        state = torch.load(resume, map_location=device)
        checkpoint_stage = state.get('stage_name') if isinstance(state, dict) else None
        checkpoint_state = state.get('model_state') if isinstance(state, dict) and 'model_state' in state else state
        if not isinstance(checkpoint_state, dict):
            checkpoint_state = {}

        attempt_full_resume = checkpoint_stage in {None, stage_name}
        if attempt_full_resume:
            try:
                model.load_state_dict(checkpoint_state)
                optimizer.load_state_dict(state['optimizer_state'])
                scheduler.load_state_dict(state['scheduler_state'])
                start_epoch = int(state.get('epoch', 0)) + 1
                best_val = float(state.get('best_val', best_val))
                resume_mode = 'full'
                loaded_weight_tensors = len(checkpoint_state)
            except (KeyError, RuntimeError, ValueError):
                loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
                if loaded_weight_tensors > 0:
                    resume_mode = 'weights_only'
        else:
            loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
            if loaded_weight_tensors > 0:
                resume_mode = 'weights_only'

    history_csv = output_root / 'metrics' / 'temporal_ssl_history.csv'
    epochs = int(target_cfg.get('epochs', 10))

    for epoch in range(start_epoch, epochs + 1):
        model.train()
        train_loss = 0.0
        n = 0
        for batch in train_loader:
            x_aot = batch['x_aot'].to(device)
            y_aot = batch['y_aot'].to(device)
            x_sort = batch['x_sort'].to(device)
            y_sort = batch['y_sort'].to(device)

            optimizer.zero_grad(set_to_none=True)
            pred_aot, _ = model(x_aot)
            _, pred_sort = model(x_sort)
            loss = ce(pred_aot, y_aot) + ce(pred_sort, y_sort)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            n += 1

        model.eval()
        val_loss = 0.0
        m = 0
        aot_correct = 0
        aot_total = 0
        sort_correct = 0
        sort_total = 0
        with torch.no_grad():
            for batch in val_loader:
                x_aot = batch['x_aot'].to(device)
                y_aot = batch['y_aot'].to(device)
                x_sort = batch['x_sort'].to(device)
                y_sort = batch['y_sort'].to(device)

                pred_aot, _ = model(x_aot)
                _, pred_sort = model(x_sort)
                loss = ce(pred_aot, y_aot) + ce(pred_sort, y_sort)
                val_loss += loss.item()
                m += 1

                aot_correct += (pred_aot.argmax(dim=1) == y_aot).sum().item()
                aot_total += y_aot.size(0)
                sort_correct += (pred_sort.argmax(dim=1) == y_sort).sum().item()
                sort_total += y_sort.size(0)

        scheduler.step()
        train_loss_avg = train_loss / max(n, 1)
        val_loss_avg = val_loss / max(m, 1)
        aot_acc = aot_correct / max(aot_total, 1)
        sort_acc = sort_correct / max(sort_total, 1)

        row = {
            'epoch': epoch,
            'train_loss': train_loss_avg,
            'val_loss': val_loss_avg,
            'val_aot_acc': round(aot_acc, 4),
            'val_sort_acc': round(sort_acc, 4),
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(history_csv, row)

        # ── Per-epoch console log (SSL pretext → loss + task accuracy) ──
        print(f"\n{'='*60}")
        print(f"  [Temporal SSL Pretext] Epoch {epoch}/{epochs}")
        print(f"{'='*60}")
        print(f"  Train Loss (pretext) : {train_loss_avg:.4f}")
        print(f"  Val   Loss (pretext) : {val_loss_avg:.4f}  (gap: {abs(val_loss_avg - train_loss_avg):.4f})")
        print(f"  Val AOT  Accuracy    : {aot_acc:.4f}  (arrow-of-time)")
        print(f"  Val Sort Accuracy    : {sort_acc:.4f}  (temporal order)")
        print(f"  LR: {optimizer.param_groups[0]['lr']:.2e}")

        state = {
            'epoch': epoch,
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_val': best_val,
            'stage_name': stage_name,
        }
        torch.save(state, ckpt_dir / 'temporal_ssl_last.pth')

        if row['val_loss'] < best_val:
            best_val = float(row['val_loss'])
            state['best_val'] = best_val
            torch.save(state, ckpt_dir / 'temporal_ssl_best.pth')
            print(f"  ★ New Best Val Loss = {best_val:.4f} → checkpoint saved")

    summary = {
        'stage': stage_name,
        'status': 'finished',
        'resume_mode': resume_mode,
        'resume_checkpoint': str(resume) if resume else '',
        'loaded_weight_tensors': loaded_weight_tensors,
        'best_val_loss': best_val,
        'history_csv': str(history_csv),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / 'temporal_ssl_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'temporal_ssl_last.pth'),
    }
    (output_root / 'metrics' / 'temporal_ssl_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
```
```diff:engine.py
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, f1_score
from torch.utils.data import DataLoader

from src.data.manifest_dataset import ManifestFeatureDataset
from src.models.baseline_mlp import BaselineMLP
from src.models.task_prompted_model import TaskPromptedTemporalModel


def _set_seed(seed: int, deterministic: bool) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    if deterministic:
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def _resolve_manifest(config: dict, key: str) -> str:
    data_cfg = config.get('data', {})
    manifest = data_cfg.get(key)
    if not manifest:
        raise ValueError(f'Missing data.{key} in config')
    return manifest


def _build_loaders(config: dict, data_root: Path, label_columns: list[str]) -> tuple[DataLoader, DataLoader]:
    train_manifest = _resolve_manifest(config, 'train_manifest')
    val_manifest = _resolve_manifest(config, 'val_manifest')

    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    runtime_cfg = config.get('runtime', {})
    batch_size = int(target_cfg.get('batch_size', 8))
    frames_per_clip = int(data_cfg.get('frames_per_clip', 64))
    num_workers = int(runtime_cfg.get('num_workers', 2))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    aux_dim = int(config.get('model', {}).get('aux_dim', data_cfg.get('aux_dim', 0)))

    train_ds = ManifestFeatureDataset(Path(train_manifest), data_root, label_columns, frames_per_clip=frames_per_clip, default_aux_dim=aux_dim)
    val_ds = ManifestFeatureDataset(Path(val_manifest), data_root, label_columns, frames_per_clip=frames_per_clip, default_aux_dim=aux_dim)

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )
    return train_loader, val_loader


def _build_model(
    config: dict,
    output_dim: int,
    sample_input_dim: int,
    sample_frames: int,
    sample_aux_dim: int,
    device: torch.device,
) -> nn.Module:
    model_cfg = config.get('model', {})
    model_name = str(model_cfg.get('name', 'baseline_mlp')).lower()
    input_dim = int(model_cfg.get('input_dim', sample_input_dim))

    if model_name == 'task_prompted_transformer':
        d_model = int(model_cfg.get('d_model', input_dim))
        n_heads = int(model_cfg.get('n_heads', 8))
        n_layers = int(model_cfg.get('n_layers', model_cfg.get('temporal_layers', 4)))
        ff_dim = int(model_cfg.get('ff_dim', d_model * 4))
        dropout = float(model_cfg.get('dropout', 0.1))
        max_frames = int(config.get('data', {}).get('frames_per_clip', sample_frames))
        aux_dim = int(model_cfg.get('aux_dim', sample_aux_dim))
        qformer_layers = int(model_cfg.get('qformer_layers', 2))
        model = TaskPromptedTemporalModel(
            input_dim=input_dim,
            aux_dim=aux_dim,
            d_model=d_model,
            n_heads=n_heads,
            n_layers=n_layers,
            ff_dim=ff_dim,
            dropout=dropout,
            max_frames=max_frames,
            qformer_layers=qformer_layers,
        )
    else:
        hidden_dim = int(model_cfg.get('hidden_dim', 512))
        dropout = float(model_cfg.get('dropout', 0.2))
        model = BaselineMLP(input_dim=input_dim, hidden_dim=hidden_dim, output_dim=output_dim, dropout=dropout)

    return model.to(device)


def _unpack_batch(batch) -> tuple[torch.Tensor, torch.Tensor | None, torch.Tensor]:
    if isinstance(batch, (list, tuple)):
        if len(batch) == 3:
            x, aux, y = batch
            return x, aux, y
        if len(batch) == 2:
            x, y = batch
            return x, None, y
    raise ValueError('Expected batch to be a tuple of (x, y) or (x, aux, y)')


def _forward_logits(model: nn.Module, model_name: str, x: torch.Tensor, aux: torch.Tensor | None = None) -> torch.Tensor:
    if model_name == 'baseline_mlp' and x.ndim == 3:
        # Pool temporal axis when using a non-temporal baseline.
        x = x.mean(dim=1)
    if model_name == 'task_prompted_transformer':
        return model(x, aux=aux)
    return model(x)


def _split_model_parameters(model: nn.Module) -> tuple[list[nn.Parameter], list[nn.Parameter]]:
    backbone = []
    heads = []
    for name, parameter in model.named_parameters():
        if not parameter.requires_grad:
            continue
        if any(token in name for token in ('v_head', 's_head', 'n_head')):
            heads.append(parameter)
        else:
            backbone.append(parameter)
    if not heads:
        heads = backbone
        backbone = []
    return backbone, heads


def _build_optimizer_and_scheduler(config: dict, model: nn.Module):
    opt_cfg = config.get('optimizer', {})
    weight_decay = float(opt_cfg.get('weight_decay', 0.0))
    backbone_lr = opt_cfg.get('backbone_lr')
    heads_lr = opt_cfg.get('heads_lr')

    if backbone_lr is not None or heads_lr is not None:
        backbone_params, head_params = _split_model_parameters(model)
        param_groups = []
        if backbone_params:
            param_groups.append({'params': backbone_params, 'lr': float(backbone_lr or opt_cfg.get('lr', 2e-4))})
        if head_params:
            param_groups.append({'params': head_params, 'lr': float(heads_lr or opt_cfg.get('lr', 2e-4))})
        optimizer = torch.optim.AdamW(param_groups, weight_decay=weight_decay)
    else:
        lr = float(opt_cfg.get('lr', 2e-4))
        optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)

    target_cfg = config.get('target', {})
    epochs = int(target_cfg.get('epochs', 1))
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1))
    return optimizer, scheduler


def _smooth_targets(y: torch.Tensor, smoothing: float) -> torch.Tensor:
    if smoothing <= 0:
        return y
    return y * (1.0 - smoothing) + 0.5 * smoothing


def _train_one_epoch(
    model: nn.Module,
    model_name: str,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    grad_accum_steps: int,
    label_smoothing: float,
) -> float:
    model.train()
    total_loss = 0.0
    steps = 0

    optimizer.zero_grad(set_to_none=True)
    for idx, batch in enumerate(loader):
        x, aux, y = _unpack_batch(batch)
        x = x.to(device, non_blocking=True)
        aux = aux.to(device, non_blocking=True) if aux is not None else None
        y = y.to(device, non_blocking=True)
        y = _smooth_targets(y, label_smoothing)

        logits = _forward_logits(model, model_name=model_name, x=x, aux=aux)
        loss = criterion(logits, y) / grad_accum_steps
        loss.backward()

        if (idx + 1) % grad_accum_steps == 0:
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)

        total_loss += loss.item() * grad_accum_steps
        steps += 1

    if steps % grad_accum_steps != 0:
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)

    return total_loss / max(steps, 1)


@torch.no_grad()
def _validate_one_epoch(
    model: nn.Module,
    model_name: str,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    threshold: float,
    label_columns: list[str],
) -> tuple[float, float, dict[str, dict[str, int]]]:
    model.eval()
    total_loss = 0.0
    steps = 0
    all_targets = []
    all_preds = []

    for batch in loader:
        x, aux, y = _unpack_batch(batch)
        x = x.to(device, non_blocking=True)
        aux = aux.to(device, non_blocking=True) if aux is not None else None
        y = y.to(device, non_blocking=True)

        logits = _forward_logits(model, model_name=model_name, x=x, aux=aux)
        loss = criterion(logits, y)
        probs = torch.sigmoid(logits)
        preds = (probs >= threshold).float()

        total_loss += loss.item()
        steps += 1
        all_targets.append(y.detach().cpu().numpy())
        all_preds.append(preds.detach().cpu().numpy())

    if not all_targets:
        empty_confusion = {label: {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0} for label in label_columns}
        return 0.0, 0.0, empty_confusion

    y_true = np.concatenate(all_targets, axis=0)
    y_pred = np.concatenate(all_preds, axis=0)
    f1_macro = f1_score(y_true, y_pred, average='macro', zero_division=0)
    confusion = {}
    for idx, label in enumerate(label_columns):
        tn, fp, fn, tp = confusion_matrix(y_true[:, idx], y_pred[:, idx], labels=[0, 1]).ravel()
        confusion[label] = {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
    return total_loss / max(steps, 1), float(f1_macro), confusion


def _save_checkpoint(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, path)


def _append_csv(csv_path: Path, row: dict) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = csv_path.exists()
    with csv_path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)


def _load_model_weights_flexible(model: nn.Module, checkpoint_state: dict) -> int:
    """Load compatible weights only, supporting optional backbone prefix remapping."""
    if not checkpoint_state:
        return 0

    model_state = model.state_dict()
    compatible = {}

    for key, tensor in checkpoint_state.items():
        if not isinstance(tensor, torch.Tensor):
            continue

        candidate_keys = [key]
        if key.startswith('backbone.'):
            candidate_keys.append(key[len('backbone.') :])
        else:
            candidate_keys.append(f'backbone.{key}')

        for candidate in candidate_keys:
            if candidate in model_state and model_state[candidate].shape == tensor.shape:
                compatible[candidate] = tensor
                break

    if not compatible:
        return 0

    model_state.update(compatible)
    model.load_state_dict(model_state, strict=False)
    return len(compatible)


def run_training_stage(
    stage_name: str,
    config: dict,
    data_root: Path,
    output_root: Path,
    resume: str | None = None,
) -> dict:
    start = time.time()

    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    target_cfg = config.get('target', {})
    checkpoint_cfg = config.get('checkpoint', {})

    seed = int(project_cfg.get('seed', 42))
    deterministic = bool(project_cfg.get('deterministic', True))
    _set_seed(seed, deterministic)

    device_name = runtime_cfg.get('device', 'cuda')
    if device_name == 'cuda' and not torch.cuda.is_available():
        device_name = 'cpu'
    device = torch.device(device_name)

    label_columns = ['violence', 'self_harm', 'nsfw']
    train_loader, val_loader = _build_loaders(config, data_root, label_columns)

    first_batch = next(iter(train_loader))
    first_batch_x, first_batch_aux, _ = _unpack_batch(first_batch)
    model_name = str(config.get('model', {}).get('name', 'baseline_mlp')).lower()
    sample_input_dim = int(first_batch_x.shape[-1])
    sample_frames = int(first_batch_x.shape[1]) if first_batch_x.ndim == 3 else 1
    sample_aux_dim = int(first_batch_aux.shape[-1]) if first_batch_aux is not None and first_batch_aux.ndim >= 2 else 0
    model = _build_model(
        config,
        output_dim=len(label_columns),
        sample_input_dim=sample_input_dim,
        sample_frames=sample_frames,
        sample_aux_dim=sample_aux_dim,
        device=device,
    )

    criterion = nn.BCEWithLogitsLoss()
    optimizer, scheduler = _build_optimizer_and_scheduler(config, model)

    start_epoch = 1
    best_metric = float('-inf')
    resume_mode = 'none'
    loaded_weight_tensors = 0
    if resume:
        resume_path = Path(resume)
        if resume_path.exists():
            state = torch.load(resume_path, map_location=device)
            checkpoint_stage = state.get('stage_name') if isinstance(state, dict) else None
            checkpoint_state = state.get('model_state') if isinstance(state, dict) and 'model_state' in state else state
            if not isinstance(checkpoint_state, dict):
                checkpoint_state = {}

            attempt_full_resume = checkpoint_stage in {None, stage_name}
            if attempt_full_resume:
                try:
                    model.load_state_dict(checkpoint_state)
                    optimizer.load_state_dict(state['optimizer_state'])
                    scheduler.load_state_dict(state['scheduler_state'])
                    start_epoch = int(state.get('epoch', 0)) + 1
                    best_metric = float(state.get('best_metric', best_metric))
                    resume_mode = 'full'
                    loaded_weight_tensors = len(checkpoint_state)
                except (KeyError, RuntimeError, ValueError):
                    loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
                    if loaded_weight_tensors > 0:
                        resume_mode = 'weights_only'
            else:
                loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
                if loaded_weight_tensors > 0:
                    resume_mode = 'weights_only'

    epochs = int(target_cfg.get('epochs', 1))
    grad_accum_steps = int(target_cfg.get('grad_accum_steps', 1))
    threshold = float(target_cfg.get('decision_threshold', 0.5))
    label_smoothing = float(target_cfg.get('label_smoothing', 0.0))
    early_stopping_patience = int(target_cfg.get('early_stopping_patience', 0))

    ckpt_dir = output_root / 'checkpoints'
    metrics_dir = output_root / 'metrics'
    csv_path = metrics_dir / f'{stage_name}_history.csv'

    monitor = checkpoint_cfg.get('monitor', 'val_f1_macro')
    mode = checkpoint_cfg.get('mode', 'max')

    history = []
    best_confusion = {label: {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0} for label in label_columns}
    no_improve_epochs = 0
    for epoch in range(start_epoch, epochs + 1):
        train_loss = _train_one_epoch(
            model=model,
            model_name=model_name,
            loader=train_loader,
            criterion=criterion,
            optimizer=optimizer,
            device=device,
            grad_accum_steps=grad_accum_steps,
            label_smoothing=label_smoothing,
        )
        val_loss, val_f1, confusion = _validate_one_epoch(
            model=model,
            model_name=model_name,
            loader=val_loader,
            criterion=criterion,
            device=device,
            threshold=threshold,
            label_columns=label_columns,
        )
        scheduler.step()

        row = {
            'epoch': epoch,
            'train_loss': round(train_loss, 6),
            'val_loss': round(val_loss, 6),
            'val_f1_macro': round(val_f1, 6),
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(csv_path, row)
        history.append(row)

        current_metric = row.get(monitor, row['val_f1_macro'])
        improved = (current_metric > best_metric) if mode == 'max' else (current_metric < best_metric)
        if improved:
            best_metric = float(current_metric)
            best_confusion = confusion
            _save_checkpoint(
                ckpt_dir / f'{stage_name}_best.pth',
                {
                    'epoch': epoch,
                    'model_state': model.state_dict(),
                    'optimizer_state': optimizer.state_dict(),
                    'scheduler_state': scheduler.state_dict(),
                    'best_metric': best_metric,
                    'stage_name': stage_name,
                    'config': config,
                    'best_confusion_matrix': best_confusion,
                },
            )
            no_improve_epochs = 0
        else:
            no_improve_epochs += 1

        _save_checkpoint(
            ckpt_dir / f'{stage_name}_last.pth',
            {
                'epoch': epoch,
                'model_state': model.state_dict(),
                'optimizer_state': optimizer.state_dict(),
                'scheduler_state': scheduler.state_dict(),
                'best_metric': best_metric,
                'stage_name': stage_name,
                'config': config,
                'last_confusion_matrix': confusion,
            },
        )

        if early_stopping_patience > 0 and no_improve_epochs >= early_stopping_patience:
            break

    summary = {
        'stage': stage_name,
        'status': 'finished',
        'data_root': str(data_root),
        'resume_mode': resume_mode,
        'resume_checkpoint': str(resume) if resume else '',
        'loaded_weight_tensors': loaded_weight_tensors,
        'epochs': epochs,
        'best_metric': best_metric,
        'history_rows': len(history),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / f'{stage_name}_best.pth'),
        'last_checkpoint': str(ckpt_dir / f'{stage_name}_last.pth'),
        'metrics_csv': str(csv_path),
        'best_confusion_matrix': best_confusion,
    }

    metrics_json = metrics_dir / f'{stage_name}_summary.json'
    metrics_json.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
===
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, f1_score
from torch.utils.data import DataLoader

from src.data.manifest_dataset import ManifestFeatureDataset
from src.models.baseline_mlp import BaselineMLP
from src.models.task_prompted_model import TaskPromptedTemporalModel


def _set_seed(seed: int, deterministic: bool) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    if deterministic:
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def _resolve_manifest(config: dict, key: str) -> str:
    data_cfg = config.get('data', {})
    manifest = data_cfg.get(key)
    if not manifest:
        raise ValueError(f'Missing data.{key} in config')
    return manifest


def _build_loaders(config: dict, data_root: Path, label_columns: list[str]) -> tuple[DataLoader, DataLoader]:
    train_manifest = _resolve_manifest(config, 'train_manifest')
    val_manifest = _resolve_manifest(config, 'val_manifest')

    data_cfg = config.get('data', {})
    target_cfg = config.get('target', {})
    runtime_cfg = config.get('runtime', {})
    batch_size = int(target_cfg.get('batch_size', 8))
    frames_per_clip = int(data_cfg.get('frames_per_clip', 64))
    num_workers = int(runtime_cfg.get('num_workers', 2))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))

    aux_dim = int(config.get('model', {}).get('aux_dim', data_cfg.get('aux_dim', 0)))

    train_ds = ManifestFeatureDataset(Path(train_manifest), data_root, label_columns, frames_per_clip=frames_per_clip, default_aux_dim=aux_dim)
    val_ds = ManifestFeatureDataset(Path(val_manifest), data_root, label_columns, frames_per_clip=frames_per_clip, default_aux_dim=aux_dim)

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )
    return train_loader, val_loader


def _build_model(
    config: dict,
    output_dim: int,
    sample_input_dim: int,
    sample_frames: int,
    sample_aux_dim: int,
    device: torch.device,
) -> nn.Module:
    model_cfg = config.get('model', {})
    model_name = str(model_cfg.get('name', 'baseline_mlp')).lower()
    input_dim = int(model_cfg.get('input_dim', sample_input_dim))

    if model_name == 'task_prompted_transformer':
        d_model = int(model_cfg.get('d_model', input_dim))
        n_heads = int(model_cfg.get('n_heads', 8))
        n_layers = int(model_cfg.get('n_layers', model_cfg.get('temporal_layers', 4)))
        ff_dim = int(model_cfg.get('ff_dim', d_model * 4))
        dropout = float(model_cfg.get('dropout', 0.1))
        max_frames = int(config.get('data', {}).get('frames_per_clip', sample_frames))
        aux_dim = int(model_cfg.get('aux_dim', sample_aux_dim))
        qformer_layers = int(model_cfg.get('qformer_layers', 2))
        model = TaskPromptedTemporalModel(
            input_dim=input_dim,
            aux_dim=aux_dim,
            d_model=d_model,
            n_heads=n_heads,
            n_layers=n_layers,
            ff_dim=ff_dim,
            dropout=dropout,
            max_frames=max_frames,
            qformer_layers=qformer_layers,
        )
    else:
        hidden_dim = int(model_cfg.get('hidden_dim', 512))
        dropout = float(model_cfg.get('dropout', 0.2))
        model = BaselineMLP(input_dim=input_dim, hidden_dim=hidden_dim, output_dim=output_dim, dropout=dropout)

    return model.to(device)


def _unpack_batch(batch) -> tuple[torch.Tensor, torch.Tensor | None, torch.Tensor]:
    if isinstance(batch, (list, tuple)):
        if len(batch) == 3:
            x, aux, y = batch
            return x, aux, y
        if len(batch) == 2:
            x, y = batch
            return x, None, y
    raise ValueError('Expected batch to be a tuple of (x, y) or (x, aux, y)')


def _forward_logits(model: nn.Module, model_name: str, x: torch.Tensor, aux: torch.Tensor | None = None) -> torch.Tensor:
    if model_name == 'baseline_mlp' and x.ndim == 3:
        # Pool temporal axis when using a non-temporal baseline.
        x = x.mean(dim=1)
    if model_name == 'task_prompted_transformer':
        return model(x, aux=aux)
    return model(x)


def _split_model_parameters(model: nn.Module) -> tuple[list[nn.Parameter], list[nn.Parameter]]:
    backbone = []
    heads = []
    for name, parameter in model.named_parameters():
        if not parameter.requires_grad:
            continue
        if any(token in name for token in ('v_head', 's_head', 'n_head')):
            heads.append(parameter)
        else:
            backbone.append(parameter)
    if not heads:
        heads = backbone
        backbone = []
    return backbone, heads


def _build_optimizer_and_scheduler(config: dict, model: nn.Module):
    opt_cfg = config.get('optimizer', {})
    weight_decay = float(opt_cfg.get('weight_decay', 0.0))
    backbone_lr = opt_cfg.get('backbone_lr')
    heads_lr = opt_cfg.get('heads_lr')

    if backbone_lr is not None or heads_lr is not None:
        backbone_params, head_params = _split_model_parameters(model)
        param_groups = []
        if backbone_params:
            param_groups.append({'params': backbone_params, 'lr': float(backbone_lr or opt_cfg.get('lr', 2e-4))})
        if head_params:
            param_groups.append({'params': head_params, 'lr': float(heads_lr or opt_cfg.get('lr', 2e-4))})
        optimizer = torch.optim.AdamW(param_groups, weight_decay=weight_decay)
    else:
        lr = float(opt_cfg.get('lr', 2e-4))
        optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)

    target_cfg = config.get('target', {})
    epochs = int(target_cfg.get('epochs', 1))
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1))
    return optimizer, scheduler


def _smooth_targets(y: torch.Tensor, smoothing: float) -> torch.Tensor:
    if smoothing <= 0:
        return y
    return y * (1.0 - smoothing) + 0.5 * smoothing


def _train_one_epoch(
    model: nn.Module,
    model_name: str,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    grad_accum_steps: int,
    label_smoothing: float,
) -> float:
    model.train()
    total_loss = 0.0
    steps = 0

    optimizer.zero_grad(set_to_none=True)
    for idx, batch in enumerate(loader):
        x, aux, y = _unpack_batch(batch)
        x = x.to(device, non_blocking=True)
        aux = aux.to(device, non_blocking=True) if aux is not None else None
        y = y.to(device, non_blocking=True)
        y = _smooth_targets(y, label_smoothing)

        logits = _forward_logits(model, model_name=model_name, x=x, aux=aux)
        loss = criterion(logits, y) / grad_accum_steps
        loss.backward()

        if (idx + 1) % grad_accum_steps == 0:
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)

        total_loss += loss.item() * grad_accum_steps
        steps += 1

    if steps % grad_accum_steps != 0:
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)

    return total_loss / max(steps, 1)


@torch.no_grad()
def _validate_one_epoch(
    model: nn.Module,
    model_name: str,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    threshold: float,
    label_columns: list[str],
) -> tuple[float, float, dict[str, dict[str, int]]]:
    model.eval()
    total_loss = 0.0
    steps = 0
    all_targets = []
    all_preds = []

    for batch in loader:
        x, aux, y = _unpack_batch(batch)
        x = x.to(device, non_blocking=True)
        aux = aux.to(device, non_blocking=True) if aux is not None else None
        y = y.to(device, non_blocking=True)

        logits = _forward_logits(model, model_name=model_name, x=x, aux=aux)
        loss = criterion(logits, y)
        probs = torch.sigmoid(logits)
        preds = (probs >= threshold).float()

        total_loss += loss.item()
        steps += 1
        all_targets.append(y.detach().cpu().numpy())
        all_preds.append(preds.detach().cpu().numpy())

    if not all_targets:
        empty_confusion = {label: {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0} for label in label_columns}
        return 0.0, 0.0, empty_confusion

    y_true = np.concatenate(all_targets, axis=0)
    y_pred = np.concatenate(all_preds, axis=0)
    f1_macro = f1_score(y_true, y_pred, average='macro', zero_division=0)
    confusion = {}
    for idx, label in enumerate(label_columns):
        tn, fp, fn, tp = confusion_matrix(y_true[:, idx], y_pred[:, idx], labels=[0, 1]).ravel()
        confusion[label] = {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
    return total_loss / max(steps, 1), float(f1_macro), confusion


def _save_checkpoint(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, path)


def _append_csv(csv_path: Path, row: dict) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = csv_path.exists()
    with csv_path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)


def _load_model_weights_flexible(model: nn.Module, checkpoint_state: dict) -> int:
    """Load compatible weights only, supporting optional backbone prefix remapping."""
    if not checkpoint_state:
        return 0

    model_state = model.state_dict()
    compatible = {}

    for key, tensor in checkpoint_state.items():
        if not isinstance(tensor, torch.Tensor):
            continue

        candidate_keys = [key]
        if key.startswith('backbone.'):
            candidate_keys.append(key[len('backbone.') :])
        else:
            candidate_keys.append(f'backbone.{key}')

        for candidate in candidate_keys:
            if candidate in model_state and model_state[candidate].shape == tensor.shape:
                compatible[candidate] = tensor
                break

    if not compatible:
        return 0

    model_state.update(compatible)
    model.load_state_dict(model_state, strict=False)
    return len(compatible)


def run_training_stage(
    stage_name: str,
    config: dict,
    data_root: Path,
    output_root: Path,
    resume: str | None = None,
) -> dict:
    start = time.time()

    project_cfg = config.get('project', {})
    runtime_cfg = config.get('runtime', {})
    target_cfg = config.get('target', {})
    checkpoint_cfg = config.get('checkpoint', {})

    seed = int(project_cfg.get('seed', 42))
    deterministic = bool(project_cfg.get('deterministic', True))
    _set_seed(seed, deterministic)

    device_name = runtime_cfg.get('device', 'cuda')
    if device_name == 'cuda' and not torch.cuda.is_available():
        device_name = 'cpu'
    device = torch.device(device_name)

    label_columns = ['violence', 'self_harm', 'nsfw']
    train_loader, val_loader = _build_loaders(config, data_root, label_columns)

    first_batch = next(iter(train_loader))
    first_batch_x, first_batch_aux, _ = _unpack_batch(first_batch)
    model_name = str(config.get('model', {}).get('name', 'baseline_mlp')).lower()
    sample_input_dim = int(first_batch_x.shape[-1])
    sample_frames = int(first_batch_x.shape[1]) if first_batch_x.ndim == 3 else 1
    sample_aux_dim = int(first_batch_aux.shape[-1]) if first_batch_aux is not None and first_batch_aux.ndim >= 2 else 0
    model = _build_model(
        config,
        output_dim=len(label_columns),
        sample_input_dim=sample_input_dim,
        sample_frames=sample_frames,
        sample_aux_dim=sample_aux_dim,
        device=device,
    )

    criterion = nn.BCEWithLogitsLoss()
    optimizer, scheduler = _build_optimizer_and_scheduler(config, model)

    start_epoch = 1
    best_metric = float('-inf')
    resume_mode = 'none'
    loaded_weight_tensors = 0
    if resume:
        resume_path = Path(resume)
        if resume_path.exists():
            state = torch.load(resume_path, map_location=device)
            checkpoint_stage = state.get('stage_name') if isinstance(state, dict) else None
            checkpoint_state = state.get('model_state') if isinstance(state, dict) and 'model_state' in state else state
            if not isinstance(checkpoint_state, dict):
                checkpoint_state = {}

            attempt_full_resume = checkpoint_stage in {None, stage_name}
            if attempt_full_resume:
                try:
                    model.load_state_dict(checkpoint_state)
                    optimizer.load_state_dict(state['optimizer_state'])
                    scheduler.load_state_dict(state['scheduler_state'])
                    start_epoch = int(state.get('epoch', 0)) + 1
                    best_metric = float(state.get('best_metric', best_metric))
                    resume_mode = 'full'
                    loaded_weight_tensors = len(checkpoint_state)
                except (KeyError, RuntimeError, ValueError):
                    loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
                    if loaded_weight_tensors > 0:
                        resume_mode = 'weights_only'
            else:
                loaded_weight_tensors = _load_model_weights_flexible(model, checkpoint_state)
                if loaded_weight_tensors > 0:
                    resume_mode = 'weights_only'

    epochs = int(target_cfg.get('epochs', 1))
    grad_accum_steps = int(target_cfg.get('grad_accum_steps', 1))
    threshold = float(target_cfg.get('decision_threshold', 0.5))
    label_smoothing = float(target_cfg.get('label_smoothing', 0.0))
    early_stopping_patience = int(target_cfg.get('early_stopping_patience', 0))

    ckpt_dir = output_root / 'checkpoints'
    metrics_dir = output_root / 'metrics'
    csv_path = metrics_dir / f'{stage_name}_history.csv'

    monitor = checkpoint_cfg.get('monitor', 'val_f1_macro')
    mode = checkpoint_cfg.get('mode', 'max')

    history = []
    best_confusion = {label: {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0} for label in label_columns}
    no_improve_epochs = 0
    for epoch in range(start_epoch, epochs + 1):
        train_loss = _train_one_epoch(
            model=model,
            model_name=model_name,
            loader=train_loader,
            criterion=criterion,
            optimizer=optimizer,
            device=device,
            grad_accum_steps=grad_accum_steps,
            label_smoothing=label_smoothing,
        )
        val_loss, val_f1, confusion = _validate_one_epoch(
            model=model,
            model_name=model_name,
            loader=val_loader,
            criterion=criterion,
            device=device,
            threshold=threshold,
            label_columns=label_columns,
        )
        scheduler.step()

        row = {
            'epoch': epoch,
            'train_loss': round(train_loss, 6),
            'val_loss': round(val_loss, 6),
            'val_f1_macro': round(val_f1, 6),
            'lr': optimizer.param_groups[0]['lr'],
        }
        _append_csv(csv_path, row)
        history.append(row)

        # ── Per-epoch console log (multitask supervised) ──
        print(f"\n{'='*60}")
        print(f"  [{stage_name}] Epoch {epoch}/{epochs}")
        print(f"{'='*60}")
        print(f"  Train Loss  : {train_loss:.4f}")
        print(f"  Val   Loss  : {val_loss:.4f}  (gap: {abs(val_loss - train_loss):.4f})")
        print(f"  Val F1-Macro: {val_f1:.4f}")
        print(f"  Per-task Confusion Matrix:")
        for label, mtx in confusion.items():
            total = mtx['tn'] + mtx['fp'] + mtx['fn'] + mtx['tp']
            acc = (mtx['tn'] + mtx['tp']) / max(total, 1)
            recall = mtx['tp'] / max(mtx['tp'] + mtx['fn'], 1)
            print(f"    {label.upper():<10}: TN={mtx['tn']:>5} FP={mtx['fp']:>5} FN={mtx['fn']:>5} TP={mtx['tp']:>5}  | acc={acc:.3f} recall={recall:.3f}")
        print(f"  LR: {optimizer.param_groups[0]['lr']:.2e}")

        current_metric = row.get(monitor, row['val_f1_macro'])
        improved = (current_metric > best_metric) if mode == 'max' else (current_metric < best_metric)
        if improved:
            best_metric = float(current_metric)
            best_confusion = confusion
            _save_checkpoint(
                ckpt_dir / f'{stage_name}_best.pth',
                {
                    'epoch': epoch,
                    'model_state': model.state_dict(),
                    'optimizer_state': optimizer.state_dict(),
                    'scheduler_state': scheduler.state_dict(),
                    'best_metric': best_metric,
                    'stage_name': stage_name,
                    'config': config,
                    'best_confusion_matrix': best_confusion,
                },
            )
            no_improve_epochs = 0
            print(f"  ★ New Best {monitor} = {best_metric:.4f} → checkpoint saved")
        else:
            no_improve_epochs += 1
            print(f"  No improvement ({no_improve_epochs}/{early_stopping_patience if early_stopping_patience > 0 else '∞'})")

        _save_checkpoint(
            ckpt_dir / f'{stage_name}_last.pth',
            {
                'epoch': epoch,
                'model_state': model.state_dict(),
                'optimizer_state': optimizer.state_dict(),
                'scheduler_state': scheduler.state_dict(),
                'best_metric': best_metric,
                'stage_name': stage_name,
                'config': config,
                'last_confusion_matrix': confusion,
            },
        )

        if early_stopping_patience > 0 and no_improve_epochs >= early_stopping_patience:
            print(f"\n  ⛔ Early stopping triggered after {no_improve_epochs} epochs without improvement")
            break

    summary = {
        'stage': stage_name,
        'status': 'finished',
        'data_root': str(data_root),
        'resume_mode': resume_mode,
        'resume_checkpoint': str(resume) if resume else '',
        'loaded_weight_tensors': loaded_weight_tensors,
        'epochs': epochs,
        'best_metric': best_metric,
        'history_rows': len(history),
        'elapsed_seconds': round(time.time() - start, 3),
        'best_checkpoint': str(ckpt_dir / f'{stage_name}_best.pth'),
        'last_checkpoint': str(ckpt_dir / f'{stage_name}_last.pth'),
        'metrics_csv': str(csv_path),
        'best_confusion_matrix': best_confusion,
    }

    metrics_json = metrics_dir / f'{stage_name}_summary.json'
    metrics_json.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
```

---

### 3. Kiểm tra an toàn VRAM cho các config khác

| Config | batch_size | Dữ liệu | VRAM ước tính | Kết luận |
|--------|-----------|----------|--------------|----------|
| `proxy_efficientnet.yaml` | **16** (đã sửa) | Video 8 frame → 128 ảnh/bước | ~7 GB | ✅ An toàn |
| `nsfw_scorer.yaml` | 32 | Ảnh 2D → 32 ảnh/bước | ~2 GB | ✅ An toàn |
| `ssl_spatial.yaml` | 16 | Ảnh 2D, 6 crops xử lý tuần tự | ~1 GB | ✅ An toàn |
| `yolov8_nano.yaml` | 16 | Ảnh 640px, YOLOv8n rất nhẹ | ~3 GB | ✅ An toàn |
| `temporal_ssl_pretext.yaml` | 4 | Features 768-dim (không phải ảnh) | < 1 GB | ✅ An toàn |
| `finetune_multitask.yaml` | 4 | Features 768-dim (không phải ảnh) | < 1 GB | ✅ An toàn |

---

## Hướng dẫn chạy sáng mai

> [!IMPORTANT]
> Sáng mai bạn chỉ cần upload project lên lại Kaggle và chạy theo đúng thứ tự Cell trong `capnhat01.md`.
> **Không cần dùng Cell 10b** nữa — Cell 10 gốc đã có đầy đủ log + đã fix OOM.

### Quy trình:
1. Upload project (đã sửa) lên Kaggle
2. Chạy Cell 1 → Cell 8 (chuẩn bị dữ liệu, mất ~1.5 tiếng)
3. Chạy Cell 10 (train Proxy Gate — giờ đã có log + batch=16)
4. Sau Cell 10: tải `proxy_efficientnet_best.pth` về máy
5. Xóa thư mục proxy_arrays để giải phóng ~15GB
6. Tiếp tục Cell 11 trở đi

### Cách đọc log mỗi epoch:
```
============================================================
  [Proxy Gate] Epoch 3/12
============================================================
  Train Loss : 0.2314
  Val   Loss : 0.2876  (gap: 0.0562)    ← gap < 0.15 = OK
  Val Accuracy : 0.9012
  Val Recall   : 0.8650  (risky class)  ← > 0.80 = tốt
  Val Precision: 0.8203  (risky class)
  Confusion Matrix:
               Pred=Safe  Pred=Risky
    True=Safe     1180         58
    True=Risky      43        226
  LR: 2.50e-04
  ★ New Best Recall = 0.8650 → checkpoint saved
```

### Dấu hiệu cần chú ý:
- **Overfitting**: gap (Val Loss - Train Loss) > 0.3 → model học thuộc lòng
- **Thiên vị Safe**: Recall < 0.60 → model bỏ sót bạo lực quá nhiều
- **FN cao**: Ô "True=Risky / Pred=Safe" > 50% tổng Risky → cần thêm class weight
