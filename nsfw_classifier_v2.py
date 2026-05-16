"""
nsfw_classifier_v2.py — Binary NSFW Classification (2-class)
==============================================================
Uses AdamCodd/vit-base-nsfw-detector which outputs {sfw, nsfw} scores.
Threshold-based classification with context-aware logic.

After fine-tuning, the model better distinguishes swimwear/athletic wear
from actual NSFW content.
"""
from __future__ import annotations

from PIL import Image

# Default thresholds for binary sfw/nsfw model
DEFAULT_THRESHOLDS = {
    "ban":   0.80,   # nsfw score above this → BAN (high confidence explicit)
    "blur":  0.55,   # nsfw score above this → BLUR (moderate nsfw signal)
    "review": 0.35,  # nsfw score above this → REVIEW (low signal, log only)
    # below review → SAFE
}


def classify_nsfw_v2(image: Image.Image, nsfw_pipe, thresholds: dict = None) -> dict:
    """
    Run binary NSFW classifier and return structured verdict.

    Args:
        image: PIL Image
        nsfw_pipe: HuggingFace image-classification pipeline
        thresholds: optional override for DEFAULT_THRESHOLDS

    Returns:
        {
            "action":   "ban" | "blur" | "review" | "safe",
            "reason":   str,
            "scores":   {label: score},
            "nsfw_score": float,
            "sfw_score": float,
        }
    """
    if thresholds is None:
        thresholds = DEFAULT_THRESHOLDS

    raw = nsfw_pipe(image)
    scores = {item["label"].lower(): item["score"] for item in raw}

    nsfw_score = scores.get("nsfw", 0.0)
    sfw_score = scores.get("sfw", scores.get("normal", 0.0))

    # Decision logic (priority order — most severe first)
    if nsfw_score >= thresholds["ban"]:
        action = "ban"
        reason = f"NSFW content detected (score={nsfw_score:.3f})"

    elif nsfw_score >= thresholds["blur"]:
        action = "blur"
        reason = f"Moderate NSFW signal (score={nsfw_score:.3f})"

    elif nsfw_score >= thresholds["review"]:
        action = "review"
        reason = f"Low NSFW signal (score={nsfw_score:.3f}) — flagged for review"

    else:
        action = "safe"
        reason = f"Safe (nsfw={nsfw_score:.3f})"

    return {
        "action": action,
        "reason": reason,
        "scores": scores,
        "nsfw_score": nsfw_score,
        "sfw_score": sfw_score,
    }
