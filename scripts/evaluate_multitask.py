from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib
import numpy as np
import torch
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from torch.utils.data import DataLoader

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from _common import prepare_runtime
from src.data.manifest_dataset import ManifestFeatureDataset
from src.models.baseline_mlp import BaselineMLP
from src.models.task_prompted_model import TaskPromptedTemporalModel
from src.utils.thresholds import load_threshold_map

LABEL_COLUMNS = ['violence', 'self_harm', 'nsfw']


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


def resolve_manifest(config: dict, args) -> Path:
    if args.manifest:
        return Path(args.manifest)

    data_cfg = config.get('data', {})
    test_manifest = data_cfg.get('test_manifest')
    if not test_manifest:
        raise ValueError('Missing data.test_manifest in config')
    return Path(test_manifest)


def prediction_matrix(y_score: np.ndarray, thresholds: dict[str, float] | float) -> np.ndarray:
    preds = np.zeros_like(y_score, dtype=np.float32)
    if isinstance(thresholds, dict):
        for idx, label in enumerate(LABEL_COLUMNS):
            preds[:, idx] = (y_score[:, idx] >= float(thresholds.get(label, 0.5))).astype(np.float32)
    else:
        preds = (y_score >= float(thresholds)).astype(np.float32)
    return preds


def label_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    per_label = {}
    for idx, label in enumerate(LABEL_COLUMNS):
        tn, fp, fn, tp = confusion_matrix(y_true[:, idx], y_pred[:, idx], labels=[0, 1]).ravel()
        per_label[label] = {
            'tn': int(tn),
            'fp': int(fp),
            'fn': int(fn),
            'tp': int(tp),
            'precision': float(precision_score(y_true[:, idx], y_pred[:, idx], pos_label=1, zero_division=0)),
            'recall': float(recall_score(y_true[:, idx], y_pred[:, idx], pos_label=1, zero_division=0)),
            'f1': float(f1_score(y_true[:, idx], y_pred[:, idx], pos_label=1, zero_division=0)),
        }

    return {
        'f1_macro': float(f1_score(y_true, y_pred, average='macro', zero_division=0)),
        'f1_micro': float(f1_score(y_true, y_pred, average='micro', zero_division=0)),
        'precision_macro': float(precision_score(y_true, y_pred, average='macro', zero_division=0)),
        'recall_macro': float(recall_score(y_true, y_pred, average='macro', zero_division=0)),
        'per_label': per_label,
    }


def single_label_metrics(y_true: np.ndarray, y_pred: np.ndarray, label: str) -> dict:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        'tn': int(tn),
        'fp': int(fp),
        'fn': int(fn),
        'tp': int(tp),
        'precision': float(precision_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'recall': float(recall_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'f1': float(f1_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'label': label,
    }


def compute_threshold_candidates(y_true: np.ndarray, y_score: np.ndarray, beta: float) -> dict:
    candidates: dict[str, dict] = {}
    eps = np.finfo(np.float64).eps

    def _best_pr_threshold(pr_precision: np.ndarray, pr_recall: np.ndarray, pr_thresholds: np.ndarray, beta_value: float) -> float:
        if pr_thresholds.size == 0 or pr_precision.size == 0 or pr_recall.size == 0:
            return 0.5

        beta_sq = beta_value * beta_value
        scores = ((1.0 + beta_sq) * pr_precision * pr_recall) / np.maximum(beta_sq * pr_precision + pr_recall, eps)
        if scores.size == 0:
            return 0.5
        best_idx = int(np.nanargmax(scores))
        return float(pr_thresholds[min(best_idx, len(pr_thresholds) - 1)])

    for idx, label in enumerate(LABEL_COLUMNS):
        y = y_true[:, idx].astype(int)
        score = y_score[:, idx].astype(float)
        support_pos = int(y.sum())
        support_neg = int(len(y) - support_pos)
        label_report: dict[str, object] = {
            'support_positive': support_pos,
            'support_negative': support_neg,
            'prevalence': float(support_pos / max(len(y), 1)),
        }

        if support_pos == 0 or support_neg == 0:
            label_report.update(
                {
                    'roc_auc': None,
                    'average_precision': None,
                    'thresholds': {'youden': 0.5, 'f1': 0.5, f'f{beta:g}': 0.5},
                }
            )
            candidates[label] = label_report
            continue

        fpr, tpr, roc_thresholds = roc_curve(y, score)
        precision, recall, pr_thresholds = precision_recall_curve(y, score)

        roc_auc = float(roc_auc_score(y, score))
        pr_auc = float(average_precision_score(y, score))

        youden_scores = tpr[1:] - fpr[1:] if len(tpr) > 1 else np.array([])
        if youden_scores.size > 0:
            youden_idx = int(np.nanargmax(youden_scores)) + 1
            youden_threshold = float(roc_thresholds[youden_idx]) if np.isfinite(roc_thresholds[youden_idx]) else 0.5
        else:
            youden_threshold = 0.5

        if pr_thresholds.size > 0:
            pr_precision = precision[:-1]
            pr_recall = recall[:-1]
            f1_scores = (2.0 * pr_precision * pr_recall) / np.maximum(pr_precision + pr_recall, eps)
            f1_idx = int(np.nanargmax(f1_scores)) if f1_scores.size > 0 else 0
            f1_threshold = float(pr_thresholds[min(f1_idx, len(pr_thresholds) - 1)])
            f2_threshold = _best_pr_threshold(pr_precision, pr_recall, pr_thresholds, 2.0)
            fbeta_threshold = _best_pr_threshold(pr_precision, pr_recall, pr_thresholds, beta)
        else:
            f1_threshold = 0.5
            f2_threshold = 0.5
            fbeta_threshold = 0.5

        label_report.update(
            {
                'roc_auc': roc_auc,
                'average_precision': pr_auc,
                'thresholds': {
                    'youden': youden_threshold,
                    'f1': f1_threshold,
                    'f2': f2_threshold,
                    f'f{beta:g}': fbeta_threshold,
                },
            }
        )
        candidates[label] = label_report

    return candidates


def plot_roc_curves(y_true: np.ndarray, y_score: np.ndarray, out_path: Path, title: str) -> None:
    fig, axes = plt.subplots(1, len(LABEL_COLUMNS), figsize=(5 * len(LABEL_COLUMNS), 4), sharex=True, sharey=True)
    axes = np.atleast_1d(axes)

    for idx, label in enumerate(LABEL_COLUMNS):
        ax = axes[idx]
        y = y_true[:, idx].astype(int)
        score = y_score[:, idx].astype(float)
        if len(np.unique(y)) < 2:
            ax.text(0.5, 0.5, 'ROC undefined\n(single class)', ha='center', va='center', fontsize=10)
            ax.set_xlim(0, 1)
            ax.set_ylim(0, 1)
            ax.set_title(label)
            ax.grid(True, alpha=0.2)
            continue

        fpr, tpr, _ = roc_curve(y, score)
        auc_value = roc_auc_score(y, score)
        ax.plot(fpr, tpr, color='#1565c0', linewidth=2, label=f'AUC={auc_value:.3f}')
        ax.plot([0, 1], [0, 1], linestyle='--', color='#9e9e9e', linewidth=1)
        ax.set_title(label)
        ax.set_xlabel('False Positive Rate')
        ax.set_ylabel('True Positive Rate')
        ax.grid(True, alpha=0.2)
        ax.legend(loc='lower right')

    fig.suptitle(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200, bbox_inches='tight')
    plt.close(fig)


def plot_pr_curves(y_true: np.ndarray, y_score: np.ndarray, out_path: Path, title: str) -> None:
    fig, axes = plt.subplots(1, len(LABEL_COLUMNS), figsize=(5 * len(LABEL_COLUMNS), 4), sharex=True, sharey=True)
    axes = np.atleast_1d(axes)

    for idx, label in enumerate(LABEL_COLUMNS):
        ax = axes[idx]
        y = y_true[:, idx].astype(int)
        score = y_score[:, idx].astype(float)
        if len(np.unique(y)) < 2:
            ax.text(0.5, 0.5, 'PR undefined\n(single class)', ha='center', va='center', fontsize=10)
            ax.set_xlim(0, 1)
            ax.set_ylim(0, 1)
            ax.set_title(label)
            ax.grid(True, alpha=0.2)
            continue

        precision, recall, _ = precision_recall_curve(y, score)
        ap_value = average_precision_score(y, score)
        prevalence = float(y.mean())
        ax.plot(recall, precision, color='#2e7d32', linewidth=2, label=f'AP={ap_value:.3f}')
        ax.hlines(prevalence, 0, 1, colors='#9e9e9e', linestyles='--', linewidth=1, label=f'Base={prevalence:.3f}')
        ax.set_title(label)
        ax.set_xlabel('Recall')
        ax.set_ylabel('Precision')
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.grid(True, alpha=0.2)
        ax.legend(loc='lower left')

    fig.suptitle(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200, bbox_inches='tight')
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=str, required=True)
    parser.add_argument('--checkpoint', type=str, required=True)
    parser.add_argument('--manifest', type=str, default=None, help='Optional feature manifest to evaluate. Defaults to the config test_manifest.')
    parser.add_argument('--data_root', type=str, default=None)
    parser.add_argument('--output_root', type=str, default=None)
    parser.add_argument('--threshold', type=float, default=None, help='Scalar threshold used for the baseline metrics.')
    parser.add_argument('--thresholds_json', type=str, default=None, help='Optional JSON file with calibrated per-label thresholds from another split.')
    parser.add_argument('--calibration_mode', type=str, default='f2', choices=['youden', 'f1', 'f2', 'f0.5'], help='Which threshold recommendation to promote for moderation; use f0.5 when precision is the priority.')
    parser.add_argument('--beta', type=float, default=2.0, help='Beta used for the F-beta threshold search.')
    args = parser.parse_args()

    config, data_root, output_root = prepare_runtime(args)
    data_cfg = config.get('data', {})
    eval_cfg = config.get('evaluation', {})
    calibration_mode = str(eval_cfg.get('calibration_mode', args.calibration_mode)).lower()
    beta = float(eval_cfg.get('beta', args.beta))
    manifest_path = resolve_manifest(config, args)
    if not manifest_path.is_absolute():
        manifest_path = (Path.cwd() / manifest_path).resolve()

    device_name = config.get('runtime', {}).get('device', 'cuda')
    if device_name == 'cuda' and not torch.cuda.is_available():
        device_name = 'cpu'
    device = torch.device(device_name)

    dataset = ManifestFeatureDataset(
        manifest_path,
        data_root,
        LABEL_COLUMNS,
        frames_per_clip=int(data_cfg.get('frames_per_clip', 64)),
        default_aux_dim=int(config.get('model', {}).get('aux_dim', 0)),
    )
    loader = DataLoader(dataset, batch_size=int(config.get('target', {}).get('batch_size', 4)), shuffle=False)

    sample_batch = next(iter(loader))
    sample_x, sample_aux, _ = unpack_batch(sample_batch)
    model, model_name = build_model(config, sample_x, sample_aux, device=device)

    state = torch.load(args.checkpoint, map_location=device)
    checkpoint_state = state.get('model_state', state)
    model.load_state_dict(checkpoint_state, strict=False)
    model.eval()

    y_true = []
    y_score = []
    with torch.no_grad():
        for batch in loader:
            x, aux, y = unpack_batch(batch)
            x = x.to(device)
            aux = aux.to(device) if aux is not None else None
            logits = forward_logits(model, model_name, x, aux=aux)
            probs = torch.sigmoid(logits)
            y_true.append(y.numpy())
            y_score.append(probs.cpu().numpy())

    y_true_np = np.concatenate(y_true, axis=0)
    y_score_np = np.concatenate(y_score, axis=0)

    default_threshold = args.threshold if args.threshold is not None else float(config.get('target', {}).get('decision_threshold', 0.5))
    default_pred = prediction_matrix(y_score_np, default_threshold)
    default_metrics = label_metrics(y_true_np, default_pred)

    external_thresholds = load_threshold_map(
        args.thresholds_json,
        {label: float(default_threshold) for label in LABEL_COLUMNS},
    )
    external_pred = prediction_matrix(y_score_np, external_thresholds)
    external_metrics = label_metrics(y_true_np, external_pred)

    threshold_candidates = compute_threshold_candidates(y_true_np, y_score_np, beta=beta)
    recommended_thresholds = {
        label: float(report['thresholds'][calibration_mode])
        for label, report in threshold_candidates.items()
    }
    recommended_pred = prediction_matrix(y_score_np, recommended_thresholds)
    recommended_metrics = label_metrics(y_true_np, recommended_pred)

    output_name = manifest_path.stem
    metrics_dir = output_root / 'metrics'
    metrics_dir.mkdir(parents=True, exist_ok=True)

    roc_path = metrics_dir / f'{output_name}_roc.png'
    pr_path = metrics_dir / f'{output_name}_pr.png'
    thresholds_path = metrics_dir / f'{output_name}_thresholds.json'
    summary_path = metrics_dir / f'{output_name}_summary.json'

    plot_roc_curves(
        y_true_np,
        y_score_np,
        roc_path,
        title=f'ROC curves for {output_name}',
    )
    plot_pr_curves(
        y_true_np,
        y_score_np,
        pr_path,
        title=f'Precision-Recall curves for {output_name}',
    )

    threshold_payload = {
        'manifest': str(manifest_path),
        'checkpoint': args.checkpoint,
        'thresholds_json': args.thresholds_json,
        'calibration_mode': calibration_mode,
        'beta': beta,
        'default_threshold': float(default_threshold),
        'external_thresholds': external_thresholds,
        'recommended_thresholds': recommended_thresholds,
        'per_label': {
            label: {
                'support_positive': report['support_positive'],
                'support_negative': report['support_negative'],
                'prevalence': report['prevalence'],
                'roc_auc': report['roc_auc'],
                'average_precision': report['average_precision'],
                'thresholds': report['thresholds'],
            }
            for label, report in threshold_candidates.items()
        },
    }
    thresholds_path.write_text(json.dumps(threshold_payload, indent=2), encoding='utf-8')

    summary = {
        'checkpoint': args.checkpoint,
        'manifest': str(manifest_path),
        'thresholds_json': args.thresholds_json,
        'default_threshold': float(default_threshold),
        'calibration_mode': calibration_mode,
        'beta': beta,
        'default_metrics': default_metrics,
        'external_thresholds': external_thresholds,
        'external_thresholds_metrics': external_metrics,
        'recommended_thresholds': recommended_thresholds,
        'recommended_metrics': recommended_metrics,
        'per_label': {
            label: {
                'support_positive': report['support_positive'],
                'support_negative': report['support_negative'],
                'prevalence': report['prevalence'],
                'roc_auc': report['roc_auc'],
                'average_precision': report['average_precision'],
                'thresholds': report['thresholds'],
                'metrics_at_default': single_label_metrics(
                    y_true_np[:, idx],
                    default_pred[:, idx],
                    label,
                ),
                'metrics_at_recommended': single_label_metrics(
                    y_true_np[:, idx],
                    recommended_pred[:, idx],
                    label,
                ),
            }
            for idx, (label, report) in enumerate(threshold_candidates.items())
        },
        'artifacts': {
            'roc_plot': str(roc_path),
            'pr_plot': str(pr_path),
            'thresholds_json': str(thresholds_path),
        },
    }

    summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
