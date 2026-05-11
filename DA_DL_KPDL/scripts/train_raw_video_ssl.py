"""
train_raw_video_ssl.py
Entry point for Cell 16b: Temporal SSL pretext training on raw video frames.

Usage on Kaggle:
    python scripts/train_raw_video_ssl.py \\
        --config /kaggle/working/artifacts/runtime_configs/raw_video_ssl_kaggle.yaml \\
        --data_root /kaggle/input \\
        --output_root /kaggle/working/artifacts \\
        --resume /kaggle/input/datasets/caoqucph/trong-so/trong_so/ssl_spatial_best.pth
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from _common import build_parser, prepare_runtime
from src.training.raw_video_ssl_trainer import train_raw_video_ssl


def main() -> None:
    parser = build_parser('configs/raw_video_ssl.yaml')
    args   = parser.parse_args()
    config, data_root, output_root = prepare_runtime(args)
    summary = train_raw_video_ssl(
        config=config,
        data_root=data_root,
        output_root=output_root,
        resume=args.resume,
    )
    print(summary)


if __name__ == '__main__':
    main()
