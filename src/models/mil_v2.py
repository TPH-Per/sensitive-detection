"""
mil_v2.py — V2 MHCM-MIL Model Architecture (from DA_DL_KPDL_V2)
=================================================================
Multi-task MIL model with independent LoRA adapters for Violence/NSFW,
Auxiliary-Gated Frame Weighting, and Gated Attention MIL pooling.
"""
from __future__ import annotations

import torch
from torch import nn


class LoRAAdapter(nn.Module):
    """Independent LoRA adapter: y = x + scale * B(A(dropout(x)))"""

    def __init__(self, dim: int, rank: int, alpha: int, dropout: float) -> None:
        super().__init__()
        self.rank = rank
        self.scale = alpha / max(1, rank)
        self.dropout = nn.Dropout(dropout)
        self.a = nn.Linear(dim, rank, bias=False)
        self.b = nn.Linear(rank, dim, bias=False)
        nn.init.zeros_(self.b.weight)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.scale * self.b(self.a(self.dropout(x)))


class AuxiliaryGate(nn.Module):
    """Auxiliary-Gated Frame Weighting: gate = sigmoid(sum(beta_j * aux_j))"""

    def __init__(self, num_aux: int) -> None:
        super().__init__()
        self.beta = nn.Parameter(torch.zeros(num_aux))

    def forward(self, features: torch.Tensor, aux: torch.Tensor) -> torch.Tensor:
        # features: [B,T,D], aux: [B,T,K]
        gate = torch.sigmoid((aux * self.beta).sum(dim=-1, keepdim=True))
        return features * gate


class GatedAttentionMIL(nn.Module):
    """Gated Attention MIL pooling (Ilse et al.)"""

    def __init__(self, dim: int, attn_dim: int) -> None:
        super().__init__()
        self.attn_v = nn.Linear(dim, attn_dim)
        self.attn_u = nn.Linear(dim, attn_dim)
        self.attn_w = nn.Linear(attn_dim, 1)

    def forward(self, x: torch.Tensor):
        # x: [B,T,D]
        v = torch.tanh(self.attn_v(x))
        u = torch.sigmoid(self.attn_u(x))
        a = v * u
        w = torch.softmax(self.attn_w(a), dim=1)
        bag = (w * x).sum(dim=1)
        return bag, w


class MILHead(nn.Module):
    """Single task head: LoRA -> AuxGate -> GatedAttnMIL -> classifier"""

    def __init__(
        self,
        dim: int,
        attn_dim: int,
        lora_rank: int,
        lora_alpha: int,
        lora_dropout: float,
        num_aux: int,
        use_instance: bool,
    ) -> None:
        super().__init__()
        self.lora = LoRAAdapter(dim, lora_rank, lora_alpha, lora_dropout)
        self.gate = AuxiliaryGate(num_aux)
        self.mil = GatedAttentionMIL(dim, attn_dim)
        self.classifier = nn.Linear(dim, 1)
        self.use_instance = use_instance
        if use_instance:
            self.instance_head = nn.Linear(dim, 1)
        else:
            self.instance_head = None

    def forward(self, features: torch.Tensor, aux: torch.Tensor):
        x = self.lora(features)
        x = self.gate(x, aux)
        bag, attn = self.mil(x)
        bag_logit = self.classifier(bag).squeeze(-1)
        inst_logits = None
        if self.instance_head is not None:
            inst_logits = self.instance_head(x).squeeze(-1)
        return bag_logit, attn, inst_logits


class MultiTaskMILModel(nn.Module):
    """
    Multi-task MIL model with 2 independent heads:
    - V-head: Violence (uses gore + nsfw aux, no instance head)
    - N-head: NSFW (uses nsfw aux only, has instance head for PAMIL)
    """

    def __init__(
        self,
        dim: int,
        attn_dim: int,
        lora_rank: int,
        lora_alpha: int,
        lora_dropout: float,
    ) -> None:
        super().__init__()
        # Aux order: [gore, nsfw]
        self.v_head = MILHead(
            dim, attn_dim, lora_rank, lora_alpha, lora_dropout,
            num_aux=2,  # gore + nsfw
            use_instance=False,
        )
        self.n_head = MILHead(
            dim, attn_dim, lora_rank, lora_alpha, lora_dropout,
            num_aux=1,  # nsfw only
            use_instance=True,
        )

    def forward(self, features: torch.Tensor, aux: torch.Tensor):
        # aux: [B,T,2] -> [gore, nsfw]
        v_aux = aux
        n_aux = aux[:, :, 1:2]
        v_logit, v_attn, _ = self.v_head(features, v_aux)
        n_logit, n_attn, n_inst = self.n_head(features, n_aux)
        return {
            "v_logit": v_logit,
            "v_attn": v_attn,
            "n_logit": n_logit,
            "n_attn": n_attn,
            "n_inst_logits": n_inst,
        }
