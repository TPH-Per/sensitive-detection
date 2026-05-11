from __future__ import annotations

from _common import build_parser, prepare_runtime
from src.training.nsfw_trainer import train_nsfw_stage


def main() -> None:
    parser = build_parser('configs/nsfw_scorer.yaml')
    args = parser.parse_args()
    config, data_root, output_root = prepare_runtime(args)
    metrics = train_nsfw_stage(config=config, data_root=data_root, output_root=output_root, resume=args.resume)
    print(metrics)


if __name__ == '__main__':
    main()
