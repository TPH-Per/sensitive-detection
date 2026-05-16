"""
task_gated_attention.py — V6.0
================================
Two-Way Cross-Attention (SAM Decoder style) for task-isolated feature fusion.

Three INDEPENDENT gates:
  V_Gate: Q=V_token, K/V=[CLIP + Flow + YOLO + Gore]  → violence signal
  S_Gate: Q=S_token, K/V=[CLIP + Flow + Gore]          → self-harm signal
  N_Gate: Q=N_token, K/V=[CLIP + NSFW]                 → NSFW signal only

N_Gate does NOT see YOLO, Flow, or Gore — fixes the cross-contamination
bug from V5.2 shared feature pool.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class TwoWayCrossAttention(nn.Module):
    """
    Two-step cross-attention module (SAM Decoder style):

    Step 1 — Token queries Frame (token gets context from frames):
      Q = task_token  [B, 1, d_model]
      K = frame_pool  [B, T, pool_dim]  -- projected to d_model internally
      V = frame_pool  [B, T, pool_dim]
      → attn_weights [B, T]  (temporal saliency map)
      → token_updated [B, 1, d_model]

    Step 2 — Frame queries updated Token (frames learn which task they serve):
      Q = frame_pool_proj [B, T, d_model]
      K = token_updated   [B, 1, d_model]
      V = token_updated   [B, 1, d_model]
      → frame_updated [B, T, d_model]

    Args:
        d_model:   dimension of task tokens (already in this space)
        pool_dim:  raw dimension of frame pool (will be projected to d_model)
        num_heads: attention heads (d_model must be divisible by num_heads)
        dropout:   dropout rate
    """

    def __init__(
        self,
        d_model: int,
        pool_dim: int,
        num_heads: int = 8,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        assert d_model % num_heads == 0, \
            f"d_model={d_model} must be divisible by num_heads={num_heads}"

        # Project frame pool into d_model space
        self.pool_proj = nn.Linear(pool_dim, d_model)
        self.pool_norm = nn.LayerNorm(d_model)

        # Step 1: Token → Frame attention (with weights for saliency)
        self.token_norm1 = nn.LayerNorm(d_model)
        self.token_to_frame = nn.MultiheadAttention(
            embed_dim=d_model, num_heads=num_heads,
            dropout=dropout, batch_first=True,
        )
        self.token_norm2 = nn.LayerNorm(d_model)
        self.token_mlp = nn.Sequential(
            nn.Linear(d_model, d_model * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 2, d_model),
        )

        # Step 2: Frame → Token attention
        self.frame_norm = nn.LayerNorm(d_model)
        self.frame_to_token = nn.MultiheadAttention(
            embed_dim=d_model, num_heads=num_heads,
            dropout=dropout, batch_first=True,
        )
        self.frame_out_norm = nn.LayerNorm(d_model)

        self.drop = nn.Dropout(dropout)

    def forward(
        self,
        task_token: torch.Tensor,   # [B, 1, d_model]
        frame_pool: torch.Tensor,   # [B, T, pool_dim]
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Returns:
            token_updated  [B, 1, d_model]
            attn_weights   [B, T]          — temporal saliency (sums to 1)
            frame_updated  [B, T, d_model]
        """
        # Project frame pool
        frame_proj = self.pool_norm(self.pool_proj(frame_pool))  # [B, T, d_model]

        # ── Step 1: Token queries Frame ─────────────────────────────────────
        q = self.token_norm1(task_token)  # [B, 1, d_model]
        attn_out, attn_weights = self.token_to_frame(
            query=q,
            key=frame_proj,
            value=frame_proj,
            need_weights=True,
            average_attn_weights=True,   # average over heads → [B, 1, T]
        )
        token_updated = task_token + self.drop(attn_out)           # residual
        token_updated = token_updated + self.token_mlp(            # FFN
            self.token_norm2(token_updated)
        )

        saliency = attn_weights.squeeze(1)  # [B, T]

        # ── Step 2: Frame queries updated Token ─────────────────────────────
        q2 = self.frame_norm(frame_proj)    # [B, T, d_model]
        frame_attn_out, _ = self.frame_to_token(
            query=q2,
            key=token_updated,
            value=token_updated,
            need_weights=False,
        )
        frame_updated = self.frame_out_norm(frame_proj + self.drop(frame_attn_out))

        return token_updated, saliency, frame_updated


class TaskGatedAttentionV6(nn.Module):
    """
    Three independent TwoWayCrossAttention gates for V/S/N tasks.

    Feature routing (isolation by design):
      V_pool = [CLIP(768) | Flow(3) | YOLO_weapon(1) | Gore(1)] = 773-dim
      S_pool = [CLIP(768) | Flow(3) | Gore(1) | YOLO_medical(1)] = 773-dim  (V6.2+)
      S_pool = [CLIP(768) | Flow(3) | Gore(1)]                   = 772-dim  (legacy)
      N_pool = [CLIP(768) | NSFW(1)]                             = 769-dim

    N_Gate NEVER sees YOLO, Flow, or Gore signals.
    This eliminates the cross-contamination bug from V5.2.

    V6.2: S_pool optionally includes YOLO medical detections for self-harm.
      - yolo_medical_feat provided  -> S_pool = 773-dim (with yolo_medical)
      - yolo_medical_feat is None   -> S_pool = 772-dim (legacy fallback)

    Args:
        clip_dim:  CLIP feature dimension (default 768)
        d_model:   internal attention dimension for task tokens
        num_heads: attention heads
        dropout:   dropout rate
        s_use_yolo_medical: if True, S_pool includes YOLO medical channel
    """

    # Legacy pool dimensions (backward compat)
    _V_POOL_DIM = 768 + 3 + 1 + 1   # CLIP + Flow + YOLO_weapon + Gore = 773
    _S_POOL_DIM = 768 + 3 + 1       # CLIP + Flow + Gore                 = 772 (legacy)
    _N_POOL_DIM = 768 + 1           # CLIP + NSFW                        = 769

    def __init__(
        self,
        clip_dim: int = 768,
        d_model: int = 256,
        num_heads: int = 8,
        dropout: float = 0.1,
        modality_balance: bool = True,
        v_clip_scale: float = 0.35,
        s_clip_scale: float = 0.45,
        n_clip_scale: float = 0.65,
        s_use_yolo_medical: bool = False,
    ) -> None:
        super().__init__()

        v_pool = clip_dim + 3 + 1 + 1  # CLIP + Flow + YOLO_weapon + Gore
        s_pool = clip_dim + 3 + 1 + (1 if s_use_yolo_medical else 0)  # +YOLO_medical
        n_pool = clip_dim + 1          # CLIP + NSFW

        self.s_use_yolo_medical = s_use_yolo_medical

        # Three independent gates — NO shared weights
        self.V_gate = TwoWayCrossAttention(d_model, v_pool, num_heads, dropout)
        self.S_gate = TwoWayCrossAttention(d_model, s_pool, num_heads, dropout)
        self.N_gate = TwoWayCrossAttention(d_model, n_pool, num_heads, dropout)

        # Learnable task tokens — one per task
        self.v_token = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.s_token = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.n_token = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)

        # Quick-fix V7.0 (không thêm tham số học):
        # cân bằng năng lượng từng modality trước khi concat để tránh CLIP lấn át.
        self.modality_balance = modality_balance
        self.v_clip_scale = float(v_clip_scale)
        self.s_clip_scale = float(s_clip_scale)
        self.n_clip_scale = float(n_clip_scale)

    @staticmethod
    def _rms_unit(x: torch.Tensor, eps: float = 1e-6) -> torch.Tensor:
        # Chuẩn hóa RMS theo chiều feature của mỗi frame.
        denom = torch.sqrt(torch.mean(x * x, dim=-1, keepdim=True) + eps)
        return x / denom

    def forward(
        self,
        clip_feat: torch.Tensor,   # [B, T, 768]
        flow_feat: torch.Tensor,   # [B, T, 3]
        yolo_feat: torch.Tensor,   # [B, T, 1]  (weapon)
        gore_feat: torch.Tensor,   # [B, T, 1]
        nsfw_feat: torch.Tensor,   # [B, T, 1]
        yolo_medical_feat: torch.Tensor | None = None,  # [B, T, 1] (medical/self-harm)
    ) -> tuple[torch.Tensor, torch.Tensor,
               torch.Tensor, torch.Tensor,
               torch.Tensor, torch.Tensor]:
        """
        Returns:
            v_updated [B, 1, d_model], v_attn [B, T]
            s_updated [B, 1, d_model], s_attn [B, T]
            n_updated [B, 1, d_model], n_attn [B, T]
        """
        B = clip_feat.size(0)

        # Build task-specific pools (key isolation point)
        # Quick-fix: chuẩn hóa & scale nhóm feature để giảm shortcut từ CLIP.
        if self.modality_balance:
            clip_v = self._rms_unit(clip_feat) * self.v_clip_scale
            clip_s = self._rms_unit(clip_feat) * self.s_clip_scale
            clip_n = self._rms_unit(clip_feat) * self.n_clip_scale

            flow_b = self._rms_unit(flow_feat)
            yolo_b = self._rms_unit(yolo_feat)
            gore_b = self._rms_unit(gore_feat)
            nsfw_b = self._rms_unit(nsfw_feat)
            yolo_med_b = self._rms_unit(yolo_medical_feat) if yolo_medical_feat is not None else None
        else:
            clip_v, clip_s, clip_n = clip_feat, clip_feat, clip_feat
            flow_b, yolo_b, gore_b, nsfw_b = flow_feat, yolo_feat, gore_feat, nsfw_feat
            yolo_med_b = yolo_medical_feat

        V_pool = torch.cat([clip_v, flow_b, yolo_b, gore_b], dim=-1)  # [B, T, 773]
        # S_pool: include YOLO medical if available (V6.2+)
        if self.s_use_yolo_medical and yolo_med_b is not None:
            S_pool = torch.cat([clip_s, flow_b, gore_b, yolo_med_b], dim=-1)  # [B, T, 773]
        else:
            S_pool = torch.cat([clip_s, flow_b, gore_b], dim=-1)              # [B, T, 772] legacy
        N_pool = torch.cat([clip_n, nsfw_b], dim=-1)                          # [B, T, 769]

        # Expand task tokens to batch
        v_tok = self.v_token.expand(B, -1, -1)  # [B, 1, d_model]
        s_tok = self.s_token.expand(B, -1, -1)
        n_tok = self.n_token.expand(B, -1, -1)

        v_updated, v_attn, _ = self.V_gate(v_tok, V_pool)
        s_updated, s_attn, _ = self.S_gate(s_tok, S_pool)
        n_updated, n_attn, _ = self.N_gate(n_tok, N_pool)

        return v_updated, v_attn, s_updated, s_attn, n_updated, n_attn


# ─────────────────────────────────────────────────────────────────────────────
# Smoke test
# ─────────────────────────────────────────────────────────────────────────────

def run_smoke_test() -> None:
    print("\n" + "=" * 60)
    print("  TASK GATED ATTENTION V6 -- SMOKE TEST")
    print("=" * 60)

    B, T, d = 2, 64, 256
    gate = TaskGatedAttentionV6(clip_dim=768, d_model=d, num_heads=8)

    clip  = torch.randn(B, T, 768)
    flow  = torch.randn(B, T, 3)
    yolo  = torch.randn(B, T, 1)
    gore  = torch.randn(B, T, 1)
    nsfw  = torch.randn(B, T, 1)

    # Chuyển gate sang eval mode để tắt dropout (dropout làm thay đổi attention weights)
    gate.eval()

    with torch.no_grad():
        v_tok, v_attn, s_tok, s_attn, n_tok, n_attn = gate(
            clip, flow, yolo, gore, nsfw
        )


    # Test 1 — Output shapes
    print("\n[Test 1] Shape checks...")
    assert v_tok.shape  == (B, 1, d), f"v_tok: {v_tok.shape}"
    assert s_tok.shape  == (B, 1, d), f"s_tok: {s_tok.shape}"
    assert n_tok.shape  == (B, 1, d), f"n_tok: {n_tok.shape}"
    assert v_attn.shape == (B, T),    f"v_attn: {v_attn.shape}"
    assert s_attn.shape == (B, T),    f"s_attn: {s_attn.shape}"
    assert n_attn.shape == (B, T),    f"n_attn: {n_attn.shape}"
    print("  [OK] All output shapes correct")

    # Test 2 — Attention weights sum to 1 (softmax)
    print("\n[Test 2] Attention sum = 1...")
    assert torch.allclose(v_attn.sum(dim=-1), torch.ones(B), atol=1e-2), \
        f"v_attn sum: {v_attn.sum(dim=-1)}"
    assert torch.allclose(s_attn.sum(dim=-1), torch.ones(B), atol=1e-2), \
        f"s_attn sum: {s_attn.sum(dim=-1)}"
    assert torch.allclose(n_attn.sum(dim=-1), torch.ones(B), atol=1e-2), \
        f"n_attn sum: {n_attn.sum(dim=-1)}"
    print("  [OK] Attention weights sum to 1")

    # Test 3 — Isolation: N_gate must NOT be affected by YOLO
    print("\n[Test 3] N_Gate isolation (N must not see YOLO)...")
    gate.eval()
    with torch.no_grad():
        _, _, _, _, n_tok_ref,  _ = gate(clip, flow, yolo, gore, nsfw)
        yolo_alt = torch.randn(B, T, 1)
        _, _, _, _, n_tok_alt, _ = gate(clip, flow, yolo_alt, gore, nsfw)
    assert torch.allclose(n_tok_ref, n_tok_alt, atol=1e-6), \
        "N_Gate is affected by YOLO -- ISOLATION FAILURE!"
    print("  [OK] N_Gate is fully isolated from YOLO")

    # Test 4 — Gradient flow to all task tokens
    print("\n[Test 4] Gradient flow to task tokens...")
    gate.train()
    gate.zero_grad()
    v_tok2, _, s_tok2, _, n_tok2, _ = gate(clip, flow, yolo, gore, nsfw)
    loss = v_tok2.sum() + s_tok2.sum() + n_tok2.sum()
    loss.backward()
    assert gate.v_token.grad is not None, "v_token has no gradient"
    assert gate.s_token.grad is not None, "s_token has no gradient"
    assert gate.n_token.grad is not None, "n_token has no gradient"
    print("  [OK] All task token gradients flowing")

    # Test 5 — Isolation: S_gate must NOT be affected by YOLO or NSFW
    print("\n[Test 5] S_Gate isolation (S must not see NSFW)...")
    gate.eval()
    with torch.no_grad():
        _, _, s_tok_ref, _, _, _ = gate(clip, flow, yolo, gore, nsfw)
        nsfw_alt = torch.randn(B, T, 1)
        _, _, s_tok_alt, _, _, _ = gate(clip, flow, yolo, gore, nsfw_alt)
    assert torch.allclose(s_tok_ref, s_tok_alt, atol=1e-6), \
        "S_Gate is affected by NSFW -- ISOLATION FAILURE!"
    print("  [OK] S_Gate is fully isolated from NSFW")

    print("\n[PASS] ALL TASK GATED ATTENTION SMOKE TESTS PASSED")


if __name__ == '__main__':
    run_smoke_test()
