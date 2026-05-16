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
