from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from torch.utils.data import DataLoader
from torchvision import transforms

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from _common import prepare_runtime
from src.data.image_manifest_dataset import ImageManifestDataset
from src.models.proxy_efficientnet import build_proxy_efficientnet


def build_dataset(manifest_path: Path, data_root: Path, image_size: int) -> ImageManifestDataset:
    transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    return ImageManifestDataset(manifest_path, data_root, label_col='label', transform=transform)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=str, required=True)
    parser.add_argument('--checkpoint', type=str, required=True)
    parser.add_argument('--manifest', type=str, default=None, help='Optional manifest CSV. Defaults to data.test_manifest in config.')
    parser.add_argument('--data_root', type=str, default=None)
    parser.add_argument('--output_root', type=str, default=None)
    args = parser.parse_args()

    config, data_root, output_root = prepare_runtime(args)
    manifest_value = args.manifest or config.get('data', {}).get('test_manifest')
    if not manifest_value:
        raise ValueError('Missing NSFW manifest. Provide --manifest or data.test_manifest in config.')
    manifest_path = Path(manifest_value)

    runtime_cfg = config.get('runtime', {})
    device_name = runtime_cfg.get('device', 'cuda')
    if device_name == 'cuda' and not torch.cuda.is_available():
        device_name = 'cpu'
    device = torch.device(device_name)

    dataset = build_dataset(manifest_path, data_root, image_size=int(config.get('data', {}).get('image_size', 224)))
    loader = DataLoader(
        dataset,
        batch_size=int(config.get('target', {}).get('batch_size', 32)),
        shuffle=False,
        num_workers=int(runtime_cfg.get('num_workers', 4)),
        pin_memory=bool(runtime_cfg.get('pin_memory', True)),
    )

    model = build_proxy_efficientnet(num_classes=2, pretrained=False).to(device)
    state = torch.load(args.checkpoint, map_location=device)
    model.load_state_dict(state['model_state'] if isinstance(state, dict) and 'model_state' in state else state)
    model.eval()

    y_true = []
    y_pred = []
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            logits = model(x)
            preds = torch.argmax(logits, dim=1)
            y_true.extend(y.cpu().tolist())
            y_pred.extend(preds.cpu().tolist())

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    summary = {
        'checkpoint': args.checkpoint,
        'manifest': str(manifest_path),
        'accuracy': float(accuracy_score(y_true, y_pred)),
        'f1_nsfw': float(f1_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'recall_nsfw': float(recall_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'precision_nsfw': float(precision_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'confusion_matrix': {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)},
    }

    out_path = output_root / 'metrics' / 'nsfw_scorer_test_summary.json'
    out_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()