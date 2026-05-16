from __future__ import annotations

from _common import build_parser, prepare_runtime
from src.training.temporal_ssl_trainer import train_temporal_ssl


def main() -> None:
    parser = build_parser('configs/temporal_ssl_pretext.yaml')
    args = parser.parse_args()
    config, data_root, output_root = prepare_runtime(args)
    summary = train_temporal_ssl(config=config, data_root=data_root, output_root=output_root, resume=args.resume)
    print(summary)


if __name__ == '__main__':
    main()
