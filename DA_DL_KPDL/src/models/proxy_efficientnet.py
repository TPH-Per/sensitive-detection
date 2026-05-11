from __future__ import annotations

import torch.nn as nn
from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights


def build_proxy_efficientnet(num_classes: int = 2, pretrained: bool = True) -> nn.Module:
    weights = EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
    model = efficientnet_b0(weights=weights)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model
