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
    def __init__(
        self,
        d_model: int = 768,
        aux_dim: int = 0,
        n_heads: int = 8,
        n_layers: int = 4,
        ff_dim: int = 2048,
        dropout: float = 0.1,
        max_frames: int = 64,
        qformer_layers: int = 2,
    ) -> None:
        super().__init__()
        self.backbone = TaskPromptedTemporalModel(
            input_dim=d_model,
            aux_dim=aux_dim,
            d_model=d_model,
            n_heads=n_heads,
            n_layers=n_layers,
            ff_dim=ff_dim,
            dropout=dropout,
            max_frames=max_frames,
            qformer_layers=qformer_layers,
        )
        self.aot_head = nn.Linear(3, 2)
        self.sort_head = nn.Linear(3, 2)

    def forward(self, x: torch.Tensor, aux: torch.Tensor | None = None):
        logits_3 = self.backbone(x, aux=aux)
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

    aux_dim = int(config.get('model', {}).get('aux_dim', 0))
    train_ds = TemporalSSLDataset(Path(data_cfg['train_manifest']), data_root, int(data_cfg.get('frames_per_clip', 64)), default_aux_dim=aux_dim)
    val_ds = TemporalSSLDataset(Path(data_cfg['val_manifest']), data_root, int(data_cfg.get('frames_per_clip', 64)), default_aux_dim=aux_dim)

    loader_kwargs = {
        'batch_size': int(target_cfg.get('batch_size', 4)),
        'num_workers': int(runtime_cfg.get('num_workers', 2)),
    }
    train_loader = DataLoader(train_ds, shuffle=True, **loader_kwargs)
    val_loader = DataLoader(val_ds, shuffle=False, **loader_kwargs)

    device = torch.device('cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu')
    model_cfg = config.get('model', {})
    d_model = int(model_cfg.get('d_model', 768))
    model = TemporalSSLHead(
        d_model=d_model,
        aux_dim=aux_dim,
        n_heads=int(model_cfg.get('n_heads', 8)),
        n_layers=int(model_cfg.get('n_layers', model_cfg.get('temporal_layers', 4))),
        ff_dim=int(model_cfg.get('ff_dim', d_model * 4)),
        dropout=float(model_cfg.get('dropout', 0.1)),
        max_frames=int(data_cfg.get('frames_per_clip', 64)),
        qformer_layers=int(model_cfg.get('qformer_layers', 2)),
    ).to(device)

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(opt_cfg.get('lr', 2e-4)),
        weight_decay=float(opt_cfg.get('weight_decay', 0.01)),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(int(target_cfg.get('epochs', 1)), 1))
    ce = nn.CrossEntropyLoss()

    start_epoch = 1
    resume_mode = 'none'
    loaded_weight_tensors = 0

    # Honor monitor config: val_loss (minimize) or accuracy-based (maximize)
    checkpoint_cfg = config.get('checkpoint', {})
    monitor = str(checkpoint_cfg.get('monitor', 'val_loss'))
    monitor_mode = str(checkpoint_cfg.get('mode', 'min')).lower()
    best_val = float('inf') if monitor_mode == 'min' else float('-inf')
    patience = int(target_cfg.get('early_stopping_patience', 0))
    no_improve_epochs = 0

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
            aux_aot = batch['aux_aot'].to(device)
            y_aot = batch['y_aot'].to(device)
            x_sort = batch['x_sort'].to(device)
            aux_sort = batch['aux_sort'].to(device)
            y_sort = batch['y_sort'].to(device)

            optimizer.zero_grad(set_to_none=True)
            pred_aot, _ = model(x_aot, aux=aux_aot)
            _, pred_sort = model(x_sort, aux=aux_sort)
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
                aux_aot = batch['aux_aot'].to(device)
                y_aot = batch['y_aot'].to(device)
                x_sort = batch['x_sort'].to(device)
                aux_sort = batch['aux_sort'].to(device)
                y_sort = batch['y_sort'].to(device)

                pred_aot, _ = model(x_aot, aux=aux_aot)
                _, pred_sort = model(x_sort, aux=aux_sort)
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

        # Checkpoint selection theo config monitor
        current_metric = row.get(monitor, row['val_loss'])
        if monitor_mode == 'min':
            improved = current_metric < best_val
        else:
            improved = current_metric > best_val

        if improved:
            best_val = float(current_metric)
            state['best_val'] = best_val
            torch.save(state, ckpt_dir / 'temporal_ssl_best.pth')
            no_improve_epochs = 0
            print(f"  ★ New Best {monitor} = {best_val:.4f} → checkpoint saved")
        else:
            no_improve_epochs += 1
            print(f"  No improvement ({no_improve_epochs}/{patience if patience > 0 else '∞'})")

        if patience > 0 and no_improve_epochs >= patience:
            print(f"\n  🚫 Early stopping triggered after {no_improve_epochs} epochs without improvement")
            break

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
