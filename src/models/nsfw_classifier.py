"""
nsfw_classifier.py — V6.1
==========================
Binary classifier: NSFW (1) vs. safe (0)
Architecture: ImageNet ResNet18 backbone + trainable Linear head
Output:   logits [B, 1] — use BCEWithLogitsLoss during training
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms

import sys
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.models.backbone_factory import get_imagenet_resnet18

# ─────────────────────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────────────────────

class NSFWClassifier(nn.Module):
    """
    Binary: NSFW (1) vs Safe (0)
    Backbone: ImageNet ResNet18, unfreeze layer4
    Data: nsfw_dataset_v1 (16,800 ảnh, 5 classes → binary)
    Task: Teacher input cho N_Gate (nsfw_feat)

    Tại sao fine-tune layer4 (không frozen hoàn toàn):
      ImageNet features tốt cho objects, nhưng NSFW cần
      skin texture features đặc biệt → layer4 cần adapt nhẹ
      16,800 ảnh đủ để fine-tune an toàn không overfit
    """

    def __init__(self, unfreeze_from_layer: int = 4) -> None:
        super().__init__()
        self.backbone = get_imagenet_resnet18(unfreeze_from_layer)

        self.head = nn.Sequential(
            nn.Linear(512, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(128, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: [B, 3, 224, 224] → logits [B, 1]"""
        feats = self.backbone(x)  # [B, 512]
        logits = self.head(feats) # [B, 1]
        return logits

    @torch.no_grad()
    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Returns sigmoid probabilities [B, 1] in [0, 1]."""
        return torch.sigmoid(self.forward(x))


# ─────────────────────────────────────────────────────────────────────────────
# Transforms
# ─────────────────────────────────────────────────────────────────────────────

_MEAN = [0.485, 0.456, 0.406]
_STD  = [0.229, 0.224, 0.225]


def nsfw_train_transform() -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1),
        transforms.ToTensor(),
        transforms.Normalize(_MEAN, _STD),
    ])


def nsfw_val_transform() -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(_MEAN, _STD),
    ])


# ─────────────────────────────────────────────────────────────────────────────
# Dataset
# ─────────────────────────────────────────────────────────────────────────────

def collect_nsfw_images(nsfw_root: Path) -> tuple[List[Path], List[Path]]:
    """
    nsfw_dataset_v1(1)/nsfw_dataset_v1/ structure:
      Positive (NSFW=1): porn/, hentai/, sexy/
      Negative (NSFW=0): neutral/, drawings/

    Returns (positive_paths, negative_paths)
    """
    pos_classes = {'porn', 'hentai', 'sexy'}
    neg_classes  = {'neutral', 'drawings'}

    positives: List[Path] = []
    negatives: List[Path] = []

    for folder in sorted(nsfw_root.iterdir()):
        if not folder.is_dir():
            continue
        name = folder.name.lower()
        images = sorted(folder.glob('*.jpg'))
        if name in pos_classes:
            positives.extend(images)
            print(f"  [NSFWData] {folder.name}: {len(images):,} positive")
        elif name in neg_classes:
            negatives.extend(images)
            print(f"  [NSFWData] {folder.name}: {len(images):,} negative")

    return positives, negatives


class NSFWDataset(Dataset):
    """
    Binary classification dataset for NSFWClassifier.
    Labels: 1 = NSFW, 0 = safe/neutral

    Positive (NSFW):  porn + hentai + sexy = ~16,800
    Negative (safe):  neutral + drawings   = ~11,200

    pos:neg ≈ 1.5:1 → positive heavier
    Use pos_weight = n_neg / n_pos ≈ 0.67 in BCEWithLogitsLoss
    """

    def __init__(
        self,
        positive_paths: List[Path],
        negative_paths: List[Path],
        transform: Optional[transforms.Compose] = None,
    ) -> None:
        self.paths  = positive_paths + negative_paths
        self.labels = [1.0] * len(positive_paths) + [0.0] * len(negative_paths)
        self.transform = transform or nsfw_val_transform()

        n_pos = len(positive_paths)
        n_neg = len(negative_paths)
        pos_weight = n_neg / max(n_pos, 1)
        print(f"  [NSFWDataset] total={len(self.paths):,} "
              f"(pos={n_pos:,}, neg={n_neg:,}) "
              f"| recommended pos_weight={pos_weight:.3f}")

    @staticmethod
    def recommended_pos_weight(positive_paths: List[Path],
                                negative_paths: List[Path]) -> float:
        return len(negative_paths) / max(len(positive_paths), 1)

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        path = self.paths[idx]
        label = self.labels[idx]
        try:
            img = Image.open(path).convert('RGB')
        except Exception:
            img = Image.new('RGB', (224, 224), (127, 127, 127))
        x = self.transform(img)
        y = torch.tensor([label], dtype=torch.float32)
        return x, y


# ─────────────────────────────────────────────────────────────────────────────
# Smoke test
# ─────────────────────────────────────────────────────────────────────────────

def run_smoke_test() -> None:
    print("\n" + "=" * 60)
    print("  NSFW CLASSIFIER -- SMOKE TEST")
    print("=" * 60)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"  Device: {device}")

    # Test 1 — Shape
    print("\n[Test 1] Shape...")
    model = NSFWClassifier(unfreeze_from_layer=4).to(device)
    dummy = torch.randn(4, 3, 224, 224, device=device)
    with torch.no_grad():
        out = model(dummy)
    assert out.shape == (4, 1), f"Expected (4,1), got {out.shape}"
    print(f"  [OK] Output shape: {out.shape}")

    # Test 2 — Partial freeze (layer4 trainable)
    print("\n[Test 2] Partial freeze (layer4 trainable)...")
    frozen_cnt = sum(1 for p in model.backbone.parameters() if not p.requires_grad)
    trainable_cnt = sum(1 for p in model.backbone.parameters() if p.requires_grad)
    print(f"  Frozen backbone params:    {frozen_cnt}")
    print(f"  Trainable backbone params: {trainable_cnt}")
    assert trainable_cnt > 0, "layer4 should be trainable!"
    print("  [OK] Partial freeze correct")

    # Test 3 — Gradient through head
    print("\n[Test 3] Head gradient flow...")
    model.train()
    out2 = model(dummy)
    out2.sum().backward()
    for name, param in model.head.named_parameters():
        assert param.grad is not None, f"Head '{name}' has no gradient!"
    print("  [OK] Head gradients OK")

    # Test 4 — predict_proba in [0, 1]
    print("\n[Test 4] predict_proba range...")
    model.eval()
    probs = model.predict_proba(dummy)
    assert 0.0 <= probs.min().item() and probs.max().item() <= 1.0
    print(f"  [OK] probs in [{probs.min().item():.4f}, {probs.max().item():.4f}]")

    # Test 5 — Independence from GoreDetector
    print("\n[Test 5] Head independence from GoreDetector...")
    from src.models.gore_detector import GoreDetector
    gore = GoreDetector(unfreeze_from_layer=4).to(device)
    nsfw_w = model.head[0].weight.data
    gore_w = gore.head[0].weight.data
    # Cùng shape → kiểm tra weights khác nhau (random init)
    assert not torch.allclose(nsfw_w, gore_w), "NSFW and Gore heads share weights!"
    print("  [OK] NSFW head is independent from Gore head")

    print("\n[PASS] ALL NSFW CLASSIFIER SMOKE TESTS PASSED")


if __name__ == '__main__':
    run_smoke_test()
