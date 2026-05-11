from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import resnet18, resnet50


class SwAVModel(nn.Module):
    def __init__(
        self,
        backbone_name: str = 'resnet18',
        projection_dim: int = 128,
        hidden_dim: int = 512,
        n_prototypes: int = 300,
    ) -> None:
        super().__init__()
        backbone_name = backbone_name.lower()
        if backbone_name == 'resnet50':
            backbone = resnet50(weights=None)
            backbone_dim = backbone.fc.in_features
        else:
            backbone = resnet18(weights=None)
            backbone_dim = backbone.fc.in_features

        backbone.fc = nn.Identity()
        self.backbone = backbone
        self.projector = nn.Sequential(
            nn.Linear(backbone_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, projection_dim),
        )
        self.prototypes = nn.Linear(projection_dim, n_prototypes, bias=False)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        features = self.backbone(x)
        projections = self.projector(features)
        projections = F.normalize(projections, dim=1)
        logits = self.prototypes(projections)
        return features, projections, logits

    @torch.no_grad()
    def normalize_prototypes(self) -> None:
        weight = self.prototypes.weight.data
        self.prototypes.weight.copy_(F.normalize(weight, dim=1))
