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
