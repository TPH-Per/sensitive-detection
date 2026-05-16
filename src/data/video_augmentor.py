"""
video_augmentor.py — V6.1
===========================
V6.0: Temporal augmentation (jitter, speed, reverse, noise).
V6.1: Thêm VideoQualityAugmentor — xóa correlation video quality–label.

Nguyên nhân thêm VideoQualityAugmentor:
  Violence videos (RWF-2000/UCF-Crimes): 240p-360p, CCTV, grain nặng
  Non-Violence videos (UCF-101): 720p-HD, tripod, clear, colorful
  → Model có thể học "blurry = violent" thay vì học hành vi thực sự

Strategy:
  Violence videos (blurry) → 30% xác suất: apply HD style
  Normal videos  (clear)   → 40% xác suất: apply surveillance style

VideoQualityAugmentor dùng ở frame-level TRƯỚC khi extract features.
Không thể dùng trên feature-level (CLIP embedding đã encode quality).
"""
from __future__ import annotations

import random
import numpy as np


class VideoAugmentor:
    """
    Temporal augmentation cho feature sequences [T, D].
    Áp dụng trực tiếp lên numpy array feature, không phải pixel.
    """

    def __init__(
        self,
        jitter: int = 2,
        speed_factors: list[float] | None = None,
        reverse_p: float = 0.3,
        noise_std: float = 0.01,
        noise_p: float = 0.3,
        enable_for_nsfw: bool = False,
    ):
        self.jitter = jitter
        self.speed_factors = speed_factors or [0.8, 1.0, 1.2]
        self.reverse_p = reverse_p
        self.noise_std = noise_std
        self.noise_p = noise_p
        self.enable_for_nsfw = enable_for_nsfw

    def temporal_jitter(self, features: np.ndarray) -> np.ndarray:
        if self.jitter <= 0 or len(features) <= self.jitter * 2:
            return features
        offset = random.randint(-self.jitter, self.jitter)
        start = max(0, offset)
        return features[start:]

    def speed_perturbation(self, features: np.ndarray, factor: float | None = None) -> np.ndarray:
        T = len(features)
        if T < 4:
            return features
        if factor is None:
            factor = random.choice(self.speed_factors)
        factor = max(0.5, min(2.0, factor))
        new_T = max(4, int(T / factor))
        indices = np.linspace(0, T - 1, new_T).astype(int)
        return features[indices]

    def temporal_reverse(self, features: np.ndarray) -> np.ndarray:
        """Đánh nhau ngược chiều cũng là đánh nhau. Không dùng cho NSFW."""
        if random.random() < self.reverse_p:
            return features[::-1].copy()
        return features

    def feature_noise(self, features: np.ndarray) -> np.ndarray:
        """Noise chỉ vào CLIP channels (0:768), không touch aux signals."""
        if random.random() < self.noise_p:
            noise = np.random.normal(0, self.noise_std, (len(features), 768)).astype(np.float32)
            features = features.copy()
            features[:, :768] += noise
        return features

    def pad_or_truncate(self, features: np.ndarray, target_T: int) -> np.ndarray:
        T, D = features.shape
        if T >= target_T:
            return features[:target_T]
        pad = np.zeros((target_T - T, D), dtype=features.dtype)
        return np.concatenate([features, pad], axis=0)

    def __call__(self, features: np.ndarray, target_T: int = 64, is_nsfw: bool = False) -> np.ndarray:
        features = self.temporal_jitter(features)
        features = self.speed_perturbation(features)
        if not is_nsfw:
            features = self.temporal_reverse(features)
        features = self.feature_noise(features)
        features = self.pad_or_truncate(features, target_T)
        return features.astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# VideoQualityAugmentor — V6.1
# ─────────────────────────────────────────────────────────────────────────────

class VideoQualityAugmentor:
    """
    Xóa correlation giữa video quality và violence label.
    Dùng trên PIL Images TRƯỚC khi extract CLIP/Gore/NSFW/SelfHarm features.

    CHI DU DUNG CHO TRAIN SET.
    Val/Test KHONG BAO GIO duoc augment quality.
    """

    def apply_surveillance_style(self, frames: list, p: float = 0.4) -> list:
        """
        Biến HD non-violence video thành surveillance-like.
        Mục tiêu: model không thể dùng "clear = not violent" shortcut.
        """
        import cv2
        if random.random() > p:
            return frames

        sigma  = random.uniform(0.5, 2.0)
        grain  = random.uniform(0.05, 0.20)
        jpeg_q = random.randint(40, 70)

        result = []
        for frame in frames:
            arr = np.array(frame)
            # 1. Gaussian blur
            k = int(sigma * 3) * 2 + 1
            arr = cv2.GaussianBlur(arr, (k, k), sigma)
            # 2. Film grain
            noise = np.random.normal(0, grain * 255, arr.shape).astype(np.float32)
            arr = np.clip(arr.astype(float) + noise, 0, 255).astype(np.uint8)
            # 3. JPEG artifacts
            _, enc = cv2.imencode('.jpg', cv2.cvtColor(arr, cv2.COLOR_RGB2BGR),
                                  [cv2.IMWRITE_JPEG_QUALITY, jpeg_q])
            arr = cv2.imdecode(enc, cv2.IMREAD_COLOR)
            arr = cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)
            from PIL import Image as _Image
            result.append(_Image.fromarray(arr))
        return result

    def apply_hd_style(self, frames: list, p: float = 0.3) -> list:
        """
        Biến surveillance violence video thành HD-like.
        Mục tiêu: model không thể dùng "blurry = violent" shortcut.
        """
        import cv2
        if random.random() > p:
            return frames

        strength  = random.uniform(0.3, 0.8)
        h_denoise = 10

        result = []
        for frame in frames:
            arr = np.array(frame)
            bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            # 1. Denoise
            bgr = cv2.fastNlMeansDenoisingColored(bgr, None, h_denoise, h_denoise, 7, 21)
            # 2. Unsharp mask (sharpening)
            blurred   = cv2.GaussianBlur(bgr, (0, 0), 3)
            sharpened = cv2.addWeighted(bgr, 1 + strength, blurred, -strength, 0)
            arr = cv2.cvtColor(sharpened, cv2.COLOR_BGR2RGB)
            from PIL import Image as _Image
            result.append(_Image.fromarray(arr))
        return result

    def augment(self, frames: list, label: int, aug_prob: float = 0.4) -> list:
        """
        Tự động chọn style dựa trên violence label.
        label=1 (Violence/blurry): p=aug_prob*0.75 → HD style
        label=0 (Normal/clear):    p=aug_prob      → surveillance style
        """
        if label == 1:
            return self.apply_hd_style(frames, p=aug_prob * 0.75)
        else:
            return self.apply_surveillance_style(frames, p=aug_prob)


# ─────────────────────────────────────────────────────────────────────────────
# Smoke test
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 50)
    print("  VideoAugmentor + VideoQualityAugmentor Smoke Test V6.1")
    print("=" * 50)

    aug  = VideoAugmentor(jitter=2, reverse_p=0.3, noise_std=0.01)
    T, D, target = 80, 775, 64  # V6.1: 775-dim

    feat = np.random.randn(T, D).astype(np.float32)
    feat[:, 772] = np.clip(feat[:, 772], 0, 1)   # gore
    feat[:, 773] = np.clip(feat[:, 773], 0, 1)   # selfharm (V6.1)
    feat[:, 774] = np.clip(feat[:, 774], 0, 1)   # nsfw

    out = aug(feat, target_T=target)
    assert out.shape == (target, D), f"Shape wrong: {out.shape}"
    print(f"  [OK] VideoAugmentor output shape: {out.shape}")

    qa = VideoQualityAugmentor()
    print(f"  [OK] VideoQualityAugmentor instantiated OK")
    print("\n[PASS] All smoke tests passed")
