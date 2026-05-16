from __future__ import annotations

from _common import build_parser, prepare_runtime
from src.training.engine import run_training_stage


def main() -> None:
    parser = build_parser('configs/finetune_multitask.yaml')
    args = parser.parse_args()
    config, data_root, output_root = prepare_runtime(args)

    metrics = run_training_stage(
        stage_name='finetune_multitask',
        config=config,
        data_root=data_root,
        output_root=output_root,
        resume=args.resume,
    )
    print(metrics)


if __name__ == '__main__':
    main()
