from __future__ import annotations

import math
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import VideoMAEModel


class LoRALinear(nn.Module):
    """
    LoRA wrapper for nn.Linear:
      y = base(x) + scale * B(A(dropout(x)))
    """

    def __init__(
        self,
        base: nn.Linear,
        r: int = 8,
        alpha: float = 16.0,
        dropout: float = 0.05,
    ) -> None:
        super().__init__()
        if not isinstance(base, nn.Linear):
            raise TypeError(f"LoRALinear expects nn.Linear, got {type(base)}")

        self.base = base
        self.r = int(r)
        self.alpha = float(alpha)
        self.scale = self.alpha / max(self.r, 1)
        self.drop = nn.Dropout(dropout)

        in_features = base.in_features
        out_features = base.out_features
        self.in_features = in_features
        self.out_features = out_features
        self.lora_A = nn.Linear(in_features, self.r, bias=False)
        self.lora_B = nn.Linear(self.r, out_features, bias=False)

        # Init LoRA: A random small, B zero => starts from base behavior.
        nn.init.kaiming_uniform_(self.lora_A.weight, a=math.sqrt(5))
        nn.init.zeros_(self.lora_B.weight)

        # Freeze base params.
        for p in self.base.parameters():
            p.requires_grad_(False)

    @property
    def weight(self) -> torch.Tensor:
        """
        Compatibility shim:
        Some HF attention implementations call `module.weight` directly and then
        use `F.linear(...)` instead of calling `module(x)`.
        We expose merged weight = base + LoRA delta so LoRA still takes effect.
        """
        delta = torch.matmul(self.lora_B.weight, self.lora_A.weight) * self.scale
        return self.base.weight + delta

    @property
    def bias(self) -> torch.Tensor | None:
        return self.base.bias

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Keep forward consistent with `.weight` merged behavior.
        return F.linear(x, self.weight, self.bias)


def _set_module(root: nn.Module, dotted_name: str, module: nn.Module) -> None:
    parent = root
    parts = dotted_name.split(".")
    for p in parts[:-1]:
        parent = getattr(parent, p)
    setattr(parent, parts[-1], module)


def attach_lora_to_videomae(
    videomae: VideoMAEModel,
    lora_r: int = 8,
    lora_alpha: float = 16.0,
    lora_dropout: float = 0.05,
    target_last_n_layers: int = 4,
) -> list[str]:
    """
    Attach LoRA to q/v projections of the last N encoder layers.
    Returns list of module names patched.
    """
    patched = []
    total = len(videomae.encoder.layer)
    start = max(0, total - int(target_last_n_layers))
    for idx in range(start, total):
        for proj_name in ("query", "value"):
            dotted = f"encoder.layer.{idx}.attention.attention.{proj_name}"
            full = f"videomae.{dotted}"
            base = videomae.encoder.layer[idx].attention.attention.__getattr__(proj_name)
            lora = LoRALinear(base, r=lora_r, alpha=lora_alpha, dropout=lora_dropout)
            _set_module(videomae, dotted, lora)
            patched.append(full)
    return patched


def topk_noisy_or(probs: torch.Tensor, topk_ratio: float = 0.2, topk_min: int = 3) -> torch.Tensor:
    """
    probs: [B, T] in [0,1]
    returns: [B] = 1 - Π(1-p_t), t in top-k
    """
    eps = 1e-6
    probs = probs.clamp(0.0, 1.0)
    T = probs.shape[-1]
    k = max(int(topk_min), int(math.ceil(T * float(topk_ratio))))
    k = min(k, T)
    topk_vals = torch.topk(probs, k=k, dim=-1).values
    return 1.0 - torch.prod(1.0 - topk_vals + eps, dim=-1)


@dataclass
class V7Config:
    model_name: str = "MCG-NJU/videomae-small-finetuned-ssv2"
    d_aux: int = 7
    d_fuse: int = 384
    lora_r: int = 8
    lora_alpha: float = 16.0
    lora_dropout: float = 0.05
    lora_last_n_layers: int = 4
    dropout: float = 0.2


class VideoModerationV7(nn.Module):
    """
    V7 backbone:
      - VideoMAE encoder (raw video)
      - LoRA on q/v in last N blocks
      - Aux fusion with old experts (flow/yolo/gore/selfharm/nsfw summary)
      - 3 task heads (V/S/N)
    """

    def __init__(self, cfg: V7Config) -> None:
        super().__init__()
        self.cfg = cfg
        self.videomae = VideoMAEModel.from_pretrained(cfg.model_name)

        # Freeze full backbone then open only LoRA adapters.
        for p in self.videomae.parameters():
            p.requires_grad_(False)

        self.lora_patched_modules = attach_lora_to_videomae(
            self.videomae,
            lora_r=cfg.lora_r,
            lora_alpha=cfg.lora_alpha,
            lora_dropout=cfg.lora_dropout,
            target_last_n_layers=cfg.lora_last_n_layers,
        )

        hidden = int(self.videomae.config.hidden_size)
        self.video_proj = nn.Sequential(
            nn.LayerNorm(hidden),
            nn.Linear(hidden, cfg.d_fuse),
            nn.GELU(),
            nn.Dropout(cfg.dropout),
        )
        self.aux_proj = nn.Sequential(
            nn.LayerNorm(cfg.d_aux),
            nn.Linear(cfg.d_aux, cfg.d_fuse),
            nn.GELU(),
            nn.Dropout(cfg.dropout),
        )
        self.gate = nn.Sequential(
            nn.Linear(cfg.d_fuse * 2, cfg.d_fuse),
            nn.GELU(),
            nn.Linear(cfg.d_fuse, cfg.d_fuse),
            nn.Sigmoid(),
        )
        self.fuse_norm = nn.LayerNorm(cfg.d_fuse)

        def head():
            return nn.Sequential(
                nn.Dropout(cfg.dropout),
                nn.Linear(cfg.d_fuse, 1),
            )

        self.v_head = head()
        self.s_head = head()
        self.n_head = head()

    def forward(
        self,
        pixel_values: torch.Tensor,  # [B, T, 3, H, W]
        aux_summary: torch.Tensor | None = None,  # [B, 7]
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        outputs = self.videomae(pixel_values=pixel_values)
        cls = outputs.last_hidden_state[:, 0, :]  # [B, hidden]

        v_h = self.video_proj(cls)
        if aux_summary is None:
            aux_summary = torch.zeros(
                (pixel_values.shape[0], self.cfg.d_aux),
                dtype=v_h.dtype,
                device=v_h.device,
            )
        a_h = self.aux_proj(aux_summary)
        g = self.gate(torch.cat([v_h, a_h], dim=-1))
        fused = self.fuse_norm(v_h + g * a_h)

        v_logit = self.v_head(fused).squeeze(-1)
        s_logit = self.s_head(fused).squeeze(-1)
        n_logit = self.n_head(fused).squeeze(-1)
        return v_logit, s_logit, n_logit

    @torch.no_grad()
    def predict_scores(
        self,
        pixel_values: torch.Tensor,
        aux_summary: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        self.eval()
        v_logit, s_logit, n_logit = self.forward(pixel_values, aux_summary)
        return {
            "violence": torch.sigmoid(v_logit),
            "self_harm": torch.sigmoid(s_logit),
            "nsfw": torch.sigmoid(n_logit),
        }
