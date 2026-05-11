from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from torch.utils.data import DataLoader
from torchvision import transforms

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from _common import prepare_runtime
from src.data.image_manifest_dataset import ImageManifestDataset
from src.data.proxy_array_dataset import ProxyArrayDataset
from src.models.proxy_efficientnet import build_proxy_efficientnet


def build_dataset(manifest_path: Path, data_root: Path, image_size: int):
    transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    import pandas as pd

    columns = pd.read_csv(manifest_path, nrows=0).columns.tolist()
    if 'array_path' in columns:
        return ProxyArrayDataset(manifest_path, data_root, transform=transform)
    return ImageManifestDataset(manifest_path, data_root, transform=transform)


def forward_logits(model, x: torch.Tensor) -> torch.Tensor:
    if x.ndim == 5:
        batch_size, time_steps, channels, height, width = x.shape
        logits = model(x.reshape(batch_size * time_steps, channels, height, width))
        return logits.view(batch_size, time_steps, -1).mean(dim=1)
    return model(x)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=str, required=True)
    parser.add_argument('--checkpoint', type=str, required=True)
    parser.add_argument('--data_root', type=str, default=None)
    parser.add_argument('--output_root', type=str, default=None)
    args = parser.parse_args()

    config, data_root, output_root = prepare_runtime(args)
    test_manifest = config.get('data', {}).get('test_manifest')
    if not test_manifest:
        raise ValueError('Missing data.test_manifest in config')

    runtime_cfg = config.get('runtime', {})
    device_name = runtime_cfg.get('device', 'cuda')
    if device_name == 'cuda' and not torch.cuda.is_available():
        device_name = 'cpu'
    device = torch.device(device_name)

    dataset = build_dataset(Path(test_manifest), data_root, image_size=int(config.get('data', {}).get('image_size', 224)))
    loader = DataLoader(
        dataset,
        batch_size=int(config.get('target', {}).get('batch_size', 32)),
        shuffle=False,
        num_workers=int(runtime_cfg.get('num_workers', 4)),
        pin_memory=bool(runtime_cfg.get('pin_memory', True)),
    )

    model = build_proxy_efficientnet(num_classes=2, pretrained=False).to(device)
    state = torch.load(args.checkpoint, map_location=device)
    model.load_state_dict(state['model_state'] if 'model_state' in state else state)
    model.eval()

    y_true = []
    y_pred = []
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device, non_blocking=True)
            logits = forward_logits(model, x)
            preds = torch.argmax(logits, dim=1)
            y_true.extend(y.tolist())
            y_pred.extend(preds.cpu().tolist())

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    summary = {
        'checkpoint': args.checkpoint,
        'test_manifest': str(test_manifest),
        'recall_risky': float(recall_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'precision_risky': float(precision_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'f1_binary': float(f1_score(y_true, y_pred, pos_label=1, zero_division=0)),
        'confusion_matrix': {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)},
    }

    out_path = output_root / 'metrics' / 'proxy_test_summary.json'
    out_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
