from __future__ import annotations

from _common import build_parser, prepare_runtime
from src.training.proxy_trainer import train_proxy_stage


def main() -> None:
    parser = build_parser('configs/proxy_efficientnet.yaml')
    args = parser.parse_args()
    config, data_root, output_root = prepare_runtime(args)
    summary = train_proxy_stage(config=config, data_root=data_root, output_root=output_root, resume=args.resume)
    print(summary)


if __name__ == '__main__':
    main()
