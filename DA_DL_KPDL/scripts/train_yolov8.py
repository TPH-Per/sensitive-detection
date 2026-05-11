from __future__ import annotations

import subprocess
from pathlib import Path

from _common import build_parser, prepare_runtime


def main() -> None:
    parser = build_parser('configs/yolov8_nano.yaml')
    args = parser.parse_args()
    config, data_root, output_root = prepare_runtime(args)

    yolo_cfg = config.get('yolo', {})
    data_yaml = yolo_cfg.get('data_yaml')
    if not data_yaml:
        raise ValueError('Missing yolo.data_yaml in config')

    data_yaml_path = Path(data_yaml)
    if not data_yaml_path.is_absolute():
        data_yaml_path = data_root / data_yaml_path

    cmd = [
        'yolo',
        'detect',
        'train',
        f"model={yolo_cfg.get('model', 'yolov8n.pt')}",
        f'data={data_yaml_path}',
        f"imgsz={int(yolo_cfg.get('imgsz', 640))}",
        f"epochs={int(config.get('target', {}).get('epochs', 50))}",
        f"batch={int(config.get('target', {}).get('batch_size', 16))}",
        f"project={output_root / 'yolo_runs'}",
        f"name={yolo_cfg.get('run_name', 'yolov8n_weapons')}",
    ]

    print('Running:', ' '.join(map(str, cmd)))
    subprocess.run(cmd, check=True)


if __name__ == '__main__':
    main()
