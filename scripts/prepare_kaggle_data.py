from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import pandas as pd
from PIL import Image, UnidentifiedImageError
import yaml
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.webm'}


DEFAULT_CONFIG = {
    'project': {'seed': 42},
    'splits': {
        'val_size': 0.15,
        'test_size': 0.15,
    },
    'caps': {
        'max_per_source_signature': 6000,
    },
    'taxonomy': {
            'ucf_crimes': {
                'violence_positive_classes': [
                    'Abuse',
                    'Arrest',
                    'Arson',
                    'Assault',
                    'Burglary',
                    'Explosion',
                    'Fighting',
                    'RoadAccidents',
                    'Robbery',
                    'Shooting',
            ]
        },
        'ucf101': {
            'enabled': True,
            'fold': 1,
            'hard_negative_classes': [
                'BoxingPunchingBag',
                'BoxingSpeedBag',
                'Fencing',
                'Hammering',
                'Nunchucks',
                'Punch',
                'SumoWrestling',
                'CuttingInKitchen',
                'ShavingBeard',
            ],
        },
        'nsfw_dataset_v1': {
            'positive_classes': ['porn', 'sexy', 'hentai'],
            'negative_classes': ['neutral', 'drawings'],
        },
        'adult_content_binary': {
            'enabled': True,
            'class_map': {'1': 0, '2': 1},
            'mapping_confidence': 'high',
            'notes': 'Configured mapping: folder "1" is safe (nsfw=0) and folder "2" is NSFW-positive (nsfw=1).',
        },
    },
    'challenge_holdout': {
        'enabled': True,
        'max_groups_per_bucket': 300,
        'priority_splits': ['test', 'val', 'train'],
    },
}


def deep_merge(base: dict, override: dict) -> dict:
    merged = dict(base)
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_config(path: str | None) -> dict:
    if not path:
        return DEFAULT_CONFIG
    with Path(path).open('r', encoding='utf-8') as handle:
        loaded = yaml.safe_load(handle) or {}
    return deep_merge(DEFAULT_CONFIG, loaded)


def stable_id(prefix: str, relative_path: str) -> str:
    digest = hashlib.sha1(relative_path.encode('utf-8')).hexdigest()[:12]
    return f'{prefix}_{digest}'


def iter_files(folder: Path, extensions: set[str]):
    if not folder.exists():
        return []
    return sorted([path for path in folder.rglob('*') if path.is_file() and path.suffix.lower() in extensions])


def is_valid_image_file(path: Path) -> bool:
    try:
        with Image.open(path) as image:
            image.convert('RGB').load()
        return True
    except (FileNotFoundError, UnidentifiedImageError, OSError):
        return False


def safe_relative(path: Path, input_root: Path) -> str:
    return str(path.resolve().relative_to(input_root.resolve())).replace('\\', '/')


def build_signature(row: dict) -> str:
    return f"v{int(row['violence'])}_s{int(row['self_harm'])}_n{int(row['nsfw'])}_p{int(row['proxy_label'])}"


def parse_video_listing(path: Path) -> set[str]:
    if not path.exists():
        return set()
    text = path.read_text(encoding='utf-8', errors='ignore')
    names = set()
    pattern = re.compile(r'([^\s,;]+\.(?:avi|mp4|mov|mkv|webm))', flags=re.IGNORECASE)
    for line in text.splitlines():
        matches = pattern.findall(line)
        if matches:
            for match in matches:
                names.add(Path(match).stem.lower())
            continue
        stripped = line.strip()
        if stripped:
            names.add(Path(stripped).stem.lower())
    return names


def group_from_path(path: Path, source: str) -> str:
    stem = path.stem.lower()
    if source == 'rwf2000':
        return re.sub(r'_\d+$', '', stem)
    if source == 'ucf101':
        return f'{path.parent.name.lower()}/{stem}'
    return stem


def _base_record(
    *,
    input_root: Path,
    path: Path,
    source: str,
    media_type: str,
    original_split: str,
    locked_split: str,
    violence: int,
    self_harm: int,
    nsfw: int,
    proxy_label: int,
    include_proxy: int,
    include_temporal: int,
    include_spatial: int,
    include_multitask: int,
    challenge_bucket: str = '',
    mapping_confidence: str = 'high',
    notes: str = '',
) -> dict:
    relative_path = safe_relative(path, input_root)
    record = {
        'sample_id': stable_id(source, relative_path),
        'source': source,
        'relative_path': relative_path,
        'media_type': media_type,
        'original_split': original_split,
        'locked_split': locked_split,
        'group_id': f'{source}:{group_from_path(path, source)}',
        'violence': int(violence),
        'self_harm': int(self_harm),
        'nsfw': int(nsfw),
        'proxy_label': int(proxy_label),
        'include_proxy': int(include_proxy),
        'include_temporal': int(include_temporal),
        'include_spatial': int(include_spatial),
        'include_multitask': int(include_multitask),
        'challenge_bucket': challenge_bucket,
        'mapping_confidence': mapping_confidence,
        'notes': notes,
    }
    record['label_signature'] = build_signature(record)
    return record


def scan_rwf2000(input_root: Path) -> tuple[list[dict], set[str]]:
    records = []
    matched_roots = set()
    for base in input_root.rglob('RWF-2000'):
        matched_roots.add(str(base.parent.resolve()))
        for split_name, locked_split in [('train', ''), ('val', 'test')]:
            for class_name, violence in [('Fight', 1), ('NonFight', 0)]:
                folder = base / split_name / class_name
                for video_path in iter_files(folder, VIDEO_EXTENSIONS):
                    records.append(
                        _base_record(
                            input_root=input_root,
                            path=video_path,
                            source='rwf2000',
                            media_type='video',
                            original_split=split_name,
                            locked_split=locked_split,
                            violence=violence,
                            self_harm=0,
                            nsfw=0,
                            proxy_label=violence,
                            include_proxy=1,
                            include_temporal=1,
                            include_spatial=0,
                            include_multitask=1,
                            mapping_confidence='high',
                            notes='rwf2000 violence clip',
                        )
                    )
    return records, matched_roots


def scan_ucf_crimes(input_root: Path, config: dict) -> tuple[list[dict], set[str]]:
    violent_classes = {name.lower() for name in config['taxonomy']['ucf_crimes']['violence_positive_classes']}
    records = []
    matched_roots = set()
    for base in input_root.rglob('Real-world Anomaly Detection in Surveillance Videos (UCF)'):
        matched_roots.add(str(base.parent.resolve()))
        anomaly_train = parse_video_listing(base / 'Anomaly_Train.txt')
        anomaly_test = parse_video_listing(base / 'Temporal_Anomaly_Annotation_for_Testing_Videos.txt')

        split_root = base / 'UCF_Crimes-Train-Test-Split' / 'Anomaly_Detection_splits'
        for split_file in split_root.glob('*.txt'):
            target = anomaly_test if 'test' in split_file.stem.lower() else anomaly_train
            target.update(parse_video_listing(split_file))

        anomaly_dir = base / 'Anomaly-Videos'
        for class_dir in sorted([path for path in anomaly_dir.iterdir() if path.is_dir()]) if anomaly_dir.exists() else []:
            class_name = class_dir.name
            violence = 1 if class_name.lower() in violent_classes else 0
            for video_path in iter_files(class_dir, VIDEO_EXTENSIONS):
                stem = video_path.stem.lower()
                locked_split = 'test' if stem in anomaly_test else ''
                original_split = 'train' if stem in anomaly_train else ('test' if locked_split == 'test' else 'train')
                records.append(
                    _base_record(
                        input_root=input_root,
                        path=video_path,
                        source='ucf_crimes',
                        media_type='video',
                        original_split=original_split,
                        locked_split=locked_split,
                        violence=violence,
                        self_harm=0,
                        nsfw=0,
                        proxy_label=1,
                        include_proxy=1,
                        include_temporal=1,
                        include_spatial=0,
                        include_multitask=1,
                        challenge_bucket='positive_hard',
                        mapping_confidence='medium',
                        notes=f'ucf anomaly class={class_name}',
                    )
                )

        normal_folders = [
            ('Training-Normal-Videos', 'train', ''),
            ('Testing_Normal_Videos_Anomaly', 'test', 'test'),
            ('Normal_Videos_for_Event_Recognition', 'train', ''),
        ]
        for folder_name, original_split, locked_split in normal_folders:
            folder = base / folder_name
            for video_path in iter_files(folder, VIDEO_EXTENSIONS):
                records.append(
                    _base_record(
                        input_root=input_root,
                        path=video_path,
                        source='ucf_crimes',
                        media_type='video',
                        original_split=original_split,
                        locked_split=locked_split,
                        violence=0,
                        self_harm=0,
                        nsfw=0,
                        proxy_label=0,
                        include_proxy=1,
                        include_temporal=1,
                        include_spatial=0,
                        include_multitask=1,
                        mapping_confidence='high',
                        notes=f'ucf normal folder={folder_name}',
                    )
                )
    return records, matched_roots


def parse_ucf101_split_list(path: Path) -> set[str]:
    if not path.exists():
        return set()

    entries = set()
    for line in path.read_text(encoding='utf-8', errors='ignore').splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        token = stripped.split()[0].replace('\\', '/').lower()
        entries.add(token)
    return entries


def resolve_ucf101_split_root(base: Path) -> Path | None:
    candidates = [
        base.parent.parent / 'UCF101TrainTestSplits-RecognitionTask' / 'ucfTrainTestlist',
        base.parent / 'UCF101TrainTestSplits-RecognitionTask' / 'ucfTrainTestlist',
        base / 'ucfTrainTestlist',
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def scan_ucf101(input_root: Path, config: dict) -> tuple[list[dict], set[str]]:
    ucf101_cfg = config['taxonomy'].get('ucf101', {})
    if not ucf101_cfg.get('enabled', True):
        return [], set()

    fold = int(ucf101_cfg.get('fold', 1))
    hard_negative_classes = {name.lower() for name in ucf101_cfg.get('hard_negative_classes', [])}
    records = []
    matched_roots = set()

    for base in input_root.rglob('UCF-101'):
        matched_roots.add(str(base.parent.parent.resolve()))
        split_root = resolve_ucf101_split_root(base)
        train_entries = parse_ucf101_split_list(split_root / f'trainlist{fold:02d}.txt') if split_root else set()
        test_entries = parse_ucf101_split_list(split_root / f'testlist{fold:02d}.txt') if split_root else set()

        for class_dir in sorted([path for path in base.iterdir() if path.is_dir()]):
            class_name = class_dir.name
            is_hard_negative = class_name.lower() in hard_negative_classes
            for video_path in iter_files(class_dir, VIDEO_EXTENSIONS):
                rel_key = f'{class_name}/{video_path.name}'.replace('\\', '/').lower()
                if rel_key in test_entries:
                    original_split, locked_split = 'test', 'test'
                elif rel_key in train_entries:
                    original_split, locked_split = 'train', ''
                else:
                    original_split, locked_split = 'train', ''

                records.append(
                    _base_record(
                        input_root=input_root,
                        path=video_path,
                        source='ucf101',
                        media_type='video',
                        original_split=original_split,
                        locked_split=locked_split,
                        violence=0,
                        self_harm=0,
                        nsfw=0,
                        proxy_label=0,
                        include_proxy=1,
                        include_temporal=1,
                        include_spatial=0,
                        include_multitask=1,
                        challenge_bucket='normal_hard' if is_hard_negative else '',
                        mapping_confidence='high',
                        notes=f'ucf101 safe action class={class_name}',
                    )
                )
    return records, matched_roots


def scan_nsfw_dataset_v1(input_root: Path, config: dict) -> tuple[list[dict], set[str]]:
    positive = {name.lower() for name in config['taxonomy']['nsfw_dataset_v1']['positive_classes']}
    negative = {name.lower() for name in config['taxonomy']['nsfw_dataset_v1']['negative_classes']}
    records = []
    matched_roots = set()
    for base in input_root.rglob('nsfw_dataset_v1'):
        matched_roots.add(str(base.parent.resolve()))
        for class_dir in sorted([path for path in base.iterdir() if path.is_dir()]):
            class_name = class_dir.name.lower()
            if class_name not in positive and class_name not in negative:
                continue
            nsfw = 1 if class_name in positive else 0
            for image_path in iter_files(class_dir, IMAGE_EXTENSIONS):
                if not is_valid_image_file(image_path):
                    continue
                records.append(
                    _base_record(
                        input_root=input_root,
                        path=image_path,
                        source='nsfw_dataset_v1',
                        media_type='image',
                        original_split='',
                        locked_split='',
                        violence=0,
                        self_harm=0,
                        nsfw=nsfw,
                        proxy_label=0,
                        include_proxy=0,
                        include_temporal=0,
                        include_spatial=1,
                        include_multitask=1,
                        mapping_confidence='high',
                        notes=f'nsfw_dataset_v1 class={class_dir.name}',
                    )
                )
    return records, matched_roots


def scan_adult_content_dataset(input_root: Path, config: dict) -> tuple[list[dict], set[str]]:
    adult_cfg = config['taxonomy']['adult_content_binary']
    if not adult_cfg.get('enabled', True):
        return [], set()

    class_map = {str(key): int(value) for key, value in adult_cfg.get('class_map', {}).items()}
    records = []
    matched_roots = set()
    for base in input_root.rglob('P2datasetFull'):
        matched_roots.add(str(base.parent.parent.resolve()) if base.parent.name else str(base.parent.resolve()))
        split_alias = {'train': ('train', ''), 'val1': ('val', 'val'), 'valid': ('val', 'val'), 'test1': ('test', 'test'), 'test': ('test', 'test')}
        for split_dir in sorted([path for path in base.iterdir() if path.is_dir()]):
            split_name, locked_split = split_alias.get(split_dir.name.lower(), ('train', ''))
            for class_dir in sorted([path for path in split_dir.iterdir() if path.is_dir()]):
                if class_dir.name not in class_map:
                    continue
                nsfw = class_map[class_dir.name]
                for image_path in iter_files(class_dir, IMAGE_EXTENSIONS):
                    if not is_valid_image_file(image_path):
                        continue
                    records.append(
                        _base_record(
                            input_root=input_root,
                            path=image_path,
                            source='adult_content_binary',
                            media_type='image',
                            original_split=split_name,
                            locked_split=locked_split,
                            violence=0,
                            self_harm=0,
                            nsfw=nsfw,
                            proxy_label=0,
                        include_proxy=0,
                        include_temporal=0,
                        include_spatial=1,
                        include_multitask=1,
                        challenge_bucket='positive_hard' if nsfw == 1 else '',
                        mapping_confidence=adult_cfg.get('mapping_confidence', 'low'),
                        notes=adult_cfg.get('notes', ''),
                    )
                )
    return records, matched_roots


def scan_yolo_image_dataset(
    input_root: Path,
    *,
    dataset_name: str,
    source_name: str,
    label_notes: str,
    self_harm: int,
    positive: bool,
) -> tuple[list[dict], set[str]]:
    records = []
    matched_roots = set()
    for base in input_root.rglob(dataset_name):
        matched_roots.add(str(base.parent.resolve()))
        split_alias = {'train': ('train', ''), 'valid': ('val', 'val'), 'val': ('val', 'val'), 'test': ('test', 'test')}
        for split_dir in sorted([path for path in base.iterdir() if path.is_dir()]):
            if split_dir.name.lower() not in split_alias:
                continue
            original_split, locked_split = split_alias[split_dir.name.lower()]
            image_dir = split_dir / 'images'
            for image_path in iter_files(image_dir, IMAGE_EXTENSIONS):
                if not is_valid_image_file(image_path):
                    continue
                records.append(
                    _base_record(
                        input_root=input_root,
                        path=image_path,
                        source=source_name,
                        media_type='image',
                        original_split=original_split,
                        locked_split=locked_split,
                        violence=0,
                        self_harm=self_harm,
                        nsfw=0,
                        proxy_label=1 if positive else 0,
                        include_proxy=0,
                        include_temporal=0,
                        include_spatial=1,
                        include_multitask=1,
                        challenge_bucket='positive_hard' if positive else 'normal_hard',
                        mapping_confidence='high',
                        notes=label_notes,
                    )
                )
    return records, matched_roots


def scan_wound_dataset(input_root: Path) -> tuple[list[dict], set[str]]:
    records = []
    matched_roots = set()
    for base in input_root.rglob('Wound_dataset copy'):
        matched_roots.add(str(base.parent.resolve()))
        for class_dir in sorted([path for path in base.iterdir() if path.is_dir()]):
            for image_path in iter_files(class_dir, IMAGE_EXTENSIONS):
                if not is_valid_image_file(image_path):
                    continue
                records.append(
                    _base_record(
                        input_root=input_root,
                        path=image_path,
                        source='wound_medical_negative',
                        media_type='image',
                        original_split='',
                        locked_split='',
                        violence=0,
                        self_harm=0,
                        nsfw=0,
                        proxy_label=0,
                        include_proxy=0,
                        include_temporal=0,
                        include_spatial=1,
                        include_multitask=1,
                        challenge_bucket='normal_hard',
                        mapping_confidence='high',
                        notes=f'wound hard negative class={class_dir.name}',
                    )
                )
    return records, matched_roots


def scan_all_sources(input_root: Path, config: dict) -> tuple[pd.DataFrame, list[str], list[str]]:
    records = []
    matched_roots = set()
    warnings = []

    scanners = [
        scan_rwf2000(input_root),
        scan_ucf_crimes(input_root, config),
        scan_ucf101(input_root, config),
        scan_nsfw_dataset_v1(input_root, config),
        scan_adult_content_dataset(input_root, config),
        scan_yolo_image_dataset(
            input_root,
            dataset_name='Self Harm Detection.v1i.yolov8',
            source_name='self_harm_detection',
            label_notes='image-level self_harm positive from YOLO dataset',
            self_harm=1,
            positive=True,
        ),
        scan_yolo_image_dataset(
            input_root,
            dataset_name='Suicide Detection.v1i.yolov8(1)',
            source_name='suicide_detection',
            label_notes='image-level self_harm positive from YOLO dataset',
            self_harm=1,
            positive=True,
        ),
        scan_yolo_image_dataset(
            input_root,
            dataset_name='Surgical Tools Dataset.v2-labelled-set.yolov8',
            source_name='surgical_tools_negative',
            label_notes='medical hard negative from YOLO dataset',
            self_harm=0,
            positive=False,
        ),
        scan_wound_dataset(input_root),
    ]

    for source_records, roots in scanners:
        records.extend(source_records)
        matched_roots.update(roots)

    adult_cfg = config['taxonomy']['adult_content_binary']
    if adult_cfg.get('enabled', True) and str(adult_cfg.get('mapping_confidence', '')).lower() not in {'high', 'confirmed'}:
        warnings.append(adult_cfg.get('notes', 'Adult content class mapping uses a low-confidence assumption.'))

    all_top_level_roots = [str(path.resolve()) for path in input_root.iterdir() if path.is_dir()]
    unmatched_roots = [root for root in all_top_level_roots if root not in matched_roots]
    df = pd.DataFrame(records)
    return df, unmatched_roots, warnings


def apply_caps(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    max_per_signature = int(config.get('caps', {}).get('max_per_source_signature', 0))
    if max_per_signature <= 0:
        return df

    seed = int(config['project']['seed'])
    sampled = []
    for (_, _), group in df.groupby(['source', 'label_signature']):
        locked = group[group['locked_split'].isin(['val', 'test'])]
        open_group = group[~group['locked_split'].isin(['val', 'test'])]
        if len(open_group) <= max_per_signature:
            sampled.append(group)
            continue
        sampled_open = open_group.sample(n=max_per_signature, random_state=seed)
        sampled.append(pd.concat([locked, sampled_open], ignore_index=True))
    return pd.concat(sampled, ignore_index=True)


def split_group_table(group_df: pd.DataFrame, test_size: float, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    if group_df.empty or test_size <= 0 or len(group_df) < 2:
        return group_df, group_df.iloc[0:0]

    stratify = None
    signature_counts = group_df['label_signature'].value_counts()
    if group_df['label_signature'].nunique() > 1 and (signature_counts >= 2).all():
        stratify = group_df['label_signature']

    try:
        train_part, holdout_part = train_test_split(group_df, test_size=test_size, random_state=seed, stratify=stratify)
    except ValueError:
        train_part, holdout_part = train_test_split(group_df, test_size=test_size, random_state=seed, shuffle=True)
    return train_part.reset_index(drop=True), holdout_part.reset_index(drop=True)


def assign_splits(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    if df.empty:
        return df.assign(split=pd.Series(dtype='object'))

    seed = int(config['project']['seed'])
    val_size = float(config['splits']['val_size'])
    test_size = float(config['splits']['test_size'])

    df = df.copy()
    df['split'] = ''

    for source, source_df in df.groupby('source'):
        source_indices = source_df.index
        result = pd.Series('', index=source_indices, dtype='object')

        locked_test = source_df['locked_split'].eq('test')
        locked_val = source_df['locked_split'].eq('val')
        result.loc[source_df.index[locked_test]] = 'test'
        result.loc[source_df.index[locked_val]] = 'val'

        open_df = source_df[result.loc[source_indices].eq('')]
        if open_df.empty:
            result = result.replace('', 'train')
            df.loc[source_indices, 'split'] = result
            continue

        group_df = open_df.groupby('group_id', as_index=False).agg({'label_signature': 'first'})
        remaining_groups = group_df

        has_test = (result == 'test').any()
        has_val = (result == 'val').any()

        if not has_test and test_size > 0:
            remaining_groups, test_groups = split_group_table(group_df, test_size=test_size, seed=seed)
            result.loc[open_df.index[open_df['group_id'].isin(test_groups['group_id'])]] = 'test'

        if not has_val and val_size > 0:
            val_ratio = val_size if has_test else min(val_size / max(1.0 - test_size, 1e-6), 0.5)
            train_groups, val_groups = split_group_table(remaining_groups, test_size=val_ratio, seed=seed + 1)
            result.loc[open_df.index[open_df['group_id'].isin(val_groups['group_id'])]] = 'val'
            remaining_groups = train_groups

        result = result.replace('', 'train')
        df.loc[source_indices, 'split'] = result

    return df


def _preferred_split_value(values: pd.Series, priority_map: dict[str, int]) -> str:
    split_values = [str(v) for v in values if str(v)]
    if not split_values:
        return 'train'
    return min(split_values, key=lambda value: priority_map.get(value, len(priority_map)))


def assign_challenge_holdout(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    challenge_cfg = config.get('challenge_holdout', {})
    if df.empty or not challenge_cfg.get('enabled', False):
        if 'split_before_challenge' not in df.columns:
            df = df.copy()
            df['split_before_challenge'] = df.get('split', '')
        return df

    df = df.copy()
    df['split_before_challenge'] = df['split']

    max_groups_per_bucket = int(challenge_cfg.get('max_groups_per_bucket', 0))
    if max_groups_per_bucket <= 0:
        return df

    priority_splits = [str(item) for item in challenge_cfg.get('priority_splits', ['test', 'val', 'train'])]
    priority_map = {name: idx for idx, name in enumerate(priority_splits)}

    for bucket_name in ['positive_hard', 'normal_hard']:
        bucket_df = df.loc[df['challenge_bucket'].eq(bucket_name)]
        if bucket_df.empty:
            continue

        group_rows = []
        for group_id, group in bucket_df.groupby('group_id'):
            preferred_split = _preferred_split_value(group['split'], priority_map)
            group_rows.append(
                {
                    'group_id': group_id,
                    'preferred_split': preferred_split,
                    'priority': priority_map.get(preferred_split, len(priority_map)),
                    'source': str(group['source'].iloc[0]),
                }
            )

        group_df = pd.DataFrame(group_rows).sort_values(['priority', 'source', 'group_id']).reset_index(drop=True)
        selected_groups = group_df['group_id'].head(max_groups_per_bucket).tolist()
        if selected_groups:
            df.loc[df['group_id'].isin(selected_groups) & df['challenge_bucket'].eq(bucket_name), 'split'] = 'challenge'

    return df


def export_labels(df: pd.DataFrame, labels_dir: Path) -> dict:
    labels_dir.mkdir(parents=True, exist_ok=True)

    exports = {
        'temporal': df['include_temporal'].eq(1),
        'multitask': df['include_multitask'].eq(1),
        'spatial': df['include_spatial'].eq(1),
    }
    written = {}

    for export_name, mask in exports.items():
        subset = df.loc[mask]
        for split_name in ['train', 'val', 'test', 'challenge']:
            export_df = subset.loc[
                subset['split'].eq(split_name),
                ['relative_path', 'violence', 'self_harm', 'nsfw', 'sample_id', 'split', 'split_before_challenge', 'source', 'group_id', 'media_type', 'challenge_bucket'],
            ]
            export_path = labels_dir / f'labels_{export_name}_{split_name}.csv'
            export_df.to_csv(export_path, index=False)
            written[f'{export_name}_{split_name}'] = str(export_path)

    nsfw_subset = df.loc[
        df['include_spatial'].eq(1) & df['media_type'].eq('image'),
        ['relative_path', 'nsfw', 'sample_id', 'split', 'split_before_challenge', 'source', 'group_id', 'media_type', 'challenge_bucket'],
    ].rename(columns={'nsfw': 'label'})
    for split_name in ['train', 'val', 'test', 'challenge']:
        export_df = nsfw_subset.loc[nsfw_subset['split'].eq(split_name)]
        export_path = labels_dir / f'labels_nsfw_{split_name}.csv'
        export_df.to_csv(export_path, index=False)
        written[f'nsfw_{split_name}'] = str(export_path)

    proxy_subset = df.loc[
        df['include_proxy'].eq(1),
        ['relative_path', 'proxy_label', 'sample_id', 'split', 'split_before_challenge', 'source', 'group_id', 'media_type', 'challenge_bucket'],
    ]
    proxy_subset = proxy_subset.rename(columns={'proxy_label': 'label'})
    for split_name in ['train', 'val', 'test', 'challenge']:
        export_df = proxy_subset.loc[proxy_subset['split'].eq(split_name)]
        export_path = labels_dir / f'proxy_video_{split_name}.csv'
        export_df.to_csv(export_path, index=False)
        written[f'proxy_{split_name}'] = str(export_path)

    return written


def write_runtime_configs(output_root: Path) -> dict:
    runtime_dir = output_root / 'runtime_configs'
    runtime_dir.mkdir(parents=True, exist_ok=True)
    manifests_dir = output_root / 'manifests'
    labels_dir = output_root / 'data_prep' / 'labels'

    config_specs = {
        'proxy_efficientnet_kaggle.yaml': ('configs/proxy_efficientnet.yaml', {'data': {'train_manifest': str(manifests_dir / 'proxy_train.csv'), 'val_manifest': str(manifests_dir / 'proxy_val.csv'), 'test_manifest': str(manifests_dir / 'proxy_test.csv')}}),
        'nsfw_scorer_kaggle.yaml': ('configs/nsfw_scorer.yaml', {'data': {'train_manifest': str(labels_dir / 'labels_nsfw_train.csv'), 'val_manifest': str(labels_dir / 'labels_nsfw_val.csv'), 'test_manifest': str(labels_dir / 'labels_nsfw_test.csv')}}),
        'ssl_spatial_kaggle.yaml': ('configs/ssl_spatial.yaml', {'data': {'train_manifest': str(labels_dir / 'labels_spatial_train.csv'), 'val_manifest': str(labels_dir / 'labels_spatial_val.csv'), 'test_manifest': str(labels_dir / 'labels_spatial_test.csv')}}),
        'temporal_ssl_pretext_kaggle.yaml': ('configs/temporal_ssl_pretext.yaml', {'data': {'train_manifest': str(manifests_dir / 'temporal_train.csv'), 'val_manifest': str(manifests_dir / 'temporal_val.csv'), 'test_manifest': str(manifests_dir / 'temporal_test.csv')}, 'model': {'aux_dim': 6}, 'target': {'early_stopping_patience': 3}}),
        'ssl_temporal_kaggle.yaml': ('configs/ssl_temporal.yaml', {'data': {'train_manifest': str(manifests_dir / 'temporal_train.csv'), 'val_manifest': str(manifests_dir / 'temporal_val.csv'), 'test_manifest': str(manifests_dir / 'temporal_test.csv')}, 'model': {'aux_dim': 6}, 'target': {'early_stopping_patience': 4, 'label_smoothing': 0.05}}),
        'finetune_multitask_kaggle.yaml': ('configs/finetune_multitask.yaml', {'data': {'train_manifest': str(manifests_dir / 'multitask_train.csv'), 'val_manifest': str(manifests_dir / 'multitask_val.csv'), 'test_manifest': str(manifests_dir / 'multitask_test.csv')}, 'model': {'aux_dim': 6}, 'target': {'early_stopping_patience': 4}}),
        'yolov8_nano_kaggle.yaml': ('configs/yolov8_nano.yaml', {'yolo': {'data_yaml': str(output_root / 'yolo_merged' / 'data.yaml')}}),
    }

    written = {}
    for filename, (base_path, updates) in config_specs.items():
        with Path(base_path).open('r', encoding='utf-8') as handle:
            config = yaml.safe_load(handle) or {}
        config = deep_merge(config, updates)
        out_path = runtime_dir / filename
        out_path.write_text(yaml.safe_dump(config, sort_keys=False, allow_unicode=True), encoding='utf-8')
        written[filename] = str(out_path)
    return written


def summarize(df: pd.DataFrame) -> dict:
    by_source = {}
    for source, source_df in df.groupby('source'):
        by_source[source] = {
            'count': int(len(source_df)),
            'train': int(source_df['split'].eq('train').sum()),
            'val': int(source_df['split'].eq('val').sum()),
            'test': int(source_df['split'].eq('test').sum()),
            'challenge': int(source_df['split'].eq('challenge').sum()),
            'media_type': sorted(source_df['media_type'].unique().tolist()),
        }

    by_branch = {}
    branch_map = {
        'proxy': df['include_proxy'].eq(1),
        'temporal': df['include_temporal'].eq(1),
        'spatial': df['include_spatial'].eq(1),
        'multitask': df['include_multitask'].eq(1),
    }
    for branch_name, mask in branch_map.items():
        subset = df.loc[mask]
        by_branch[branch_name] = {
            'count': int(len(subset)),
            'train': int(subset['split'].eq('train').sum()),
            'val': int(subset['split'].eq('val').sum()),
            'test': int(subset['split'].eq('test').sum()),
            'challenge': int(subset['split'].eq('challenge').sum()),
        }

    challenge_summary = {}
    if 'challenge_bucket' in df.columns:
        for bucket_name in sorted([bucket for bucket in df['challenge_bucket'].dropna().unique().tolist() if str(bucket)]):
            bucket_df = df.loc[df['challenge_bucket'].eq(bucket_name)]
            challenge_summary[bucket_name] = {
                'count': int(len(bucket_df)),
                'challenge': int(bucket_df['split'].eq('challenge').sum()),
                'train': int(bucket_df['split'].eq('train').sum()),
                'val': int(bucket_df['split'].eq('val').sum()),
                'test': int(bucket_df['split'].eq('test').sum()),
            }

    return {'by_source': by_source, 'by_branch': by_branch, 'challenge_holdout': challenge_summary}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=str, default='configs/kaggle_data_prep.yaml')
    parser.add_argument('--input_root', type=str, default='/kaggle/input')
    parser.add_argument('--output_root', type=str, default='/kaggle/working/artifacts')
    args = parser.parse_args()

    config = load_config(args.config)
    input_root = Path(args.input_root)
    output_root = Path(args.output_root).resolve()
    metadata_dir = output_root / 'data_prep' / 'metadata'
    labels_dir = output_root / 'data_prep' / 'labels'
    metadata_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    df, unmatched_roots, warnings = scan_all_sources(input_root, config)
    if df.empty:
        raise RuntimeError(f'No supported datasets were discovered under {input_root}')

    df = apply_caps(df, config)
    df = assign_splits(df, config)
    df = assign_challenge_holdout(df, config)
    df = df.sort_values(['source', 'split', 'relative_path']).reset_index(drop=True)

    master_path = metadata_dir / 'classification_master.csv'
    df.to_csv(master_path, index=False)

    label_exports = export_labels(df, labels_dir)
    runtime_configs = write_runtime_configs(output_root)

    summary = summarize(df)
    summary['warnings'] = warnings
    summary['unmatched_roots'] = unmatched_roots
    summary['master_csv'] = str(master_path)
    summary['label_exports'] = label_exports
    summary['runtime_configs'] = runtime_configs

    (metadata_dir / 'classification_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    (metadata_dir / 'classification_summary.yaml').write_text(yaml.safe_dump(summary, sort_keys=False, allow_unicode=True), encoding='utf-8')

    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
