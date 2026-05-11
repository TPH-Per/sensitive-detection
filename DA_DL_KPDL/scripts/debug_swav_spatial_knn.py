from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.neighbors import NearestNeighbors
from torch.utils.data import DataLoader
from torchvision import transforms

from _common import prepare_runtime
from src.data.swav_dataset import SwAVEvalDataset
from src.models.swav_model import SwAVModel


ROOT = Path(__file__).resolve().parents[1]


def resolve_path(raw_path: str, root: Path) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    candidate = (root / path).resolve()
    return candidate if candidate.exists() else path


def build_eval_transform(image_size: int):
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )


@torch.no_grad()
def encode(loader: DataLoader, model: SwAVModel, device: torch.device, max_points: int) -> tuple[np.ndarray, list[str]]:
    embeddings: list[np.ndarray] = []
    labels: list[str] = []

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


def knn_score(train_embeddings: np.ndarray, train_labels: list[str], val_embeddings: np.ndarray, val_labels: list[str]) -> float:
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
    return float(np.mean([pred == true for pred, true in zip(preds, val_labels)]))


def summarize_manifest(name: str, path: Path, cap: int | None = None) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f'Manifest not found: {path}')

    df = pd.read_csv(path)
    print(f'[{name}] {path}')
    print(f'  rows={len(df)}')
    if len(df) == 0:
        print('  empty')
        return df

    if 'relative_path' in df.columns:
        print(f"  unique_paths={df['relative_path'].nunique()}")
    if 'group_id' in df.columns:
        print(f"  unique_groups={df['group_id'].nunique()}")
    if {'violence', 'self_harm', 'nsfw'}.issubset(df.columns):
        sig = df[['violence', 'self_harm', 'nsfw']].astype(int).astype(str).agg(''.join, axis=1)
        print(f'  signature_counts={sig.value_counts().to_dict()}')
    if 'source' in df.columns:
        print(f"  source_counts={df['source'].value_counts().to_dict()}")

    if cap is not None and cap > 0 and len(df) > 0:
        head_df = df.head(cap)
        print(f'  first_{cap}_rows={len(head_df)}')
        if 'source' in head_df.columns:
            print(f"  first_{cap}_source_counts={head_df['source'].value_counts().to_dict()}")
        if {'violence', 'self_harm', 'nsfw'}.issubset(head_df.columns):
            head_sig = head_df[['violence', 'self_harm', 'nsfw']].astype(int).astype(str).agg(''.join, axis=1)
            print(f'  first_{cap}_signature_counts={head_sig.value_counts().to_dict()}')
    print()
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description='Diagnose SwAV spatial KNN saturation.')
    parser.add_argument('--config', type=str, default='configs/ssl_spatial.yaml')
    parser.add_argument('--checkpoint', type=str, default='/kaggle/working/artifacts/checkpoints/ssl_spatial_best.pth')
    parser.add_argument('--data_root', type=str, default=None)
    parser.add_argument('--output_root', type=str, default=None)
    parser.add_argument('--max_points', type=int, default=0)
    parser.add_argument('--batch_size', type=int, default=32)
    args = parser.parse_args()

    data_root, output_root = None, None
    try:
        from src.utils.io_paths import resolve_roots

        data_root, output_root = resolve_roots(args.data_root, args.output_root)
    except Exception:
        pass

    if output_root is not None:
        runtime_candidate = output_root / 'runtime_configs' / f'{Path(args.config).stem}_kaggle.yaml'
        if runtime_candidate.exists():
            args.config = str(runtime_candidate)

    config, data_root, output_root = prepare_runtime(args)
    data_cfg = config.get('data', {})
    model_cfg = config.get('model', {})
    runtime_cfg = config.get('runtime', {})

    image_size = int(data_cfg.get('image_size', 224))
    eval_transform = build_eval_transform(image_size)

    train_manifest = resolve_path(str(data_cfg.get('train_manifest', '')), ROOT)
    val_manifest = resolve_path(str(data_cfg.get('val_manifest', '')), ROOT)

    max_points = max(0, int(args.max_points))

    train_df = summarize_manifest('train', train_manifest, cap=max_points)
    val_df = summarize_manifest('val', val_manifest, cap=max_points)

    if 'relative_path' in train_df.columns and 'relative_path' in val_df.columns:
        overlap = set(train_df['relative_path']).intersection(set(val_df['relative_path']))
        print(f'train/val overlap={len(overlap)}')
        if overlap:
            print(f'  overlap_examples={list(sorted(overlap))[:10]}')
        print()

    device_name = runtime_cfg.get('device', 'cuda')
    if device_name == 'cuda' and not torch.cuda.is_available():
        device_name = 'cpu'
    device = torch.device(device_name)

    model = SwAVModel(
        backbone_name=str(model_cfg.get('backbone', 'resnet18')),
        projection_dim=int(model_cfg.get('projection_dim', 128)),
        hidden_dim=int(model_cfg.get('hidden_dim', 512)),
        n_prototypes=int(model_cfg.get('n_prototypes', 300)),
    ).to(device)

    checkpoint_path = Path(args.checkpoint)
    if checkpoint_path.exists():
        state = torch.load(checkpoint_path, map_location=device)
        checkpoint_state = state.get('model_state', state) if isinstance(state, dict) else state
        model.load_state_dict(checkpoint_state, strict=False)
        print(f'Loaded checkpoint: {checkpoint_path}')
    else:
        print(f'Checkpoint not found, using random init: {checkpoint_path}')

    batch_size = int(args.batch_size)
    num_workers = int(runtime_cfg.get('num_workers', 4))
    pin_memory = bool(runtime_cfg.get('pin_memory', True))
    train_ds = SwAVEvalDataset(train_manifest, data_root, transform=eval_transform)
    val_ds = SwAVEvalDataset(val_manifest, data_root, transform=eval_transform)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin_memory)

    train_embeddings, train_labels = encode(train_loader, model, device=device, max_points=max_points)
    val_embeddings, val_labels = encode(val_loader, model, device=device, max_points=max_points)

    if len(train_labels) == 0 or len(val_labels) == 0:
        raise RuntimeError('Empty train/val embeddings; check manifests and image paths.')

    real_score = knn_score(train_embeddings, train_labels, val_embeddings, val_labels)

    shuffled_train_labels = list(train_labels)
    np.random.default_rng(42).shuffle(shuffled_train_labels)
    shuffled_score = knn_score(train_embeddings, shuffled_train_labels, val_embeddings, val_labels)

    val_majority = Counter(val_labels).most_common(1)[0][1] / len(val_labels)

    print('KNN sanity check')
    print(f'  real_score={real_score:.4f}')
    print(f'  shuffled_train_labels_score={shuffled_score:.4f}')
    print(f'  val_majority_baseline={val_majority:.4f}')

    summary = {
        'train_manifest': str(train_manifest),
        'val_manifest': str(val_manifest),
        'train_rows': int(len(train_df)),
        'val_rows': int(len(val_df)),
        'real_knn_score': real_score,
        'shuffled_train_labels_knn_score': shuffled_score,
        'val_majority_baseline': val_majority,
        'train_embeddings': int(len(train_labels)),
        'val_embeddings': int(len(val_labels)),
    }

    if output_root is not None:
        out_path = output_root / 'metrics' / 'swav_spatial_knn_sanity.json'
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
        print(f'Saved summary to: {out_path}')


if __name__ == '__main__':
    main()