"""
task_gated_model.py — V6.1 (S Token Teacher Replacement)
=========================================================
V6.0 -> V6.1 THAY DOI:
  - S_pool: gore_feat -> selfharm_feat (SelfHarmDetector teacher moi)
  - forward(): them tham so selfharm_feat tuy chon [B,T,1]
  - S_score = sum(s_attn x selfharm_feat) thay vi gore_feat
  - Gore van trong V_pool (ho tro bao luc), chi bo khoi S_pool
  - Feature dim: 774 -> 775 (them selfharm channel)
  - Tuong thich nguoc: selfharm_feat=None -> fallback gore_feat (V6.0)
"""
from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F

import sys
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.models.task_gated_attention import TaskGatedAttentionV6


class PositionalEncoding(nn.Module):
    """Standard 1D Sinusoidal Positional Encoding"""

    def __init__(self, d_model: int, max_len: int = 5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe.unsqueeze(0))  # [1, max_len, d_model]

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: [B, T, d_model]"""
        return x + self.pe[:, :x.size(1), :]


class TaskGatedModelV6(nn.Module):
    """
    Task-Gated Two-Way Cross-Attention Model for Video Moderation V6.0.

    Kiến trúc:
      - V_Gate: có FFN_cls → v_logit  (supervised với Violence label)
      - S_Gate: không FFN  → S_score = sum(s_attn × gore_feat)  (Weak Supervision)
      - N_Gate: không FFN  → N_score = sum(n_attn × nsfw_feat)  (Weak Supervision)

    S/N được học qua KL Distillation:
      L_dist = KL(s_attn || softmax(gore_scores / T))
      → S_Gate học "nhìn vào đúng frame" từ GoreDetector teacher
    """

    def __init__(
        self,
        clip_dim: int = 768,
        d_model: int = 256,
        max_frames: int = 64,
        dropout: float = 0.2,
        sn_pooling: str = "topk_noisy_or",
        sn_topk_ratio: float = 0.2,
        sn_topk_min: int = 3,
        modality_balance: bool = True,
        v_clip_scale: float = 0.35,
        s_clip_scale: float = 0.45,
        n_clip_scale: float = 0.65,
        s_use_yolo_medical: bool = False,
    ) -> None:
        super().__init__()

        self.pos_encoder = PositionalEncoding(d_model=clip_dim, max_len=max_frames)
        self.dropout = nn.Dropout(dropout)

        self.sn_pooling = sn_pooling
        self.sn_topk_ratio = float(sn_topk_ratio)
        self.sn_topk_min = int(sn_topk_min)

        self.attention_gate = TaskGatedAttentionV6(
            clip_dim=clip_dim,
            d_model=d_model,
            num_heads=8,
            dropout=dropout,
            modality_balance=modality_balance,
            v_clip_scale=v_clip_scale,
            s_clip_scale=s_clip_scale,
            n_clip_scale=n_clip_scale,
            s_use_yolo_medical=s_use_yolo_medical,
        )

        # CHỈ V_Gate có FFN Classification Head
        # S/N score tính bằng attention-weighted aggregation (không cần FFN)
        self.ffn_v = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
        )
        # ffn_s và ffn_n đã bị XÓA — không có video-level label

    @staticmethod
    def _weighted_mean_score(attn: torch.Tensor, probs: torch.Tensor) -> torch.Tensor:
        # Legacy V6 pooling (dễ bị pha loãng khi event ngắn).
        return (attn * probs).sum(dim=-1)

    def _topk_noisy_or_score(self, attn: torch.Tensor, probs: torch.Tensor) -> torch.Tensor:
        """
        Event-based pooling cho moderation:
        - Giữ event ngắn, không bị pha loãng theo 64 frame.
        - Dùng attn như hệ số ưu tiên mềm, nhưng vẫn cho phép expert peak chi phối.
        """
        eps = 1e-6
        probs = probs.clamp(0.0, 1.0)

        # Chuẩn hóa attention để lấy profile tương đối [0,1]
        attn = torch.clamp(attn, min=eps)
        attn = attn / attn.sum(dim=-1, keepdim=True).clamp_min(eps)
        attn_peak = attn / attn.max(dim=-1, keepdim=True).values.clamp_min(eps)

        # Giữ ảnh hưởng của expert mạnh hơn attn để tránh "flat-attn dilution".
        gated = probs * (0.5 + 0.5 * attn_peak)

        T = gated.shape[-1]
        k = max(self.sn_topk_min, int(math.ceil(T * self.sn_topk_ratio)))
        k = min(k, T)
        topk_vals = torch.topk(gated, k=k, dim=-1).values

        # noisy-or: xác suất "ít nhất 1 frame vi phạm"
        return 1.0 - torch.prod(1.0 - topk_vals + eps, dim=-1)

    def forward(
        self,
        clip_feat:     torch.Tensor,       # [B, T, 768]
        flow_feat:     torch.Tensor,       # [B, T, 3]
        yolo_feat:     torch.Tensor,       # [B, T, 1] (weapon)
        gore_feat:     torch.Tensor,       # [B, T, 1] — GoreDetector (V_pool)
        nsfw_feat:     torch.Tensor,       # [B, T, 1] — NSFWClassifier
        selfharm_feat: torch.Tensor | None = None,  # [B, T, 1] — V6.1 S_pool teacher
        yolo_medical_feat: torch.Tensor | None = None,  # [B, T, 1] — V6.2 YOLO medical for S_pool
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, dict]:
        """
        V6.1: selfharm_feat dung trong S_pool thay vi gore_feat.
        V6.2: yolo_medical_feat optional added to S_pool for self-harm object detection.
        Neu selfharm_feat=None: fallback ve gore_feat (tuong thich V6.0).
        """
        # S_pool teacher: SelfHarmDetector (V6.1) or fallback Gore (V6.0)
        s_teacher = selfharm_feat if selfharm_feat is not None else gore_feat

        clip_pe = self.pos_encoder(clip_feat)
        clip_pe = self.dropout(clip_pe)

        v_tok, v_attn, s_tok, s_attn, n_tok, n_attn = self.attention_gate(
            clip_pe, flow_feat, yolo_feat, gore_feat, nsfw_feat, yolo_medical_feat
        )

        # V_Gate: FFN -> logit
        v_logit = self.ffn_v(v_tok.squeeze(1))  # [B, 1]

        s_probs = s_teacher.squeeze(-1)
        n_probs = nsfw_feat.squeeze(-1)

        if self.sn_pooling == "weighted_mean":
            S_score = self._weighted_mean_score(s_attn, s_probs)
            N_score = self._weighted_mean_score(n_attn, n_probs)
        elif self.sn_pooling == "topk_noisy_or":
            S_score = self._topk_noisy_or_score(s_attn, s_probs)
            N_score = self._topk_noisy_or_score(n_attn, n_probs)
        else:
            raise ValueError(
                f"Unknown sn_pooling='{self.sn_pooling}'. "
                f"Supported: weighted_mean, topk_noisy_or"
            )

        saliency = {"violence": v_attn, "self_harm": s_attn, "nsfw": n_attn}
        return v_logit, S_score, N_score, saliency

    @torch.no_grad()
    def predict(
        self,
        clip_feat:     torch.Tensor,
        flow_feat:     torch.Tensor,
        yolo_feat:     torch.Tensor,
        gore_feat:     torch.Tensor,
        nsfw_feat:     torch.Tensor,
        selfharm_feat: torch.Tensor | None = None,
        thresh_v: float = 0.5,
        thresh_s: float = 0.3,
        thresh_n: float = 0.5,
    ) -> dict:
        """Inference helper. selfharm_feat=None -> fallback V6.0 mode."""
        self.eval()
        v_logit, S_score, N_score, saliency = self.forward(
            clip_feat, flow_feat, yolo_feat, gore_feat, nsfw_feat, selfharm_feat
        )
        v_prob = torch.sigmoid(v_logit).squeeze(-1)
        return {
            "violence_prob":  v_prob,
            "selfharm_score": S_score,
            "nsfw_score":     N_score,
            "violence_flag":  (v_prob >= thresh_v),
            "selfharm_flag":  (S_score >= thresh_s),
            "nsfw_flag":      (N_score >= thresh_n),
            "saliency":       saliency,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Smoke test
# ─────────────────────────────────────────────────────────────────────────────

def run_smoke_test() -> None:
    print("\n" + "=" * 60)
    print("  TASK GATED MODEL V6 -- SMOKE TEST (Architecture Overhaul)")
    print("=" * 60)

    model = TaskGatedModelV6()
    B, T = 2, 64

    clip = torch.randn(B, T, 768)
    flow = torch.randn(B, T, 3)
    yolo = torch.rand(B, T, 1)     # [0,1]
    gore = torch.rand(B, T, 1)     # [0,1] — GoreDetector proba
    nsfw = torch.rand(B, T, 1)     # [0,1] — NSFWClassifier proba

    print("\n[Test 1] Output shapes...")
    model.eval()
    with torch.no_grad():
        v_logit, S_score, N_score, saliency = model(clip, flow, yolo, gore, nsfw)

    assert v_logit.shape == (B, 1),  f"v_logit shape: {v_logit.shape}"
    assert S_score.shape == (B,),    f"S_score shape: {S_score.shape}"
    assert N_score.shape == (B,),    f"N_score shape: {N_score.shape}"
    assert saliency["violence"].shape  == (B, T)
    assert saliency["self_harm"].shape == (B, T)
    assert saliency["nsfw"].shape      == (B, T)
    print("  [OK] v_logit [B,1], S_score [B,], N_score [B,]")

    print("\n[Test 2] S/N score must have variance (not all zeros)...")
    assert S_score.std().item() > 1e-4, f"S_score has no variance: {S_score}"
    assert N_score.std().item() > 1e-4, f"N_score has no variance: {N_score}"
    print(f"  [OK] S_score std={S_score.std():.4f}, N_score std={N_score.std():.4f}")

    print("\n[Test 3] N_Gate isolation — changing YOLO must NOT change N_score...")
    model.eval()
    with torch.no_grad():
        _, _, N1, _ = model(clip, flow, yolo, gore, nsfw)
        yolo_new = torch.rand(B, T, 1) * 10  # YOLO tăng 10x
        _, _, N2, _ = model(clip, flow, yolo_new, gore, nsfw)
    diff = (N1 - N2).abs().max().item()
    assert diff < 1e-4, f"N_Gate bị ảnh huong boi YOLO! diff={diff:.6f}"
    print(f"  [OK] N_Gate isolation verified (max diff={diff:.6f})")

    print("\n[Test 4] KL Distillation loss computation...")
    model.train()
    v_logit, S_score, N_score, saliency = model(clip, flow, yolo, gore, nsfw)

    # Simulate KL Distillation
    T_dist = 2.0
    gore_soft = F.softmax(gore.squeeze(-1) / T_dist, dim=1).detach()
    nsfw_soft = F.softmax(nsfw.squeeze(-1) / T_dist, dim=1).detach()

    v_label = torch.zeros(B, 1)
    L_bce_V = F.binary_cross_entropy_with_logits(
        v_logit, v_label, pos_weight=torch.tensor([44.0])
    )
    L_dist_S = F.kl_div(saliency["self_harm"].log(), gore_soft, reduction='batchmean')
    L_dist_N = F.kl_div(saliency["nsfw"].log(),      nsfw_soft, reduction='batchmean')

    L_total = L_bce_V + 0.5 * (L_dist_S + L_dist_N)
    L_total.backward()

    assert model.attention_gate.v_token.grad is not None, "v_token grad is None"
    assert model.attention_gate.s_token.grad is not None, "s_token grad is None"
    assert model.attention_gate.n_token.grad is not None, "n_token grad is None"
    assert model.ffn_v[0].weight.grad is not None, "ffn_v grad is None"
    print(f"  [OK] Backward OK — L_bce_V={L_bce_V:.4f} L_dist_S={L_dist_S:.4f} L_dist_N={L_dist_N:.4f}")

    print("\n[Test 5] ffn_s and ffn_n must NOT exist...")
    assert not hasattr(model, 'ffn_s'), "ffn_s should have been removed!"
    assert not hasattr(model, 'ffn_n'), "ffn_n should have been removed!"
    print("  [OK] ffn_s and ffn_n removed")

    print("\n[PASS] ALL TASK GATED MODEL V6 SMOKE TESTS PASSED")


if __name__ == '__main__':
    run_smoke_test()
