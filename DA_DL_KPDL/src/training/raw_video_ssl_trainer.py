"""
raw_video_ssl_trainer.py  (v2 — Fixed training loop)

Fixes applied:
  Fix #1: BCEWithLogitsLoss thay CrossEntropyLoss
  Fix #2: Progressive unfreeze + optimizer rebuild mỗi khi unfreeze
  Fix #6: Diagnostic metrics (cosine sim, rank, variance) mỗi epoch
"""
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

from src.data.raw_video_ssl_dataset import RawVideoSSLDataset
from src.models.raw_video_ssl_model import RawVideoSSLModel


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


def _acc_binary(logits: torch.Tensor, labels: torch.Tensor) -> float:
    """Fix #1: Binary accuracy — logits > 0 means positive."""
    preds = (logits > 0).float()
    return (preds == labels).float().mean().item()


def _build_optimizer(model: nn.Module, lr: float, wd: float) -> torch.optim.Optimizer:
    """Rebuild optimizer with only trainable params (called after unfreeze)."""
    params = [p for p in model.parameters() if p.requires_grad]
    return torch.optim.AdamW(params, lr=lr, weight_decay=wd)


def train_raw_video_ssl(
    config: dict,
    data_root: Path,
    output_root: Path,
    resume: str | None = None,
) -> dict:
    start_time = time.time()
    stage_name = 'raw_video_ssl_v2'

    seed = int(config.get('project', {}).get('seed', 42))
    _set_seed(seed)

    data_cfg    = config.get('data', {})
    model_cfg   = config.get('model', {})
    opt_cfg     = config.get('optimizer', {})
    target_cfg  = config.get('target', {})
    ckpt_cfg    = config.get('checkpoint', {})
    runtime_cfg = config.get('runtime', {})

    # ── Datasets ────────────────────────────────────────────────────────────
    n_frames   = int(data_cfg.get('n_frames', 16))
    frame_size = int(data_cfg.get('frame_size', 112))

    train_labels = Path(data_cfg['train_labels'])
    val_labels   = Path(data_cfg['val_labels'])

    print(f'  Loading train dataset from: {train_labels}')
    train_ds = RawVideoSSLDataset(train_labels, data_root, n_frames=n_frames, frame_size=frame_size)
    print(f'  → {len(train_ds)} training videos')

    print(f'  Loading val dataset from:   {val_labels}')
    val_ds = RawVideoSSLDataset(val_labels, data_root, n_frames=n_frames, frame_size=frame_size)
    print(f'  → {len(val_ds)} validation videos')

    batch_size  = int(target_cfg.get('batch_size', 8))
    num_workers = int(target_cfg.get('num_workers', runtime_cfg.get('num_workers', 2)))
    epochs      = int(target_cfg.get('epochs', 20))
    lr          = float(opt_cfg.get('lr', 3e-4))
    wd          = float(opt_cfg.get('weight_decay', 0.01))

    print(f'  Config → epochs={epochs}, batch={batch_size}, workers={num_workers}, '
          f'lr={lr:.0e}, patience={target_cfg.get("early_stopping_patience", 7)}')

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True,
                              num_workers=num_workers, pin_memory=True, drop_last=True)
    val_loader   = DataLoader(val_ds, batch_size=batch_size, shuffle=False,
                              num_workers=num_workers, pin_memory=True)

    # ── Model ───────────────────────────────────────────────────────────────
    device = torch.device(
        'cuda' if runtime_cfg.get('device', 'cuda') == 'cuda' and torch.cuda.is_available() else 'cpu'
    )
    print(f'  Device: {device}')

    model = RawVideoSSLModel(
        pretrained=False,
        hidden_dim=int(model_cfg.get('hidden_dim', 512)),
        proj_dim=int(model_cfg.get('proj_dim', 256)),
        dropout=float(model_cfg.get('dropout', 0.3)),
    ).to(device)

    # SwAV warm-start
    loaded_tensors = 0
    if resume and Path(resume).exists():
        loaded_tensors = model.load_swav_weights(resume, device)
        print(f'  ✅ SwAV warm-start: loaded {loaded_tensors} tensors from {Path(resume).name}')
    else:
        print(f'  ℹ️  No SwAV checkpoint — training backbone from scratch')

    # Initial unfreeze state (epoch 0 → only layer4 + heads + projector + attention)
    freeze_state = model.progressive_unfreeze(0)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total     = sum(p.numel() for p in model.parameters())
    print(f'  Parameters: {trainable:,} trainable / {total:,} total')
    print(f'  Unfrozen: {freeze_state}')

    # ── Fix #1: BCEWithLogitsLoss ────────────────────────────────────────────
    criterion = nn.BCEWithLogitsLoss()

    optimizer = _build_optimizer(model, lr, wd)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1))

    # ── Checkpoint tracking ──────────────────────────────────────────────────
    monitor      = str(ckpt_cfg.get('monitor', 'val_loss'))
    monitor_mode = str(ckpt_cfg.get('mode', 'min')).lower()
    best_val     = float('inf') if monitor_mode == 'min' else float('-inf')
    patience     = int(target_cfg.get('early_stopping_patience', 7))
    no_improve   = 0

    ckpt_dir    = output_root / 'checkpoints'
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    history_csv = output_root / 'metrics' / 'raw_video_ssl_v2_history.csv'
    prev_freeze_state = freeze_state

    # ── Training loop ────────────────────────────────────────────────────────
    for epoch in range(1, epochs + 1):

        # Fix #2: Progressive unfreeze
        freeze_state = model.progressive_unfreeze(epoch)
        if freeze_state != prev_freeze_state:
            # Rebuild optimizer with newly unfrozen params
            optimizer = _build_optimizer(model, scheduler.get_last_lr()[0], wd)
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=max(epochs - epoch + 1, 1))
            trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
            print(f'\n  🔓 Epoch {epoch}: Unfroze → {freeze_state}  '
                  f'({trainable:,} trainable params)')
            prev_freeze_state = freeze_state

        # ---- Train ----
        model.train()
        t_loss = 0.0
        n_batches = 0

        for batch in train_loader:
            fd  = batch['frames_direction'].to(device)
            fs  = batch['frames_speed'].to(device)
            fsh = batch['frames_shuffle'].to(device)
            yd  = batch['y_direction'].to(device)     # FloatTensor
            ys  = batch['y_speed'].to(device)
            ysh = batch['y_shuffle'].to(device)

            optimizer.zero_grad(set_to_none=True)

            logits_d, logits_s, logits_sh = model(fd, fs, fsh)

            # Fix #1: BCE loss (labels are float 0.0/1.0)
            loss = (criterion(logits_d, yd)
                    + criterion(logits_s, ys)
                    + criterion(logits_sh, ysh))

            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            t_loss += loss.item()
            n_batches += 1

        train_loss_avg = t_loss / max(n_batches, 1)

        # ---- Validate ----
        model.eval()
        v_loss = acc_d = acc_s = acc_sh = 0.0
        m_batches = 0
        diag_clip = None

        with torch.no_grad():
            for batch in val_loader:
                fd  = batch['frames_direction'].to(device)
                fs  = batch['frames_speed'].to(device)
                fsh = batch['frames_shuffle'].to(device)
                yd  = batch['y_direction'].to(device)
                ys  = batch['y_speed'].to(device)
                ysh = batch['y_shuffle'].to(device)

                logits_d, logits_s, logits_sh = model(fd, fs, fsh)
                loss = (criterion(logits_d, yd)
                        + criterion(logits_s, ys)
                        + criterion(logits_sh, ysh))

                v_loss += loss.item()
                acc_d  += _acc_binary(logits_d, yd)
                acc_s  += _acc_binary(logits_s, ys)
                acc_sh += _acc_binary(logits_sh, ysh)
                m_batches += 1

                if diag_clip is None:
                    diag_clip = batch['frames_direction'][:min(4, fd.shape[0])]

        val_loss_avg = v_loss / max(m_batches, 1)
        acc_d_avg    = acc_d  / max(m_batches, 1)
        acc_s_avg    = acc_s  / max(m_batches, 1)
        acc_sh_avg   = acc_sh / max(m_batches, 1)
        lr_now       = optimizer.param_groups[0]['lr']

        scheduler.step()

        # Fix #6: Diagnostic metrics
        diag = {}
        if diag_clip is not None:
            diag = model.compute_diagnostics(diag_clip, device)

        # ── Log ─────────────────────────────────────────────────────────────
        print(f'\n{"=" * 64}')
        print(f'  [Raw Video SSL v2] Epoch {epoch}/{epochs}  (unfrozen: {freeze_state})')
        print(f'{"=" * 64}')
        print(f'  Train Loss        : {train_loss_avg:.4f}')
        print(f'  Val   Loss        : {val_loss_avg:.4f}  (gap: {abs(val_loss_avg - train_loss_avg):.4f})')
        print(f'  Val Direction Acc : {acc_d_avg:.4f}  ← target: >0.65')
        print(f'  Val Speed Acc     : {acc_s_avg:.4f}  ← target: >0.60')
        print(f'  Val Shuffle Acc   : {acc_sh_avg:.4f}  ← target: >0.60')
        print(f'  LR                : {lr_now:.2e}')

        if diag:
            sim  = diag.get('frame_cosine_sim', 0)
            rank = diag.get('effective_rank', 0)
            tvar = diag.get('temporal_var', 0)
            print(f'  ── Diagnostics ──')
            print(f'  Frame Cosine Sim  : {sim:.4f}  '
                  f'{"⚠️ COLLAPSE!" if sim > 0.95 else "✅ OK" if sim < 0.90 else "🟡 borderline"}')
            print(f'  Effective Rank    : {rank}/512  '
                  f'{"⚠️ LOW!" if rank < 50 else "✅ OK" if rank > 100 else "🟡 borderline"}')
            print(f'  Temporal Variance : {tvar:.6f}  '
                  f'{"⚠️ NO SIGNAL!" if tvar < 0.01 else "✅ OK" if tvar > 0.1 else "🟡 low"}')

        overall = (acc_d_avg + acc_s_avg + acc_sh_avg) / 3
        if overall < 0.52:
            print(f'  🔴 Model chưa học được — chờ thêm / kiểm tra diagnostics')
        elif overall < 0.62:
            print(f'  🟡 Model đang học — tín hiệu tốt!')
        else:
            print(f'  🟢 Model học tốt — tiếp tục!')

        row = {
            'epoch': epoch, 'train_loss': round(train_loss_avg, 4),
            'val_loss': round(val_loss_avg, 4),
            'val_direction_acc': round(acc_d_avg, 4),
            'val_speed_acc': round(acc_s_avg, 4),
            'val_shuffle_acc': round(acc_sh_avg, 4),
            'lr': lr_now, 'unfrozen': freeze_state,
            'frame_cosine_sim': diag.get('frame_cosine_sim', ''),
            'effective_rank': diag.get('effective_rank', ''),
            'temporal_var': diag.get('temporal_var', ''),
        }
        _append_csv(history_csv, row)

        # ── Checkpoint ──────────────────────────────────────────────────────
        state = {
            'epoch': epoch, 'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'scheduler_state': scheduler.state_dict(),
            'best_val': best_val, 'stage_name': stage_name, 'config': config,
        }
        torch.save(state, ckpt_dir / 'raw_video_ssl_last.pth')

        current_metric = row.get(monitor, row['val_loss'])
        improved = (current_metric < best_val) if monitor_mode == 'min' else (current_metric > best_val)

        if improved:
            best_val = float(current_metric)
            state['best_val'] = best_val
            torch.save(state, ckpt_dir / 'raw_video_ssl_best.pth')
            no_improve = 0
            print(f'  ★ New Best {monitor} = {best_val:.4f} → saved')
        else:
            no_improve += 1
            print(f'  No improvement ({no_improve}/{patience})')

        if patience > 0 and no_improve >= patience:
            print(f'\n  🚫 Early stopping at epoch {epoch}')
            break

    elapsed = round(time.time() - start_time, 1)
    summary = {
        'stage': stage_name, 'status': 'finished',
        'loaded_swav_tensors': loaded_tensors,
        'best_val_metric': best_val, 'monitor': monitor,
        'history_csv': str(history_csv), 'elapsed_seconds': elapsed,
        'best_checkpoint': str(ckpt_dir / 'raw_video_ssl_best.pth'),
        'last_checkpoint': str(ckpt_dir / 'raw_video_ssl_last.pth'),
    }
    summary_path = output_root / 'metrics' / 'raw_video_ssl_v2_summary.json'
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')

    print(f'\n  ✅ Raw Video SSL v2 hoàn tất ({elapsed}s = {elapsed / 60:.1f} phút)')
    print(f'  Best checkpoint: {summary["best_checkpoint"]}')
    return summary
