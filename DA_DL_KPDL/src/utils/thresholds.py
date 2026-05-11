from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_threshold_map(
    thresholds_json: str | Path | None,
    default_thresholds: dict[str, float] | None = None,
) -> dict[str, float]:
    thresholds: dict[str, float] = {}
    if default_thresholds:
        thresholds.update({str(key): float(value) for key, value in default_thresholds.items()})

    if thresholds_json is None:
        return thresholds

    raw_path = str(thresholds_json).strip()
    if not raw_path:
        return thresholds

    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError(f'Threshold file not found: {path}')

    payload: Any = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(payload, dict):
        return thresholds

    candidate_maps: list[dict[str, Any]] = []
    recommended = payload.get('recommended_thresholds')
    if isinstance(recommended, dict):
        candidate_maps.append(recommended)

    nested_thresholds = payload.get('thresholds')
    if isinstance(nested_thresholds, dict):
        candidate_maps.append(nested_thresholds)

    if not candidate_maps:
        candidate_maps.append(payload)

    for candidate in candidate_maps:
        for key, value in candidate.items():
            try:
                thresholds[str(key)] = float(value)
            except (TypeError, ValueError):
                continue

    return thresholds