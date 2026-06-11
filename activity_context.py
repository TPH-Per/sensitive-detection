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

ANIME_CONTEXT_PROMPTS = [
    "anime character with big eyes and colorful hair",
    "Japanese anime cartoon scene",
    "manga style illustration with cel shading",
    "animated anime girl or boy character",
    "anime fight scene with special effects",
    "2D anime drawing or digital art",
    "cartoon anime character in Japanese style",
    "anime screenshot from a TV show or movie",
    "chibi or kawaii anime character",
    "anime art with vibrant colors and outlines",
]

# ─── Gore prompts: extreme violence, blood, weapons → BAN ─────────
GORE_PROMPTS = [
    "a person bleeding heavily from graphic injuries",
    "a victim of a brutal stabbing or shooting with blood",
    "graphic gore with dismemberment or severe wounds",
    "a violent crime scene with blood splatter",
    "someone being attacked with a weapon causing blood",
    "a severely beaten person with visible bloody injuries",
]

# ─── Brawl prompts: physical fight, street violence → BLUR ───────
BRAWL_PROMPTS = [
    "people in a physical street fight or brawl",
    "a person punching and kicking another person in a fight",
    "a violent confrontation with people hitting each other",
    "a group of people fighting aggressively on the street",
    "someone being beaten in a real physical altercation",
    "a domestic violence assault with physical force",
]


# ─── Human prompts: detect if real humans are present ─────────
HUMAN_PROMPTS = [
    "a photograph of a real person",
    "human beings in the scene",
    "a realistic person or people",
    "real human body or face",
]

NON_HUMAN_PROMPTS = [
    "a photo of a document, paper, or text",
    "a simple drawing of a stick figure",
    "a computer generated abstract image",
    "a photo of a blank wall or empty scenery",
    "an image of an inanimate object",
    "text on a screen or paper",
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

        anime_inputs = self.processor(
            text=ANIME_CONTEXT_PROMPTS, return_tensors="pt", padding=True
        ).to(DEVICE)
        anime_out = self.model.get_text_features(**anime_inputs)
        self.anime_feat = anime_out.pooler_output if hasattr(anime_out, 'pooler_output') else anime_out
        self.anime_feat = self.anime_feat / self.anime_feat.norm(dim=-1, keepdim=True)

        # Gore prompts: extreme violence, blood, weapons → BAN
        gore_inputs = self.processor(
            text=GORE_PROMPTS, return_tensors="pt", padding=True
        ).to(DEVICE)
        gore_out = self.model.get_text_features(**gore_inputs)
        self.gore_feat = gore_out.pooler_output if hasattr(gore_out, 'pooler_output') else gore_out
        self.gore_feat = self.gore_feat / self.gore_feat.norm(dim=-1, keepdim=True)

        # Brawl prompts: physical fight, street violence → BLUR
        brawl_inputs = self.processor(
            text=BRAWL_PROMPTS, return_tensors="pt", padding=True
        ).to(DEVICE)
        brawl_out = self.model.get_text_features(**brawl_inputs)
        self.brawl_feat = brawl_out.pooler_output if hasattr(brawl_out, 'pooler_output') else brawl_out
        self.brawl_feat = self.brawl_feat / self.brawl_feat.norm(dim=-1, keepdim=True)

        # Human vs Non-human prompts
        human_inputs = self.processor(
            text=HUMAN_PROMPTS, return_tensors="pt", padding=True
        ).to(DEVICE)
        human_out = self.model.get_text_features(**human_inputs)
        self.human_feat = human_out.pooler_output if hasattr(human_out, 'pooler_output') else human_out
        self.human_feat = self.human_feat / self.human_feat.norm(dim=-1, keepdim=True)

        non_human_inputs = self.processor(
            text=NON_HUMAN_PROMPTS, return_tensors="pt", padding=True
        ).to(DEVICE)
        non_human_out = self.model.get_text_features(**non_human_inputs)
        self.non_human_feat = non_human_out.pooler_output if hasattr(non_human_out, 'pooler_output') else non_human_out
        self.non_human_feat = self.non_human_feat / self.non_human_feat.norm(dim=-1, keepdim=True)

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
                "is_anime": bool,
                "anime_confidence": float,
                "anime_probability": float,
                "has_human": bool,
                "human_probability": float,
            }
        """
        if not peak_frames:
            return {
                "is_sports": False,
                "sports_confidence": 0.0,
                "violence_confidence": 0.0,
                "sports_probability": 0.0,
                "suppress_factor": 1.0,
                "is_anime": False,
                "anime_confidence": 0.0,
                "anime_probability": 0.0,
                "has_human": True, # Default to True to be safe
                "human_probability": 1.0,
            }

        sports_sims, violence_sims, anime_sims = [], [], []
        human_sims, non_human_sims = [], []

        for frame in peak_frames:
            inputs = self.processor(images=frame, return_tensors="pt").to(DEVICE)
            img_out = self.model.get_image_features(**inputs)
            img_feat = img_out.pooler_output if hasattr(img_out, 'pooler_output') else img_out
            img_feat = img_feat / img_feat.norm(dim=-1, keepdim=True)

            s_sim = (img_feat @ self.sports_feat.T).max().item()
            v_sim = (img_feat @ self.violence_feat.T).max().item()
            a_sim = (img_feat @ self.anime_feat.T).max().item()
            h_sim = (img_feat @ self.human_feat.T).max().item()
            nh_sim = (img_feat @ self.non_human_feat.T).max().item()

            sports_sims.append(s_sim)
            violence_sims.append(v_sim)
            anime_sims.append(a_sim)
            human_sims.append(h_sim)
            non_human_sims.append(nh_sim)

        sports_conf = float(np.mean(sports_sims))
        violence_conf = float(np.mean(violence_sims))
        anime_conf = float(np.mean(anime_sims))
        human_conf = float(np.mean(human_sims))
        non_human_conf = float(np.mean(non_human_sims))

        # Softmax to get probability (temperature=20 for sharper separation)
        exp_s = np.exp(sports_conf * 20)
        exp_v = np.exp(violence_conf * 20)
        p_sports = exp_s / (exp_s + exp_v)

        # Anime probability: compare anime vs real-life (sports + violence average)
        real_life_conf = (sports_conf + violence_conf) / 2.0
        exp_a = np.exp(anime_conf * 20)
        exp_r = np.exp(real_life_conf * 20)
        p_anime = exp_a / (exp_a + exp_r)

        # Human probability
        exp_h = np.exp(human_conf * 20)
        exp_nh = np.exp(non_human_conf * 20)
        p_human = exp_h / (exp_h + exp_nh)

        is_sports = p_sports > 0.55
        is_anime = p_anime > 0.55
        has_human = p_human > 0.40 # Lean slightly towards true if uncertain

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
            "is_anime": is_anime,
            "anime_confidence": anime_conf,
            "anime_probability": p_anime,
        }

    @torch.no_grad()
    def classify_violence_subtype(self, peak_frames: List[Image.Image]) -> dict:
        """
        Classify violence into gore (ban) vs brawl (blur) using CLIP.

        Only called when ViT already flagged violence above threshold.
        Returns is_gore and is_brawl to decide ban vs blur.

        Returns:
            {
                "is_gore": bool,          # True → ban (blood, weapons, graphic)
                "is_brawl": bool,         # True → blur (street fight, physical)
                "gore_confidence": float,  # raw CLIP similarity to gore prompts
                "brawl_confidence": float, # raw CLIP similarity to brawl prompts
                "gore_prob": float,        # softmax probability gore vs brawl
            }
        """
        if not peak_frames:
            return {
                "is_gore": False,
                "is_brawl": False,
                "gore_confidence": 0.0,
                "brawl_confidence": 0.0,
                "gore_prob": 0.0,
            }

        gore_sims, brawl_sims = [], []

        for frame in peak_frames:
            inputs = self.processor(images=frame, return_tensors="pt").to(DEVICE)
            img_out = self.model.get_image_features(**inputs)
            img_feat = img_out.pooler_output if hasattr(img_out, 'pooler_output') else img_out
            img_feat = img_feat / img_feat.norm(dim=-1, keepdim=True)

            gore_sim = (img_feat @ self.gore_feat.T).max().item()
            brawl_sim = (img_feat @ self.brawl_feat.T).max().item()
            gore_sims.append(gore_sim)
            brawl_sims.append(brawl_sim)

        gore_conf = float(np.mean(gore_sims))
        brawl_conf = float(np.mean(brawl_sims))

        # Softmax with temperature=25 for separation
        exp_g = np.exp(gore_conf * 25)
        exp_b = np.exp(brawl_conf * 25)
        p_gore = exp_g / (exp_g + exp_b)

        # is_gore: CLIP must clearly favor gore over brawl (prob > 0.60)
        # is_brawl: brawl confidence is higher OR both are similar (prob <= 0.60)
        is_gore = p_gore > 0.60
        is_brawl = brawl_conf > 0.22  # minimum similarity to count as brawl

        return {
            "is_gore": is_gore,
            "is_brawl": is_brawl,
            "gore_confidence": gore_conf,
            "brawl_confidence": brawl_conf,
            "gore_prob": p_gore,
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
