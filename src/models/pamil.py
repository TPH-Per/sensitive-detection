"""
pamil.py — UPS Pre-filtering + PAMIL α%/β% Pseudo-label Generation
===================================================================
From DA_DL_KPDL_V2: UPS uncertainty filtering + PAMIL percentile ranking.
"""
from __future__ import annotations

import torch


def ups_confident_mask(scores: torch.Tensor, uncertainty_threshold: float) -> torch.Tensor:
    """UPS: filter frames with high uncertainty (normalized Bernoulli entropy)."""
    probs = scores.clamp(min=1e-6, max=1.0 - 1e-6)
    entropy = -(probs * torch.log(probs) + (1.0 - probs) * torch.log(1.0 - probs))
    entropy = entropy / torch.log(torch.tensor(2.0, device=scores.device))
    return entropy <= uncertainty_threshold


def pamil_masks(
    scores: torch.Tensor,
    alpha: float,
    beta: float,
    valid_mask: torch.Tensor = None,
):
    """
    PAMIL α%/β% pseudo-label generation.
    Top-α% → positive, Bottom-β% → negative, middle → ignored.
    """
    bsz, total = scores.shape

    labels = torch.full_like(scores, -1.0)
    mask = torch.zeros_like(scores, dtype=torch.bool)

    for i in range(bsz):
        if valid_mask is None:
            candidate_idx = torch.arange(total, device=scores.device)
        else:
            candidate_idx = torch.where(valid_mask[i])[0]
        if candidate_idx.numel() == 0:
            continue

        candidate_scores = scores[i, candidate_idx]
        top_k = max(1, int(candidate_idx.numel() * alpha))
        bottom_k = max(1, int(candidate_idx.numel() * beta))

        order = torch.argsort(candidate_scores, descending=True)
        top_idx = candidate_idx[order[:top_k]]
        bot_idx = candidate_idx[order[-bottom_k:]]
        labels[i, top_idx] = 1.0
        labels[i, bot_idx] = 0.0
        mask[i, top_idx] = True
        mask[i, bot_idx] = True

    return labels, mask
