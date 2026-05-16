from __future__ import annotations

import torch
import torch.nn as nn

from src.models.gated_fusion import GatedMotionAuxFusion


class _CrossAttentionBlock(nn.Module):
    def __init__(self, d_model: int, n_heads: int, ff_dim: int, dropout: float) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.cross_attn = nn.MultiheadAttention(d_model, n_heads, dropout=dropout, batch_first=True)
        self.norm2 = nn.LayerNorm(d_model)
        self.mlp = nn.Sequential(
            nn.Linear(d_model, ff_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(ff_dim, d_model),
            nn.Dropout(dropout),
        )

    def forward(self, query_tokens: torch.Tensor, memory_tokens: torch.Tensor) -> torch.Tensor:
        attn_in = self.norm1(query_tokens)
        attn_out, _ = self.cross_attn(attn_in, memory_tokens, memory_tokens, need_weights=False)
        query_tokens = query_tokens + attn_out
        query_tokens = query_tokens + self.mlp(self.norm2(query_tokens))
        return query_tokens


class TaskPromptedTemporalModel(nn.Module):
    """Temporal model with task tokens, gated fusion, and cross-attention queries."""

    def __init__(
        self,
        input_dim: int = 768,
        aux_dim: int = 0,
        d_model: int = 768,
        n_heads: int = 8,
        n_layers: int = 4,
        ff_dim: int = 2048,
        dropout: float = 0.1,
        max_frames: int = 64,
        qformer_layers: int = 2,
    ) -> None:
        super().__init__()
        self.max_frames = max_frames
        self.aux_dim = aux_dim
        self.motion_dim = min(3, aux_dim) if aux_dim > 0 else 0
        self.semantic_aux_dim = max(aux_dim - self.motion_dim, 0)
        self.fusion = GatedMotionAuxFusion(
            clip_dim=input_dim,
            motion_dim=self.motion_dim,
            aux_dim=self.semantic_aux_dim,
            d_model=d_model,
            dropout=dropout,
        )
        self.frame_pos_embed = nn.Parameter(torch.randn(1, max_frames, d_model) * 0.02)
        self.task_tokens = nn.Parameter(torch.randn(1, 3, d_model) * 0.02)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=ff_dim,
            dropout=dropout,
            activation='gelu',
            batch_first=True,
        )
        self.frame_encoder = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        self.cross_blocks = nn.ModuleList(
            [_CrossAttentionBlock(d_model=d_model, n_heads=n_heads, ff_dim=ff_dim, dropout=dropout) for _ in range(qformer_layers)]
        )
        self.task_norm = nn.LayerNorm(d_model)

        self.v_head = nn.Linear(d_model, 1)
        self.s_head = nn.Linear(d_model, 1)
        self.n_head = nn.Linear(d_model, 1)

    def _align_inputs(self, x: torch.Tensor, aux: torch.Tensor | None) -> tuple[torch.Tensor, torch.Tensor | None]:
        if x.ndim == 2:
            x = x.unsqueeze(1)

        if x.shape[1] > self.max_frames:
            x = x[:, : self.max_frames, :]
        if aux is not None:
            if aux.ndim == 2:
                aux = aux.unsqueeze(1)
            if aux.shape[1] > self.max_frames:
                aux = aux[:, : self.max_frames, :]
            if aux.shape[1] < x.shape[1]:
                pad = x.new_zeros((aux.shape[0], x.shape[1] - aux.shape[1], aux.shape[2]))
                aux = torch.cat([aux, pad], dim=1)
            elif aux.shape[1] > x.shape[1]:
                aux = aux[:, : x.shape[1], :]
            expected_aux_dim = self.motion_dim + self.semantic_aux_dim
            if expected_aux_dim > 0 and aux.shape[2] != expected_aux_dim:
                if aux.shape[2] < expected_aux_dim:
                    pad = x.new_zeros((aux.shape[0], aux.shape[1], expected_aux_dim - aux.shape[2]))
                    aux = torch.cat([aux, pad], dim=2)
                else:
                    aux = aux[:, :, :expected_aux_dim]
        return x, aux

    def forward(self, x: torch.Tensor, aux: torch.Tensor | None = None) -> torch.Tensor:
        x, aux = self._align_inputs(x, aux)
        bsz, t, _ = x.shape

        motion_aux = None
        semantic_aux = None
        if aux is not None and self.aux_dim > 0:
            if self.motion_dim > 0:
                motion_aux = aux[:, :, : self.motion_dim]
            if self.semantic_aux_dim > 0:
                semantic_aux = aux[:, :, self.motion_dim : self.motion_dim + self.semantic_aux_dim]

        frame_tokens = self.fusion(x, motion_x=motion_aux, aux_x=semantic_aux)
        frame_tokens = frame_tokens + self.frame_pos_embed[:, :t, :]
        frame_tokens = self.frame_encoder(frame_tokens)

        task_tokens = self.task_tokens.expand(bsz, -1, -1)
        for block in self.cross_blocks:
            task_tokens = block(task_tokens, frame_tokens)
        task_tokens = self.task_norm(task_tokens)

        logits = torch.cat(
            [
                self.v_head(task_tokens[:, 0, :]),
                self.s_head(task_tokens[:, 1, :]),
                self.n_head(task_tokens[:, 2, :]),
            ],
            dim=1,
        )
        return logits
