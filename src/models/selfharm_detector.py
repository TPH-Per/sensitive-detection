"""
selfharm_detector.py — V6.1
============================
Binary classifier: Self-harm visual cue (1) vs Normal (0)
Architecture: ImageNet ResNet18 backbone + trainable Linear Head

Coverage: ~85% visual self-harm cases
Hard Limit: uống thuốc, nhịn ăn → không có visual cue → 0% coverage

Training data design:
  Positive (~1,014): Self Harm Detection (618) + Suicide Detection (396)
  Hard Negative (~3,085): HOD/gun (1,565) + Blood_Violence (800) + Medical wounds (720)
  Soft Negative (~1,000): UCF-101 random frames

Teacher role: Thay thế GoreDetector làm teacher cho S_Gate trong KL Distillation.
GoreDetector coverage ~50% (bỏ sót treo cổ, uống thuốc).
SelfHarmDetector coverage ~85% visual cases.
"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from typing import List, Optional
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms

from src.models.backbone_factory import get_imagenet_resnet18


# ─────────────────────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────────────────────

class SelfHarmDetector(nn.Module):
    """
    Binary: Self-harm visual cue (1) vs Normal (0)
    Backbone: ImageNet ResNet18, frozen (head only — data ít)
    Data: ~1,400 positive + ~4,000 negative (hard negatives)
    Task: Teacher input cho S_Gate — THAY THẾ GoreDetector

    Coverage ~85% visual self-harm:
      ✅ Cắt cổ tay / vết bầm tím
      ✅ Súng kề đầu (nhờ HOD/gun hard negative)
      ✅ Treo cổ / dây thừng (Suicide Detection)
      ❌ Uống thuốc, nhịn ăn → hard limitation (không có visual cue)

    Tại sao frozen hoàn toàn (unfreeze_from_layer=0):
      Data ít (~1,400) → fine-tune layer4 dễ overfit
      Nếu AUC < 0.75 sau 20 epochs → fallback: unfreeze_from_layer=4
    """

    def __init__(self, unfreeze_from_layer: int = 0) -> None:
        super().__init__()
        self.backbone = get_imagenet_resnet18(unfreeze_from_layer)
        
        self.head = nn.Sequential(
            nn.Linear(512, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.4),      # Dropout cao hơn vì data ít
            nn.Linear(64, 1)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: [B, 3, 224, 224] → logits [B, 1]"""
        feats = self.backbone(x)       # [B, 512]
        logits = self.head(feats)      # [B, 1]
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


def selfharm_train_transform() -> transforms.Compose:
    """
    Augmentation ưu tiên RECALL — bỏ sót self-harm = nguy hiểm tính mạng.

    ❌ KHÔNG dùng: CutOut, RandomErasing → có thể xóa vết thương
    ❌ KHÔNG dùng: VerticalFlip → tư thế treo cổ mất nghĩa nếu lộn ngược
    ❌ KHÔNG dùng: ColorJitter quá mạnh → màu máu/bầm là signal quan trọng
    """
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ColorJitter(
            brightness=0.3, contrast=0.3,
            saturation=0.3, hue=0.1,    # Máu/bầm có nhiều sắc thái màu
        ),
        transforms.RandomApply([
            transforms.GaussianBlur(kernel_size=5, sigma=(0.1, 2.0))  # Simulate CCTV
        ], p=0.3),
        transforms.ToTensor(),
        transforms.Normalize(_MEAN, _STD),
        # RandomErasing: DISABLED — co the xoa vet thuong (signal quan trong)
    ])


def selfharm_val_transform() -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(_MEAN, _STD),
    ])


# ─────────────────────────────────────────────────────────────────────────────
# Dataset
# ─────────────────────────────────────────────────────────────────────────────

class SelfHarmDataset(Dataset):
    """
    Dataset cho SelfHarmDetector training.

    QUYẾT ĐỊNH QUAN TRỌNG VỀ SPLIT:
    - Self Harm Detection.v1i.yolov8: KHÔNG re-split.
      Giữ nguyên split gốc Roboflow. 618 train đã augment từ ~120-200 ảnh gốc.
      Nếu re-split: ảnh augmented vào test → DATA LEAKAGE.
    - Suicide Detection.v1i.yolov8: TOÀN BỘ 396 ảnh cho training.
      Val/Test: dùng từ Self Harm split gốc (58+29 ảnh gốc).

    Hard Negative Sources (theo thứ tự ưu tiên):
    1. HOD/gun (1,565): "Súng thường ≠ súng kề đầu" → đúng mục tiêu nhất
    2. Blood_Violence (800): "Máu đánh nhau ≠ tự làm hại" → cần thiết
    3. Medical wounds (720): "Vết thương y tế ≠ tự làm hại" → optional
    4. UCF-101 (1,000): Chỉ để balance class, không phải hard negative
    """

    def __init__(
        self,
        positive_paths: List[Path],
        negative_paths: List[Path],
        transform: Optional[transforms.Compose] = None,
    ) -> None:
        self.paths  = positive_paths + negative_paths
        self.labels = [1.0] * len(positive_paths) + [0.0] * len(negative_paths)
        self.transform = transform or selfharm_val_transform()

        n_pos = len(positive_paths)
        n_neg = len(negative_paths)
        print(f"  [SelfHarmDataset] total={len(self.paths):,} "
              f"(pos={n_pos:,}, neg={n_neg:,}) "
              f"| pos_weight≈{n_neg/max(n_pos,1):.2f}")

    @staticmethod
    def recommended_pos_weight(n_pos: int, n_neg: int) -> float:
        return n_neg / max(n_pos, 1)

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, idx: int):
        path, label = self.paths[idx], self.labels[idx]
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
    print("  SELFHARM DETECTOR V6.1 — SMOKE TEST")
    print("=" * 60)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"  Device: {device}")

    # Test 1 — Shape
    print("\n[Test 1] Shape...")
    model = SelfHarmDetector(unfreeze_from_layer=0).to(device)
    dummy = torch.randn(4, 3, 224, 224, device=device)
    with torch.no_grad():
        out = model(dummy)
    assert out.shape == (4, 1), f"Expected (4,1), got {out.shape}"
    print(f"  [OK] Output shape: {out.shape}")

    # Test 2 — Frozen backbone
    print("\n[Test 2] Frozen backbone...")
    for name, param in model.backbone.named_parameters():
        assert not param.requires_grad, f"Backbone '{name}' should be frozen!"
    print("  [OK] All backbone params frozen")

    # Test 3 — Gradient through head
    print("\n[Test 3] Head gradient flow...")
    model.head.zero_grad()
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

    # Test 5 — Independence từ GoreDetector
    print("\n[Test 5] Head independence...")
    from src.models.gore_detector import GoreDetector
    gore = GoreDetector(unfreeze_from_layer=0).to(device)
    sh_w = model.head[0].weight.data
    go_w = gore.head[0].weight.data
    # Shapes khác nhau là đủ để biết độc lập
    if sh_w.shape == go_w.shape:
        assert not torch.allclose(sh_w, go_w), "SelfHarm và Gore heads share weights!"
    print("  [OK] SelfHarm head independent from GoreDetector")

    print("\n[PASS] ALL SELFHARM DETECTOR SMOKE TESTS PASSED")


if __name__ == '__main__':
    run_smoke_test()
