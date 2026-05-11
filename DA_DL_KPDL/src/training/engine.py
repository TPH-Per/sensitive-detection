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
from torch.utils.data import DataLoader, WeightedRandomSampler

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
    use_weighted_sampler = bool(target_cfg.get('use_weighted_sampler', False))
    sampler_weight_cap = float(target_cfg.get('sampler_weight_cap', 10.0))

    aux_dim = int(config.get('model', {}).get('aux_dim', data_cfg.get('aux_dim', 0)))

    train_ds = ManifestFeatureDataset(Path(train_manifest), data_root, label_columns, frames_per_clip=frames_per_clip, default_aux_dim=aux_dim)
    val_ds = ManifestFeatureDataset(Path(val_manifest), data_root, label_columns, frames_per_clip=frames_per_clip, default_aux_dim=aux_dim)

    train_sampler = _build_weighted_sampler(train_ds, label_columns, cap=sampler_weight_cap) if use_weighted_sampler else None

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=train_sampler is None,
        sampler=train_sampler,
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


def _build_weighted_sampler(dataset: ManifestFeatureDataset, label_columns: list[str], cap: float = 10.0) -> WeightedRandomSampler | None:
    df = getattr(dataset, 'df', None)
    if df is None or df.empty:
        return None

    missing = [column for column in ['source', *label_columns] if column not in df.columns]
    if missing:
        return None

    label_frame = np.asarray(df[label_columns].values, dtype=np.int32)
    sources = np.asarray(df['source'].astype(str).values, dtype=object)
    signatures = np.asarray([f"v{int(row[0])}_s{int(row[1])}_n{int(row[2])}" for row in label_frame], dtype=object)
    combo_keys = np.asarray([f'{source}::{signature}' for source, signature in zip(sources.tolist(), signatures.tolist())], dtype=object)

    source_values, source_counts = np.unique(sources, return_counts=True)
    combo_values, combo_counts = np.unique(combo_keys, return_counts=True)
    source_count_map = {str(value): float(count) for value, count in zip(source_values.tolist(), source_counts.tolist())}
    combo_count_map = {str(value): float(count) for value, count in zip(combo_values.tolist(), combo_counts.tolist())}

    weights = np.empty(len(df), dtype=np.float64)
    for idx, (source, combo) in enumerate(zip(sources.tolist(), combo_keys.tolist())):
        source_weight = 1.0 / np.sqrt(max(source_count_map.get(str(source), 1.0), 1.0))
        combo_weight = 1.0 / np.sqrt(max(combo_count_map.get(str(combo), 1.0), 1.0))
        weights[idx] = source_weight * combo_weight

    if not np.isfinite(weights).all() or float(weights.sum()) <= 0:
        return None

    weights /= max(float(weights.mean()), 1e-8)
    if cap > 0:
        weights = np.clip(weights, 1e-6, cap)

    return WeightedRandomSampler(
        weights=torch.as_tensor(weights, dtype=torch.double),
        num_samples=len(weights),
        replacement=True,
    )


def _compute_pos_weight(train_loader: DataLoader, label_columns: list[str], cap: float = 20.0) -> torch.Tensor:
    dataset = getattr(train_loader, 'dataset', None)
    df = getattr(dataset, 'df', None)
    if df is None:
        return torch.ones(len(label_columns), dtype=torch.float32)

    label_frame = np.asarray(df[label_columns].values, dtype=np.float32)
    if label_frame.size == 0:
        return torch.ones(len(label_columns), dtype=torch.float32)

    pos_counts = label_frame.sum(axis=0)
    total_counts = float(label_frame.shape[0])
    neg_counts = total_counts - pos_counts
    raw_weights = np.divide(neg_counts, np.maximum(pos_counts, 1.0))
    raw_weights = np.where(pos_counts > 0, raw_weights, 1.0)
    if cap > 0:
        raw_weights = np.clip(raw_weights, 1.0, cap)
    return torch.tensor(raw_weights, dtype=torch.float32)


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


def _build_criterion(config: dict, train_loader: DataLoader, label_columns: list[str], device: torch.device) -> tuple[nn.Module, dict[str, float]]:
    target_cfg = config.get('target', {})
    use_pos_weight = bool(target_cfg.get('use_pos_weight', True))
    pos_weight_cap = float(target_cfg.get('pos_weight_cap', 20.0))
    pos_weight = _compute_pos_weight(train_loader, label_columns, cap=pos_weight_cap)
    if use_pos_weight:
        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight.to(device))
    else:
        criterion = nn.BCEWithLogitsLoss()
    return criterion, {label: float(weight) for label, weight in zip(label_columns, pos_weight.tolist())}


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

    criterion, pos_weight_map = _build_criterion(config, train_loader, label_columns, device)
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
    use_weighted_sampler = bool(target_cfg.get('use_weighted_sampler', False))
    sampler_weight_cap = float(target_cfg.get('sampler_weight_cap', 10.0))

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
        'pos_weight': pos_weight_map,
        'train_sampler': {
            'enabled': use_weighted_sampler,
            'mode': 'source_signature_product_sqrt',
            'weight_cap': sampler_weight_cap if use_weighted_sampler else 0.0,
        },
    }

    metrics_json = metrics_dir / f'{stage_name}_summary.json'
    metrics_json.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary
