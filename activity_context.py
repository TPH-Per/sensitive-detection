"""
activity_context.py — CLIP Zero-Shot Activity Context Classifier
=================================================================
Classifies whether peak violence frames show sports/athletic activity
or actual violence. Uses CLIP zero-shot to compare frame similarity
against sports vs violence text prompts.

This prevents sports videos (volleyball, basketball, etc.) from being
falsely flagged as violence.
"""
from __future__ import annotations

from typing import List

import numpy as np
import torch
from PIL import Image

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

SPORTS_CONTEXT_PROMPTS = [
    "athletes playing volleyball on a court",
    "players competing in a sports game",
    "people exercising or playing sport",
    "athletes jumping or diving in a game",
    "sports competition with ball",
    "professional athletes in a match",
    "basketball players jumping for the ball",
    "soccer players kicking a ball",
    "swimmers racing in a pool",
    "tennis player hitting a ball",
    "athletes running on a track",
    "people doing gymnastics",
    "martial arts tournament match",
    "boxing match in a ring",
]

VIOLENCE_CONTEXT_PROMPTS = [
    "people fighting or attacking each other",
    "a physical assault or brawl",
    "someone being hit or punched in a fight",
    "a violent confrontation between people",
    "aggressive fighting or combat",
    "gang fight or street brawl",
    "person being attacked on the street",
    "domestic violence assault",
    "someone pulling a weapon on another person",
]


class ActivityContextClassifier:
    """CLIP zero-shot classifier for sports vs violence context."""

    def __init__(self):
        from transformers import CLIPModel, CLIPProcessor
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(DEVICE)
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        self.model.eval()

        # Pre-encode text prompts
        self._encode_prompts()

    @torch.no_grad()
    def _encode_prompts(self):
        """Pre-encode all text prompts at startup."""
        sports_inputs = self.processor(
            text=SPORTS_CONTEXT_PROMPTS, return_tensors="pt", padding=True
        ).to(DEVICE)
        violence_inputs = self.processor(
            text=VIOLENCE_CONTEXT_PROMPTS, return_tensors="pt", padding=True
        ).to(DEVICE)

        sports_out = self.model.get_text_features(**sports_inputs)
        self.sports_feat = sports_out.pooler_output if hasattr(sports_out, 'pooler_output') else sports_out
        self.sports_feat = self.sports_feat / self.sports_feat.norm(dim=-1, keepdim=True)

        violence_out = self.model.get_text_features(**violence_inputs)
        self.violence_feat = violence_out.pooler_output if hasattr(violence_out, 'pooler_output') else violence_out
        self.violence_feat = self.violence_feat / self.violence_feat.norm(dim=-1, keepdim=True)

    @torch.no_grad()
    def classify(self, peak_frames: List[Image.Image]) -> dict:
        """
        Classify whether peak violence frames show sports or violence.

        Args:
            peak_frames: list of PIL Images (top-K frames by violence score)

        Returns:
            {
                "is_sports": bool,
                "sports_confidence": float,
                "violence_confidence": float,
                "sports_probability": float,
                "suppress_factor": float,  # multiply violence score by this
            }
        """
        if not peak_frames:
            return {
                "is_sports": False,
                "sports_confidence": 0.0,
                "violence_confidence": 0.0,
                "sports_probability": 0.0,
                "suppress_factor": 1.0,
            }

        sports_sims, violence_sims = [], []

        for frame in peak_frames:
            inputs = self.processor(images=frame, return_tensors="pt").to(DEVICE)
            img_out = self.model.get_image_features(**inputs)
            img_feat = img_out.pooler_output if hasattr(img_out, 'pooler_output') else img_out
            img_feat = img_feat / img_feat.norm(dim=-1, keepdim=True)

            s_sim = (img_feat @ self.sports_feat.T).max().item()
            v_sim = (img_feat @ self.violence_feat.T).max().item()
            sports_sims.append(s_sim)
            violence_sims.append(v_sim)

        sports_conf = float(np.mean(sports_sims))
        violence_conf = float(np.mean(violence_sims))

        # Softmax to get probability (temperature=20 for sharper separation)
        exp_s = np.exp(sports_conf * 20)
        exp_v = np.exp(violence_conf * 20)
        p_sports = exp_s / (exp_s + exp_v)

        is_sports = p_sports > 0.55

        # Suppress factor: smoothly reduce violence score based on sports confidence
        if is_sports:
            suppress_factor = max(0.15, 1.0 - p_sports)
        else:
            suppress_factor = 1.0

        return {
            "is_sports": is_sports,
            "sports_confidence": sports_conf,
            "violence_confidence": violence_conf,
            "sports_probability": p_sports,
            "suppress_factor": suppress_factor,
        }


# Singleton instance
_classifier = None


def get_activity_classifier() -> ActivityContextClassifier:
    """Get or create the singleton classifier."""
    global _classifier
    if _classifier is None:
        print("  [CLIP] Loading activity context classifier...")
        _classifier = ActivityContextClassifier()
        print("  [CLIP] Activity context classifier loaded.")
    return _classifier
