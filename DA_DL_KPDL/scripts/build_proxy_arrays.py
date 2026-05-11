from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from PIL import Image
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.webm'}


def is_video(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS


def sample_video_frames(video_path: Path, max_frames: int, image_size: int) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return np.zeros((max_frames, image_size, image_size, 3), dtype=np.uint8)

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    total = total if total > 0 else max_frames
    indices = np.linspace(0, max(total - 1, 0), num=max_frames, dtype=np.int32)
    index_set = set(indices.tolist())

    frames = []
    cursor = 0
    while cap.isOpened() and len(frames) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if cursor in index_set:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            resized = cv2.resize(rgb, (image_size, image_size), interpolation=cv2.INTER_AREA)
            frames.append(resized.astype(np.uint8))
        cursor += 1
    cap.release()

    if not frames:
        return np.zeros((max_frames, image_size, image_size, 3), dtype=np.uint8)
    while len(frames) < max_frames:
        frames.append(frames[-1].copy())
    return np.stack(frames[:max_frames], axis=0)


def sample_image_frame(image_path: Path, max_frames: int, image_size: int) -> np.ndarray:
    image = Image.open(image_path).convert('RGB').resize((image_size, image_size))
    frame = np.asarray(image, dtype=np.uint8)
    return np.stack([frame for _ in range(max_frames)], axis=0)


def resolve_source_path(input_root: Path, raw_path: str) -> Path:
    path = Path(str(raw_path))
    if path.is_absolute():
        return path
    return input_root / path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--labels_csv', type=str, required=True)
    parser.add_argument('--input_root', type=str, required=True)
    parser.add_argument('--output_root', type=str, required=True)
    parser.add_argument('--manifest_out', type=str, required=True)
    parser.add_argument('--path_column', type=str, default='relative_path')
    parser.add_argument('--max_frames', type=int, default=8)
    parser.add_argument('--image_size', type=int, default=224)
    parser.add_argument('--array_subdir', type=str, default='proxy_arrays')
    parser.add_argument('--skip_existing', action='store_true')
    args = parser.parse_args()

    labels_df = pd.read_csv(args.labels_csv)
    required_cols = [args.path_column, 'label']
    missing = [column for column in required_cols if column not in labels_df.columns]
    if missing:
        raise ValueError(f'Missing columns in labels_csv: {missing}')

    input_root = Path(args.input_root)
    output_root = Path(args.output_root).resolve()
    array_dir = output_root / args.array_subdir
    array_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for idx, row in tqdm(labels_df.iterrows(), total=len(labels_df), desc='Building proxy arrays'):
        sample_id = row.get('sample_id', f'proxy_{idx:06d}')
        src_path = resolve_source_path(input_root, str(row[args.path_column]))
        out_path = array_dir / f'{sample_id}.npy'

        if not (args.skip_existing and out_path.exists()):
            if is_video(src_path):
                clip = sample_video_frames(src_path, max_frames=args.max_frames, image_size=args.image_size)
            else:
                clip = sample_image_frame(src_path, max_frames=args.max_frames, image_size=args.image_size)
            np.save(out_path, clip)
        else:
            clip = np.load(out_path)

        rows.append(
            {
                'sample_id': sample_id,
                'array_path': str(out_path.resolve()),
                'label': int(row['label']),
                'split': row.get('split', ''),
                'source': row.get('source', ''),
                'group_id': row.get('group_id', ''),
                'n_frames': int(clip.shape[0]),
                'height': int(clip.shape[1]),
                'width': int(clip.shape[2]),
            }
        )

    manifest_path = Path(args.manifest_out)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=['sample_id', 'array_path', 'label', 'split', 'source', 'group_id', 'n_frames', 'height', 'width'],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f'Saved proxy arrays to: {array_dir}')
    print(f'Saved proxy manifest to: {manifest_path}')


if __name__ == '__main__':
    main()
