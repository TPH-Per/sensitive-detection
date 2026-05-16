from __future__ import annotations

from _common import build_parser, prepare_runtime
from src.training.engine import run_training_stage
from src.training.swav_trainer import train_swav_stage


def main() -> None:
    parser = build_parser('configs/ssl_spatial.yaml')
    args = parser.parse_args()
    config, data_root, output_root = prepare_runtime(args)

    model_name = str(config.get('model', {}).get('name', 'baseline_mlp')).lower()
    if model_name == 'swav':
        metrics = train_swav_stage(
            config=config,
            data_root=data_root,
            output_root=output_root,
            resume=args.resume,
        )
    else:
        metrics = run_training_stage(
            stage_name='ssl_spatial',
            config=config,
            data_root=data_root,
            output_root=output_root,
            resume=args.resume,
        )
    print(metrics)


if __name__ == '__main__':
    main()
