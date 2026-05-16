"""
raw_video_ssl_model.py  (v2 — Fixed architecture)

Fixes applied from fixcell16b.md:
  Fix #1: Sigmoid + BCEWithLogitsLoss (heads output 1, not 2)
  Fix #2: Progressive unfreeze (gradually open layer3→layer2→layer1)
  Fix #3: Temporal Self-Attention replaces Conv1D (RF=16 instead of 5)
  Fix #5: Projector MLP to prevent dimensional collapse
  Fix #6: Diagnostic metrics (cosine sim, effective rank, temporal variance)
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import resnet18, ResNet18_Weights


class _TemporalSelfAttention(nn.Module):
    """
    Non-local style self-attention over the temporal dimension.
    Every frame can attend to all other frames → receptive field = T (all 16).
    Fixes the Conv1D RF=5 limitation (Fix #3).
    """

    def __init__(self, in_channels: int = 256, reduction: int = 2) -> None:
        super().__init__()
        mid = in_channels // reduction
        self.query = nn.Conv1d(in_channels, mid, 1)
        self.key   = nn.Conv1d(in_channels, mid, 1)
        self.value = nn.Conv1d(in_channels, mid, 1)
        self.proj  = nn.Conv1d(mid, in_channels, 1)
        # Init projection to zero → residual connection starts as identity
        nn.init.zeros_(self.proj.weight)
        nn.init.zeros_(self.proj.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, C, T]
        B, C, T = x.shape
        Q = self.query(x)                                    # [B, mid, T]
        K = self.key(x)                                      # [B, mid, T]
        V = self.value(x)                                    # [B, mid, T]
        attn = torch.bmm(Q.transpose(1, 2), K) / (C ** 0.5) # [B, T, T]
        attn = F.softmax(attn, dim=-1)
        out = torch.bmm(V, attn.transpose(1, 2))            # [B, mid, T]
        out = self.proj(out)                                 # [B, C, T]
        return (x + out).mean(dim=-1)                        # [B, C]


class RawVideoSSLModel(nn.Module):
    """
    Temporal SSL model v2 with all fixes applied.

    Architecture:
      ResNet-18 backbone (progressive unfreeze)
        → [B, T, 512]
      Projector MLP (anti dimensional collapse)
        → [B, T, proj_dim]
      Temporal Self-Attention (global receptive field)
        → [B, proj_dim]
      3 binary heads (1 output each, Sigmoid via BCEWithLogitsLoss)
    """

    def __init__(
        self,
        pretrained: bool = False,
        hidden_dim: int = 512,
        proj_dim: int = 256,
        dropout: float = 0.3,
    ) -> None:
        super().__init__()
        self.proj_dim = proj_dim

        # ── Backbone ──────────────────────────────────────────────────────
        weights = ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        backbone = resnet18(weights=weights)
        self.stem   = nn.Sequential(backbone.conv1, backbone.bn1, backbone.relu, backbone.maxpool)
        self.layer1 = backbone.layer1
        self.layer2 = backbone.layer2
        self.layer3 = backbone.layer3
        self.layer4 = backbone.layer4
        self.spatial_pool = nn.AdaptiveAvgPool2d(1)

        # Start fully frozen — progressive_unfreeze() will open layers
        for param in self.parameters():
            param.requires_grad_(False)

        # ── Fix #5: Projector MLP ─────────────────────────────────────────
        self.projector = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim, proj_dim),
            nn.BatchNorm1d(proj_dim),
            nn.ReLU(inplace=True),
            nn.Linear(proj_dim, proj_dim),
        )

        # ── Fix #3: Temporal Self-Attention ───────────────────────────────
        self.temporal_attn = _TemporalSelfAttention(
            in_channels=proj_dim, reduction=2,
        )

        # ── Fix #1: Binary heads (1 output each) ─────────────────────────
        head = lambda: nn.Sequential(nn.Dropout(dropout), nn.Linear(proj_dim, 1))
        self.direction_head = head()
        self.speed_head     = head()
        self.shuffle_head   = head()

        # Unfreeze all non-backbone modules (projector, attention, heads)
        for module in [self.projector, self.temporal_attn,
                       self.direction_head, self.speed_head, self.shuffle_head]:
            for param in module.parameters():
                param.requires_grad_(True)

        # Always unfreeze layer4 at init
        for param in self.layer4.parameters():
            param.requires_grad_(True)

    # ── Fix #2: Progressive Unfreeze ──────────────────────────────────────

    def progressive_unfreeze(self, epoch: int) -> str:
        """
        Gradually unfreeze backbone layers as training progresses.
        Returns description of current freeze state for logging.
        """
        schedule = {3: self.layer3, 6: self.layer2, 10: self.layer1, 14: self.stem}
        unfrozen = ['layer4']
        for trigger_epoch, layer in schedule.items():
            if epoch >= trigger_epoch:
                for param in layer.parameters():
                    param.requires_grad_(True)
                # Extract name for logging
                for name in ['layer3', 'layer2', 'layer1', 'stem']:
                    if getattr(self, name, None) is layer:
                        unfrozen.append(name)
                        break
        return '+'.join(reversed(unfrozen))

    def _encode_frames(self, clip: torch.Tensor) -> torch.Tensor:
        """[B, T, 3, H, W] → [B, proj_dim]"""
        B, T, C, H, W = clip.shape
        x = clip.view(B * T, C, H, W)
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.spatial_pool(x).flatten(1)  # [B*T, 512]

        # Projector
        x = self.projector(x)               # [B*T, proj_dim]
        x = x.view(B, T, self.proj_dim)     # [B, T, proj_dim]

        # Temporal Self-Attention
        x = x.permute(0, 2, 1)              # [B, proj_dim, T]
        x = self.temporal_attn(x)           # [B, proj_dim]
        return x

    def forward(
        self,
        frames_direction: torch.Tensor,
        frames_speed:     torch.Tensor,
        frames_shuffle:   torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Returns logits (NOT probabilities) — squeeze to [B].
        Use BCEWithLogitsLoss, not CrossEntropyLoss.
        """
        feat_d  = self._encode_frames(frames_direction)
        feat_s  = self._encode_frames(frames_speed)
        feat_sh = self._encode_frames(frames_shuffle)
        return (
            self.direction_head(feat_d).squeeze(-1),   # [B]
            self.speed_head(feat_s).squeeze(-1),       # [B]
            self.shuffle_head(feat_sh).squeeze(-1),    # [B]
        )

    # ── Fix #6: Diagnostic Metrics ────────────────────────────────────────

    @torch.no_grad()
    def compute_diagnostics(self, clip: torch.Tensor, device: torch.device) -> dict:
        """
        Measure feature quality to detect dimensional collapse.
        clip: [B, T, 3, H, W] — a single batch from val loader.
        """
        self.eval()
        B, T, C, H, W = clip.shape
        x = clip.view(B * T, C, H, W).to(device)
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        feats = self.spatial_pool(x).flatten(1)  # [B*T, 512]
        feats = feats.view(B, T, -1)             # [B, T, 512]

        # 1. Cosine similarity between consecutive frames
        sim = F.cosine_similarity(
            feats[:, :-1].reshape(-1, 512),
            feats[:, 1:].reshape(-1, 512),
            dim=-1,
        ).mean().item()

        # 2. Effective rank of feature matrix
        feat_matrix = feats.reshape(-1, 512)
        sv = torch.linalg.svdvals(feat_matrix)
        effective_rank = int((sv > sv[0] * 0.01).sum().item())

        # 3. Temporal variance (should be > 0.1 if backbone encodes motion)
        temporal_var = feats.var(dim=1).mean().item()

        return {
            'frame_cosine_sim': round(sim, 4),
            'effective_rank':   effective_rank,
            'temporal_var':     round(temporal_var, 6),
        }

    def load_swav_weights(self, checkpoint_path: str, device: torch.device) -> int:
        """Load compatible SwAV weights into ResNet-18 backbone."""
        ckpt = torch.load(checkpoint_path, map_location=device)
        if isinstance(ckpt, dict):
            src = ckpt.get('model_state', ckpt.get('state_dict', ckpt))
        else:
            src = ckpt
        if not isinstance(src, dict):
            return 0

        remapped = {}
        for k, v in src.items():
            if k.startswith('backbone.'):
                remapped[k[len('backbone.'):]] = v
            else:
                remapped[k] = v

        dst = self.state_dict()
        loaded = {}
        for k, v in remapped.items():
            if k in dst and isinstance(v, torch.Tensor) and dst[k].shape == v.shape:
                loaded[k] = v

        if loaded:
            dst.update(loaded)
            self.load_state_dict(dst, strict=False)
        return len(loaded)
