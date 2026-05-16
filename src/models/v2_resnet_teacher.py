"""
v2_resnet_teacher.py — ResNet Teacher Loader for V2 Pipeline
=============================================================
Loads gore/NSFW ResNet18 teacher models from V2 checkpoint format.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import torch
import torch.nn as nn
from torchvision import models


class _LegacyBackboneHeadResNet18(nn.Module):
    def __init__(self, hidden_dim: int) -> None:
        super().__init__()
        backbone = models.resnet18(weights=None)
        feat_dim = backbone.fc.in_features
        backbone.fc = nn.Identity()
        self.backbone = backbone
        self.head = nn.Sequential(
            nn.Linear(feat_dim, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.2),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.backbone(x)
        return self.head(x)


def _build_resnet_binary(arch: str, feature_dim: int = 1, state_dict: Dict[str, torch.Tensor] = None) -> nn.Module:
    if arch == "resnet18":
        model = models.resnet18(weights=None)
    elif arch == "resnet50":
        model = models.resnet50(weights=None)
    elif arch == "legacy_backbone_head_resnet18":
        hidden_dim = 128
        if state_dict is not None and "head.0.weight" in state_dict:
            hidden_dim = int(state_dict["head.0.weight"].shape[0])
        model = _LegacyBackboneHeadResNet18(hidden_dim=hidden_dim)
        return model
    else:
        raise ValueError(f"Unsupported classifier arch: {arch}")
    model.fc = nn.Linear(model.fc.in_features, feature_dim)
    return model


def _normalize_state_dict(state_dict: Dict[str, torch.Tensor]) -> Dict[str, torch.Tensor]:
    clean = {}
    for k, v in state_dict.items():
        key = k.replace("module.", "")
        if key.startswith("model."):
            key = key[len("model."):]
        clean[key] = v
    return clean


def _infer_arch_from_state_dict(state_dict: Dict[str, torch.Tensor]) -> str:
    if any(k.startswith("backbone.") for k in state_dict.keys()):
        return "legacy_backbone_head_resnet18"
    fc_weight = state_dict.get("fc.weight")
    if fc_weight is None:
        return "resnet50"
    in_features = int(fc_weight.shape[1])
    if in_features == 512:
        return "resnet18"
    if in_features == 2048:
        return "resnet50"
    raise ValueError(f"Cannot infer arch from fc.in_features={in_features}")


def load_resnet_teacher(weight_path: str, feature_dim: int = 1, default_arch: str = "resnet50") -> Optional[nn.Module]:
    """Load a ResNet teacher model from V2 checkpoint format."""
    if not weight_path:
        return None
    path = Path(weight_path)
    if not path.exists():
        return None

    state = torch.load(path, map_location="cpu")
    arch = default_arch
    state_dict = state
    if isinstance(state, dict) and "state_dict" in state:
        state_dict = state["state_dict"]
        arch = state.get("arch", arch)
    elif isinstance(state, dict) and "model_state_dict" in state:
        state_dict = state["model_state_dict"]
        arch = state.get("arch", arch)
    if not isinstance(state_dict, dict):
        raise ValueError(f"Invalid checkpoint format: {path}")

    clean_state_dict = _normalize_state_dict(state_dict)
    if "arch" not in (state if isinstance(state, dict) else {}):
        arch = _infer_arch_from_state_dict(clean_state_dict)

    model = _build_resnet_binary(arch, feature_dim, clean_state_dict)
    missing, unexpected = model.load_state_dict(clean_state_dict, strict=False)
    if missing or unexpected:
        raise ValueError(
            f"Weight mismatch for {path} with arch={arch}. "
            f"missing={len(missing)}, unexpected={len(unexpected)}"
        )
    model.eval()
    return model
