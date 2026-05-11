"""
gore_detector.py — V6.1
========================
Binary classifier: gore/blood (1) vs. normal (0)
Architecture: ImageNet ResNet18 backbone + trainable Linear head
Output:   logits [B, 1] — use BCEWithLogitsLoss during training

V6.1 Changes from V6.0:
  - GoreDataset: new API (path, label, weight) tuples + get_weighted_sampler()
  - get_default_transform(is_train): replaces gore_train/val_transform
  - GoreGradCAM: spatial heatmap for pseudo-labeling and visualization
  - Removed: collect_blood_violence, collect_hod_blood, collect_ucf101_images
    (logic moved to train_gore_v6.py → build_gore_splits)
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import Dataset, WeightedRandomSampler
from torchvision import transforms

import sys
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.models.backbone_factory import get_imagenet_resnet18

# ─────────────────────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────────────────────

class GoreDetector(nn.Module):
    """
    Binary: Gore/Blood (1) vs Normal (0)
    Backbone: ImageNet ResNet18, unfreeze layer4
    Data: Blood_Violence (filtered) + HOD/blood + negatives

    Roles in V6.1 pipeline:
      1. gore_feat scalar [index 772 in 775-dim vector]: predict_proba → [0,1]
      2. KL Distillation teacher: gore_scores [B,T,1] in loss function
      3. GradCAM spatial heatmap: pseudo-label for weakly supervised localization

    Fine-tune strategy:
      unfreeze_from_layer=4: layer4+head fine-tuned (recommended, ~7,948 pos)
      unfreeze_from_layer=0: frozen backbone (Linear Probing mode)
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
        """Returns sigmoid probabilities [B, 1] ∈ [0, 1]."""
        return torch.sigmoid(self.forward(x))


# ─────────────────────────────────────────────────────────────────────────────
# Transforms
# ─────────────────────────────────────────────────────────────────────────────

_MEAN = [0.485, 0.456, 0.406]
_STD  = [0.229, 0.224, 0.225]


def get_default_transform(is_train: bool = True) -> transforms.Compose:
    """
    ImageNet-normalized transforms for GoreDetector.

    Training: Resize(256) → RandomCrop(224) → augment → Normalize
    Inference: Resize(224) → Normalize

    Note: NO RandomErasing — would erase blood regions (signal loss).
    Note: RandomGrayscale(p=0.05) helps generalize across CCTV color profiles.
    """
    if is_train:
        return transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.RandomCrop(224),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(
                brightness=0.3, contrast=0.3,
                saturation=0.3, hue=0.05,
            ),
            transforms.RandomGrayscale(p=0.05),
            transforms.ToTensor(),
            transforms.Normalize(_MEAN, _STD),
        ])
    else:
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(_MEAN, _STD),
        ])


# ─────────────────────────────────────────────────────────────────────────────
# Dataset — V6.1 API: (path, label, weight) tuples
# ─────────────────────────────────────────────────────────────────────────────

class GoreDataset(Dataset):
    """
    GoreDetector dataset — V6.1.

    Args:
        samples: list of (image_path: str, label: int, weight: float)
            label: 1 = gore/blood, 0 = non-gore
            weight: per-sample importance for WeightedRandomSampler
                HOD/blood positive:     3.0  (most trusted)
                Blood_Viol clean pos:   2.0
                Blood_Viol contam pos:  0.5  (noisy — blood + weapon)
                HOD/gun, knife, wound:  2.0  (hard negative)
                Violent no blood:       1.5  (hard negative)
                UCF-101 red-heavy:      2.5  (tricky false positive)
                UCF-101 normal:         1.0  (soft negative)
        transform: torchvision transform. Defaults to inference transform.
    """

    def __init__(
        self,
        samples: List[tuple],
        transform: Optional[transforms.Compose] = None,
    ) -> None:
        self.samples   = samples
        self.transform = transform or get_default_transform(is_train=False)
        self.labels    = [int(lbl) for _, lbl, _ in samples]

        pos_cnt = sum(1 for _, l, _ in samples if l == 1)
        neg_cnt = sum(1 for _, l, _ in samples if l == 0)
        print(f"  [GoreDataset] total={len(samples):,} "
              f"(pos={pos_cnt:,}, neg={neg_cnt:,})")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor, float]:
        path, label, weight = self.samples[idx]
        try:
            img = Image.open(path).convert('RGB')
        except Exception:
            img = Image.new('RGB', (224, 224), (0, 0, 0))
        x = self.transform(img)
        y = torch.tensor([label], dtype=torch.float32)
        return x, y, weight

    def get_weighted_sampler(self) -> WeightedRandomSampler:
        """
        WeightedRandomSampler using per-sample weights.

        Ensures hard negatives (HOD/gun, UCF red-heavy) appear ~2-3x
        more often than soft negatives (UCF normal), preventing model
        from converging on easy cases early.
        """
        weights = [w for (_, _, w) in self.samples]
        return WeightedRandomSampler(
            weights=weights,
            num_samples=len(weights),
            replacement=True,
        )


# ─────────────────────────────────────────────────────────────────────────────
# GradCAM — Spatial Heatmap
# ─────────────────────────────────────────────────────────────────────────────

class GoreGradCAM:
    """
    Gradient-weighted Class Activation Map for GoreDetector.

    Produces a 2D heatmap [224, 224] ∈ [0, 1] highlighting
    regions in a frame most likely to contain blood/gore.

    Uses:
      1. Visualization: overlay heatmap on frame to debug detector
      2. Pseudo-labeling: get_pseudo_mask() for weakly supervised localization
         → highlight WHERE gore is, not just IF gore exists

    Hook: backbone.layer4[-1] (last conv block of ResNet18)
    """

    def __init__(self, model: GoreDetector) -> None:
        self.model       = model
        self.gradients   = None
        self.activations = None
        self.model.eval()

        def _save_grad(grad):
            self.gradients = grad

        def _save_activation(module, input, output):
            self.activations = output
            output.register_hook(_save_grad)

        # Hook into the last conv block of layer4
        self.model.backbone.layer4[-1].register_forward_hook(_save_activation)

    def generate_cam(self, frame_tensor: torch.Tensor) -> np.ndarray:
        """
        Generate Class Activation Map for a single frame.

        Args:
            frame_tensor: [1, 3, 224, 224], ImageNet-normalized
        Returns:
            cam: np.ndarray [224, 224], values ∈ [0, 1]
                 1.0 = high probability of gore
                 0.0 = unrelated region
        """
        self.model.zero_grad()

        output = self.model(frame_tensor)        # [1, 1]
        score  = torch.sigmoid(output)
        score.backward()

        # Grad-weighted channel pooling: [1, 512, 7, 7] → [1, 7, 7]
        weights = self.gradients.mean(dim=[2, 3], keepdim=True)  # [1, 512, 1, 1]
        cam     = (weights * self.activations).sum(dim=1)        # [1, 7, 7]
        cam     = F.relu(cam).squeeze().detach().cpu().numpy()   # [7, 7]

        # Upsample to input resolution
        cam = cv2.resize(cam, (224, 224))

        # Normalize to [0, 1]
        cam_min, cam_max = cam.min(), cam.max()
        cam = (cam - cam_min) / (cam_max - cam_min + 1e-8)

        return cam  # [224, 224] ∈ [0, 1]

    def get_pseudo_mask(
        self,
        frame_tensor: torch.Tensor,
        threshold: float = 0.4,
    ) -> np.ndarray:
        """
        Binary mask: 1 where pixel likely belongs to gore region.

        Args:
            frame_tensor: [1, 3, 224, 224]
            threshold: CAM value threshold (default 0.4)
        Returns:
            mask: np.ndarray [224, 224], dtype uint8, values {0, 1}
        """
        cam = self.generate_cam(frame_tensor)
        return (cam > threshold).astype(np.uint8)

    def overlay_on_frame(
        self,
        frame_bgr: np.ndarray,
        frame_tensor: torch.Tensor,
        alpha: float = 0.4,
    ) -> np.ndarray:
        """
        Overlay heatmap on original frame for visualization.

        Args:
            frame_bgr: Original frame in BGR format [H, W, 3]
            frame_tensor: [1, 3, 224, 224], normalized
            alpha: Heatmap opacity (0=invisible, 1=full heatmap)
        Returns:
            blended: np.ndarray [H, W, 3] BGR with heatmap overlay
        """
        cam = self.generate_cam(frame_tensor)

        # Resize heatmap to match frame dimensions
        h, w = frame_bgr.shape[:2]
        heatmap = cv2.applyColorMap(
            cv2.resize((cam * 255).astype(np.uint8), (w, h)),
            cv2.COLORMAP_JET,
        )
        return cv2.addWeighted(frame_bgr, 1 - alpha, heatmap, alpha, 0)


# ─────────────────────────────────────────────────────────────────────────────
# Smoke test
# ─────────────────────────────────────────────────────────────────────────────

def run_smoke_test() -> None:
    print("\n" + "=" * 60)
    print("  GORE DETECTOR V6.1 — SMOKE TEST")
    print("=" * 60)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"  Device: {device}")

    # Test 1 — Shape
    print("\n[Test 1] Shape...")
    model = GoreDetector(unfreeze_from_layer=4).to(device)
    dummy = torch.randn(4, 3, 224, 224, device=device)
    with torch.no_grad():
        out = model(dummy)
    assert out.shape == (4, 1), f"Expected (4,1), got {out.shape}"
    print(f"  [OK] Output shape: {out.shape}")

    # Test 2 — Partial freeze
    print("\n[Test 2] Partial freeze (layer4 trainable)...")
    frozen_cnt    = sum(1 for p in model.backbone.parameters() if not p.requires_grad)
    trainable_cnt = sum(1 for p in model.backbone.parameters() if p.requires_grad)
    print(f"  Frozen backbone params:    {frozen_cnt}")
    print(f"  Trainable backbone params: {trainable_cnt}")
    assert trainable_cnt > 0, "layer4 should be trainable!"
    print("  [OK] Partial freeze correct")

    # Test 3 — Gradient flow
    print("\n[Test 3] Gradient flow (head + backbone layer4)...")
    model.train()
    out2 = model(dummy)
    out2.sum().backward()
    for name, param in model.head.named_parameters():
        assert param.grad is not None, f"Head '{name}' has no gradient!"
    print("  [OK] Head gradients OK")

    # Test 4 — predict_proba range
    print("\n[Test 4] predict_proba range [0, 1]...")
    model.eval()
    probs = model.predict_proba(dummy)
    assert 0.0 <= probs.min().item() and probs.max().item() <= 1.0
    print(f"  [OK] probs in [{probs.min().item():.4f}, {probs.max().item():.4f}]")

    # Test 5 — GoreDataset new API
    print("\n[Test 5] GoreDataset (path, label, weight) API...")
    import tempfile, os
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create fake images
        samples = []
        for i in range(6):
            p = os.path.join(tmpdir, f"img_{i}.jpg")
            Image.new('RGB', (64, 64), color=(i * 30, 0, 0)).save(p)
            label  = 1 if i < 3 else 0
            weight = 2.0 if label == 1 else 1.0
            samples.append((p, label, weight))

        ds = GoreDataset(samples, get_default_transform(is_train=False))
        assert len(ds) == 6
        x, y, w = ds[0]
        assert x.shape == (3, 224, 224), f"Expected (3,224,224), got {x.shape}"
        assert y.shape == (1,)
        assert isinstance(w, float)
        print(f"  [OK] Sample: x={x.shape}, y={y.item()}, weight={w}")

    # Test 6 — WeightedRandomSampler
    print("\n[Test 6] get_weighted_sampler()...")
    sampler = ds.get_weighted_sampler()
    assert len(list(sampler)) == len(ds)
    print(f"  [OK] Sampler with {len(ds)} samples")

    # Test 7 — GoreGradCAM (CPU only)
    print("\n[Test 7] GoreGradCAM...")
    cpu_model = GoreDetector(unfreeze_from_layer=4)
    cam_gen   = GoreGradCAM(cpu_model)
    cpu_dummy = torch.randn(1, 3, 224, 224)
    cam_map   = cam_gen.generate_cam(cpu_dummy)
    assert cam_map.shape == (224, 224), f"Expected (224,224), got {cam_map.shape}"
    assert cam_map.min() >= 0.0 and cam_map.max() <= 1.0
    mask = cam_gen.get_pseudo_mask(cpu_dummy, threshold=0.4)
    assert mask.dtype == np.uint8
    print(f"  [OK] CAM shape={cam_map.shape}, range=[{cam_map.min():.3f},{cam_map.max():.3f}]")
    print(f"  [OK] Pseudo mask: {mask.sum()} pixels flagged")

    print("\n[PASS] ALL GORE DETECTOR V6.1 SMOKE TESTS PASSED")


if __name__ == '__main__':
    run_smoke_test()
