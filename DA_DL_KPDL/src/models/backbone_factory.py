import torch
import torch.nn as nn
import torchvision.models as models
import torchvision


def get_imagenet_resnet18(unfreeze_from_layer: int = 4) -> nn.Module:
    """
    ImageNet ResNet18 pretrained backbone.
    Thay thế hoàn toàn SwAV ssl_spatial_best.pth.

    Args:
        unfreeze_from_layer:
            0 -> frozen hoàn toàn (Linear Probing, dùng khi data < 500)
            4 -> unfreeze layer4 + head (Fine-tune light, recommended)
            3 -> unfreeze layer3 + layer4 + head (Fine-tune nặng hơn)

    Returns:
        ResNet18 với fc = nn.Identity(), output [B, 512]

    Usage:
        NSFWClassifier (16,800 ảnh):  unfreeze_from_layer=4, lr=1e-4
        GoreDetector   (~14,000 ảnh): unfreeze_from_layer=4, lr=1e-4
        SelfHarmDetector (~1,400 ảnh):unfreeze_from_layer=0, lr=1e-3
                                       fallback: layer=4, lr=5e-5
    """
    backbone = models.resnet18(
        weights=torchvision.models.ResNet18_Weights.IMAGENET1K_V1
    )

    # Frozen tất cả
    for param in backbone.parameters():
        param.requires_grad = False

    # Unfreeze từ layer N trở đi
    if unfreeze_from_layer > 0:
        unfreeze = False
        for name, param in backbone.named_parameters():
            if f"layer{unfreeze_from_layer}" in name:
                unfreeze = True
            if unfreeze:
                param.requires_grad = True

    # Xóa fc gốc — caller tự định nghĩa classification head
    backbone.fc = nn.Identity()

    return backbone  # output dim: 512


def count_trainable_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
