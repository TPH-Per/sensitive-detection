from __future__ import annotations

import torch
import torch.nn as nn


class GatedAsymmetricFusion(nn.Module):
    """Fuse high-dimensional CLIP features with low-dimensional auxiliary signals."""

    def __init__(self, clip_dim: int, aux_dim: int, d_model: int, dropout: float = 0.1) -> None:
        super().__init__()
        self.clip_proj = nn.Linear(clip_dim, d_model)
        self.aux_dim = aux_dim

        if aux_dim > 0:
            self.aux_proj = nn.Linear(aux_dim, d_model)
            self.gate = nn.Sequential(
                nn.Linear(d_model * 2, d_model),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(d_model, d_model),
                nn.Sigmoid(),
            )
        else:
            self.aux_proj = None
            self.gate = None

        self.norm = nn.LayerNorm(d_model)

    def forward(self, clip_x: torch.Tensor, aux_x: torch.Tensor | None = None) -> torch.Tensor:
        clip_h = self.clip_proj(clip_x)
        if self.aux_dim <= 0 or aux_x is None:
            return self.norm(clip_h)

        aux_h = self.aux_proj(aux_x)
        gate = self.gate(torch.cat([clip_h, aux_h], dim=-1))
        fused = clip_h + gate * aux_h
        return self.norm(fused)


class GatedMotionAuxFusion(nn.Module):
    """Fuse CLIP features with a motion branch and a semantic auxiliary branch."""

    def __init__(self, clip_dim: int, motion_dim: int, aux_dim: int, d_model: int, dropout: float = 0.1) -> None:
        super().__init__()
        self.clip_proj = nn.Linear(clip_dim, d_model)
        self.motion_dim = motion_dim
        self.aux_dim = aux_dim

        if motion_dim > 0:
            self.motion_proj = nn.Linear(motion_dim, d_model)
            self.motion_gate = nn.Sequential(
                nn.Linear(d_model * 2, d_model),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(d_model, d_model),
                nn.Sigmoid(),
            )
        else:
            self.motion_proj = None
            self.motion_gate = None

        if aux_dim > 0:
            self.aux_proj = nn.Linear(aux_dim, d_model)
            self.aux_gate = nn.Sequential(
                nn.Linear(d_model * 2, d_model),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(d_model, d_model),
                nn.Sigmoid(),
            )
        else:
            self.aux_proj = None
            self.aux_gate = None

        self.norm = nn.LayerNorm(d_model)

    def forward(
        self,
        clip_x: torch.Tensor,
        motion_x: torch.Tensor | None = None,
        aux_x: torch.Tensor | None = None,
    ) -> torch.Tensor:
        fused = self.clip_proj(clip_x)

        if self.motion_dim > 0 and motion_x is not None:
            motion_h = self.motion_proj(motion_x)
            motion_gate = self.motion_gate(torch.cat([fused, motion_h], dim=-1))
            fused = fused + motion_gate * motion_h

        if self.aux_dim > 0 and aux_x is not None:
            aux_h = self.aux_proj(aux_x)
            aux_gate = self.aux_gate(torch.cat([fused, aux_h], dim=-1))
            fused = fused + aux_gate * aux_h

        return self.norm(fused)
