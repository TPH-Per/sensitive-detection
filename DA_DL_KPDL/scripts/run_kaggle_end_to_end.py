from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_command(command: list[str]) -> None:
    print('Running:', ' '.join(command))
    subprocess.run(command, check=True)


def default_yolo_weights(output_root: Path) -> Path:
    return output_root / 'yolo_runs' / 'yolov8n_weapons' / 'weights' / 'best.pt'


def default_nsfw_weights(output_root: Path) -> Path:
    return output_root / 'checkpoints' / 'nsfw_scorer_best.pth'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input_root', type=str, default='/kaggle/input')
    parser.add_argument('--output_root', type=str, default='/kaggle/working/artifacts')
    parser.add_argument('--prepare_config', type=str, default='configs/kaggle_data_prep.yaml')
    parser.add_argument('--stages', nargs='*', default=['all'])
    parser.add_argument('--clip_model', type=str, default='openai/clip-vit-base-patch32')
    parser.add_argument('--skip_existing', action='store_true')
    args = parser.parse_args()

    python_exe = sys.executable
    input_root = Path(args.input_root)
    output_root = Path(args.output_root)
    labels_dir = output_root / 'data_prep' / 'labels'
    manifests_dir = output_root / 'manifests'
    runtime_dir = output_root / 'runtime_configs'
    stages = set(args.stages)
    if 'all' in stages:
        stages = {
            'prepare_data',
            'build_proxy_arrays',
            'train_proxy',
            'train_nsfw_scorer',
            'prepare_yolo',
            'train_yolo',
            'build_features',
            'train_spatial',
            'train_temporal_ssl',
            'train_ssl_temporal',
            'train_finetune',
            'evaluate_proxy',
            'evaluate_multitask',
        }

    if 'prepare_data' in stages:
        run_command(
            [
                python_exe,
                'scripts/prepare_kaggle_data.py',
                '--config',
                args.prepare_config,
                '--input_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'build_proxy_arrays' in stages:
        for split_name in ['train', 'val', 'test']:
            command = [
                python_exe,
                'scripts/build_proxy_arrays.py',
                '--labels_csv',
                str(labels_dir / f'proxy_video_{split_name}.csv'),
                '--input_root',
                str(input_root),
                '--output_root',
                str(output_root),
                '--manifest_out',
                str(manifests_dir / f'proxy_{split_name}.csv'),
            ]
            if args.skip_existing:
                command.append('--skip_existing')
            run_command(command)

    if 'train_proxy' in stages:
        run_command(
            [
                python_exe,
                'scripts/train_proxy_efficientnet.py',
                '--config',
                str(runtime_dir / 'proxy_efficientnet_kaggle.yaml'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'train_nsfw_scorer' in stages:
        run_command(
            [
                python_exe,
                'scripts/train_nsfw_scorer.py',
                '--config',
                str(runtime_dir / 'nsfw_scorer_kaggle.yaml'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'prepare_yolo' in stages:
        run_command(
            [
                python_exe,
                'scripts/prepare_yolo_dataset.py',
                '--input_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'train_yolo' in stages:
        run_command(
            [
                python_exe,
                'scripts/train_yolov8.py',
                '--config',
                str(runtime_dir / 'yolov8_nano_kaggle.yaml'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'train_spatial' in stages:
        run_command(
            [
                python_exe,
                'scripts/train_ssl_spatial.py',
                '--config',
                str(runtime_dir / 'ssl_spatial_kaggle.yaml'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'build_features' in stages:
        yolo_weights = default_yolo_weights(output_root)
        nsfw_weights = default_nsfw_weights(output_root)
        for branch_name in ['temporal', 'multitask', 'spatial']:
            for split_name in ['train', 'val', 'test']:
                command = [
                    python_exe,
                    'scripts/build_clip_features.py',
                    '--labels_csv',
                    str(labels_dir / f'labels_{branch_name}_{split_name}.csv'),
                    '--input_root',
                    str(input_root),
                    '--output_root',
                    str(output_root),
                    '--manifest_out',
                    str(manifests_dir / f'{branch_name}_{split_name}.csv'),
                    '--clip_model',
                    args.clip_model,
                    '--feature_subdir',
                    f'features/{branch_name}_{split_name}',
                ]
                if branch_name in {'temporal', 'multitask'}:
                    command.append('--save_aux_features')
                    command.extend(['--aux_subdir', f'aux_features/{branch_name}_{split_name}'])
                    if yolo_weights.exists():
                        command.extend(['--yolo_weights', str(yolo_weights)])
                    if nsfw_weights.exists():
                        command.extend(['--nsfw_weights', str(nsfw_weights)])
                if args.skip_existing:
                    command.append('--skip_existing')
                run_command(command)

    if 'train_temporal_ssl' in stages:
        run_command(
            [
                python_exe,
                'scripts/train_temporal_ssl.py',
                '--config',
                str(runtime_dir / 'temporal_ssl_pretext_kaggle.yaml'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'train_ssl_temporal' in stages:
        run_command(
            [
                python_exe,
                'scripts/train_ssl_temporal.py',
                '--config',
                str(runtime_dir / 'ssl_temporal_kaggle.yaml'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
                '--resume',
                str(output_root / 'checkpoints' / 'temporal_ssl_last.pth'),
            ]
        )

    if 'train_finetune' in stages:
        run_command(
            [
                python_exe,
                'scripts/train_finetune.py',
                '--config',
                str(runtime_dir / 'finetune_multitask_kaggle.yaml'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
                '--resume',
                str(output_root / 'checkpoints' / 'ssl_temporal_last.pth'),
            ]
        )

    if 'evaluate_proxy' in stages:
        run_command(
            [
                python_exe,
                'scripts/evaluate_proxy.py',
                '--config',
                str(runtime_dir / 'proxy_efficientnet_kaggle.yaml'),
                '--checkpoint',
                str(output_root / 'checkpoints' / 'proxy_efficientnet_best.pth'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )

    if 'evaluate_multitask' in stages:
        run_command(
            [
                python_exe,
                'scripts/evaluate_multitask.py',
                '--config',
                str(runtime_dir / 'finetune_multitask_kaggle.yaml'),
                '--checkpoint',
                str(output_root / 'checkpoints' / 'finetune_multitask_best.pth'),
                '--data_root',
                str(input_root),
                '--output_root',
                str(output_root),
            ]
        )


if __name__ == '__main__':
    main()
