from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from torch.utils.data import DataLoader

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from _common import load_yaml, prepare_runtime
from src.data.manifest_dataset import ManifestFeatureDataset
from src.models.baseline_mlp import BaselineMLP
from src.models.task_prompted_model import TaskPromptedTemporalModel
from src.utils.thresholds import load_threshold_map


def unpack_batch(batch):
    if len(batch) == 3:
        return batch
    x, y = batch
    return x, None, y


def build_model(config: dict, sample_x: torch.Tensor, sample_aux: torch.Tensor | None, device: torch.device):
    model_cfg = config.get('model', {})
    model_name = str(model_cfg.get('name', 'baseline_mlp')).lower()
    input_dim = int(model_cfg.get('input_dim', sample_x.shape[-1]))
    output_dim = 3

    if model_name == 'task_prompted_transformer':
        model = TaskPromptedTemporalModel(
            input_dim=input_dim,
            aux_dim=int(model_cfg.get('aux_dim', sample_aux.shape[-1] if sample_aux is not None and sample_aux.ndim >= 2 else 0)),
            d_model=int(model_cfg.get('d_model', input_dim)),
            n_heads=int(model_cfg.get('n_heads', 8)),
            n_layers=int(model_cfg.get('n_layers', model_cfg.get('temporal_layers', 4))),
            ff_dim=int(model_cfg.get('ff_dim', 2048)),
            dropout=float(model_cfg.get('dropout', 0.1)),
            max_frames=int(config.get('data', {}).get('frames_per_clip', sample_x.shape[1] if sample_x.ndim == 3 else 1)),
            qformer_layers=int(model_cfg.get('qformer_layers', 2)),
        )
    else:
        model = BaselineMLP(
            input_dim=input_dim,
            hidden_dim=int(model_cfg.get('hidden_dim', 512)),
            output_dim=output_dim,
            dropout=float(model_cfg.get('dropout', 0.2)),
        )
    return model.to(device), model_name


def forward_logits(model, model_name: str, x: torch.Tensor, aux: torch.Tensor | None = None) -> torch.Tensor:
    if model_name == 'baseline_mlp' and x.ndim == 3:
        x = x.mean(dim=1)
    if model_name == 'task_prompted_transformer':
        return model(x, aux=aux)
    return model(x)


def prediction_matrix(y_score: np.ndarray, thresholds: dict[str, float]) -> np.ndarray:
    preds = np.zeros_like(y_score, dtype=np.float32)
    for idx, label in enumerate(['violence', 'self_harm', 'nsfw']):
        preds[:, idx] = (y_score[:, idx] >= float(thresholds.get(label, 0.5))).astype(np.float32)
    return preds


def evaluate_bucket(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: list[str],
) -> dict:
    """Compute per-label and macro metrics for a single bucket."""
    per_label = {}
    for idx, label in enumerate(labels):
        true_col = y_true[:, idx]
        pred_col = y_pred[:, idx]
        if true_col.sum() == 0 and pred_col.sum() == 0:
            per_label[label] = {'n': int(len(true_col)), 'tp': 0, 'fp': 0, 'fn': 0, 'tn': int(len(true_col)), 'f1': 0.0, 'precision': 0.0, 'recall': 0.0}
            continue
        tn, fp, fn, tp = confusion_matrix(true_col, pred_col, labels=[0, 1]).ravel()
        per_label[label] = {
            'n': int(len(true_col)),
            'tp': int(tp),
            'fp': int(fp),
            'fn': int(fn),
            'tn': int(tn),
            'f1': float(f1_score(true_col, pred_col, pos_label=1, zero_division=0)),
            'precision': float(precision_score(true_col, pred_col, pos_label=1, zero_division=0)),
            'recall': float(recall_score(true_col, pred_col, pos_label=1, zero_division=0)),
        }
    return {
        'n_samples': int(len(y_true)),
        'f1_macro': float(f1_score(y_true, y_pred, average='macro', zero_division=0)),
        'per_label': per_label,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Evaluate multitask model on challenge holdout split, broken down by bucket.')
    parser.add_argument('--config', type=str, required=True, help='Runtime config YAML (e.g. finetune_multitask_kaggle.yaml)')
    parser.add_argument('--checkpoint', type=str, required=True, help='Checkpoint .pth for the multitask model')
    parser.add_argument('--challenge_manifest', type=str, default=None, help='Path to challenge manifest CSV. If not given, derived from config test_manifest by replacing _test with _challenge.')
    parser.add_argument('--data_root', type=str, default=None)
    parser.add_argument('--output_root', type=str, default=None)
    parser.add_argument('--threshold', type=float, default=None)
    parser.add_argument('--thresholds_json', type=str, default=None, help='Optional JSON produced by evaluate_multitask.py with recommended per-label thresholds.')
    args = parser.parse_args()

    config, data_root, output_root = prepare_runtime(args)
    data_cfg = config.get('data', {})

    # Resolve challenge manifest path
    if args.challenge_manifest:
        challenge_manifest = args.challenge_manifest
    else:
        # Derive from labels dir
        labels_dir = output_root / 'data_prep' / 'labels'
        challenge_manifest = str(labels_dir / 'labels_multitask_challenge.csv')

    challenge_path = Path(challenge_manifest)
    if not challenge_path.exists():
        # Try the manifests directory as fallback
        alt_path = output_root / 'manifests' / 'multitask_challenge.csv'
        if alt_path.exists():
            challenge_path = alt_path
        else:
            raise FileNotFoundError(
                f'Challenge manifest not found at {challenge_manifest}. '
                f'Run prepare_kaggle_data.py and build_clip_features.py first.'
            )

    device_name = config.get('runtime', {}).get('device', 'cuda')
    if device_name == 'cuda' and not torch.cuda.is_available():
        device_name = 'cpu'
    device = torch.device(device_name)

    label_columns = ['violence', 'self_harm', 'nsfw']
    aux_dim = int(config.get('model', {}).get('aux_dim', 0))
    frames_per_clip = int(data_cfg.get('frames_per_clip', 64))

    config_thresholds = config.get('thresholds', {})
    if args.threshold is not None:
        thresholds = {label: float(args.threshold) for label in label_columns}
    else:
        thresholds_json = args.thresholds_json or config.get('thresholds_json')
        thresholds = load_threshold_map(thresholds_json, config_thresholds)

    # Read challenge CSV to get bucket info
    challenge_df = pd.read_csv(challenge_path)

    # Check if this is a raw labels CSV (relative_path) or a feature manifest (feature_path)
    has_features = 'feature_path' in challenge_df.columns

    if not has_features:
        print('WARNING: Challenge manifest does not have feature_path column.')
        print('You need to run build_clip_features.py on the challenge split first.')
        print('Example:')
        print('  python scripts/build_clip_features.py \\')
        print(f'    --labels_csv {challenge_manifest} \\')
        print('    --input_root /kaggle/input \\')
        print('    --output_root /kaggle/working/artifacts \\')
        print('    --manifest_out /kaggle/working/artifacts/manifests/multitask_challenge.csv \\')
        print('    --feature_subdir features/multitask_challenge \\')
        print('    --save_aux_features \\')
        print('    --aux_subdir aux_features/multitask_challenge \\')
        print('    --yolo_weights $YOLO_WEIGHTS \\')
        print('    --nsfw_weights $NSFW_WEIGHTS \\')
        print('    --skip_existing')
        sys.exit(1)

    dataset = ManifestFeatureDataset(
        challenge_path,
        data_root,
        label_columns,
        frames_per_clip=frames_per_clip,
        default_aux_dim=aux_dim,
    )
    loader = DataLoader(
        dataset,
        batch_size=int(config.get('target', {}).get('batch_size', 4)),
        shuffle=False,
    )

    sample_batch = next(iter(loader))
    sample_x, sample_aux, _ = unpack_batch(sample_batch)
    model, model_name = build_model(config, sample_x, sample_aux, device=device)

    state = torch.load(args.checkpoint, map_location=device)
    checkpoint_state = state.get('model_state', state)
    model.load_state_dict(checkpoint_state, strict=False)
    model.eval()

    threshold = args.threshold if args.threshold is not None else float(config.get('target', {}).get('decision_threshold', 0.5))

    y_true_all = []
    y_pred_all = []

    with torch.no_grad():
        for batch in loader:
            x, aux, y = unpack_batch(batch)
            x = x.to(device)
            aux = aux.to(device) if aux is not None else None
            logits = forward_logits(model, model_name, x, aux=aux)
            probs = torch.sigmoid(logits)
            preds = torch.tensor(prediction_matrix(probs.cpu().numpy(), thresholds), dtype=torch.float32)
            y_true_all.append(y.numpy())
            y_pred_all.append(preds.cpu().numpy())

    y_true_np = np.concatenate(y_true_all, axis=0)
    y_pred_np = np.concatenate(y_pred_all, axis=0)

    # Overall challenge metrics
    overall = evaluate_bucket(y_true_np, y_pred_np, label_columns)

    # Per-bucket breakdown
    bucket_col = 'challenge_bucket' if 'challenge_bucket' in challenge_df.columns else None
    per_bucket = {}
    if bucket_col:
        buckets = challenge_df[bucket_col].fillna('').unique().tolist()
        for bucket_name in sorted([b for b in buckets if b]):
            bucket_mask = challenge_df[bucket_col].fillna('').eq(bucket_name).values
            if bucket_mask.sum() == 0:
                continue
            # Align mask to dataset length (may differ if dataset skipped rows)
            if len(bucket_mask) == len(y_true_np):
                bt = y_true_np[bucket_mask]
                bp = y_pred_np[bucket_mask]
                per_bucket[bucket_name] = evaluate_bucket(bt, bp, label_columns)

    summary = {
        'checkpoint': args.checkpoint,
        'challenge_manifest': str(challenge_path),
        'thresholds': thresholds,
        'overall': overall,
        'per_bucket': per_bucket,
    }

    out_dir = output_root / 'metrics'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / 'challenge_holdout_summary.json'
    out_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
