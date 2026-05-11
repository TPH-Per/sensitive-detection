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
        if not embeddings:
            return np.zeros((0, 1), dtype=np.float32), []
        arr = np.concatenate(embeddings, axis=0)
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
