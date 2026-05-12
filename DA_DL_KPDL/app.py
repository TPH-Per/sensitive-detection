import json
import math
import sys
import time
from pathlib import Path

import cv2
import gradio as gr
import numpy as np
import pandas as pd
import torch
from PIL import Image
from transformers import pipeline as hf_pipeline

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.inference_local import (  # noqa: E402
    compute_flow_features,
    extract_clip_features,
    load_clip,
    load_yolo,
    pad_to_match,
    sample_video_frames,
)
from src.models.gore_detector import GoreDetector, get_default_transform as gore_val_transform  # noqa: E402
from src.models.nsfw_classifier import NSFWClassifier, nsfw_val_transform  # noqa: E402
from src.models.selfharm_detector import SelfHarmDetector, selfharm_val_transform  # noqa: E402
from src.models.task_gated_model import TaskGatedModelV6  # noqa: E402
from src.models.v7_videomae_lora import V7Config, VideoModerationV7  # noqa: E402


ARTIFACTS_DIR = ROOT / "final_artifacts_v6" if (ROOT / "final_artifacts_v6").exists() else ROOT / "trongso"
WEIGHTS_DIR = ARTIFACTS_DIR
CALIBRATION_PATH = ARTIFACTS_DIR / "calibration_v6.json"
CALIBRATION_V7_PATH = ARTIFACTS_DIR / "calibration_v7.json"
E2E_METRICS_PATH = ARTIFACTS_DIR / "e2e_metrics.csv"
EVIDENCE_PATH = ARTIFACTS_DIR / "evidence_report_v6.json"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

WEIGHT_FILES_V6 = {
    "yolo": "yolov8_weapon_v6_best.pt",
    "gore": "gore_detector_v6_best.pth",
    "selfharm": "selfharm_detector_v6_best.pth",
    "nsfw": "nsfw_classifier_v6_best.pth",
    "task": "task_gated_v6_best.pth",
}
WEIGHT_FILE_V7 = "v7_videomae_lora_best.pth"
MODEL_VARIANTS = ("V6 Task-Gated", "V7 VideoMAE-LoRA")

MODEL_CACHE: dict = {}


def _coerce_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def load_pipeline_metadata() -> dict:
    metadata = {
        "artifact_dir": str(ARTIFACTS_DIR),
        "thresholds": {
            "thresh_v": 0.9136363636363637,
            "thresh_s": 0.995,
            "thresh_n": 0.999,
        },
        "sn_pooling": "topk_noisy_or",
        "sn_topk_ratio": 0.2,
        "sn_topk_min": 3,
        "split_stats": {},
        "checkpoint_cfg": {},
        "val_stats": {},
        "best_val_metrics": {},
        "last_metrics": {},
    }

    if CALIBRATION_PATH.exists():
        try:
            with CALIBRATION_PATH.open("r", encoding="utf-8") as f:
                calibration = json.load(f)
            metadata["thresholds"] = {
                "thresh_v": _coerce_float(calibration.get("thresh_v", metadata["thresholds"]["thresh_v"])),
                "thresh_s": _coerce_float(calibration.get("thresh_s", metadata["thresholds"]["thresh_s"])),
                "thresh_n": _coerce_float(calibration.get("thresh_n", metadata["thresholds"]["thresh_n"])),
            }
            metadata["sn_pooling"] = calibration.get("sn_pooling", metadata["sn_pooling"])
            metadata["sn_topk_ratio"] = _coerce_float(calibration.get("sn_topk_ratio", metadata["sn_topk_ratio"]))
            metadata["sn_topk_min"] = int(calibration.get("sn_topk_min", metadata["sn_topk_min"]))
            metadata["val_stats"] = calibration.get("val_stats", {}) or {}
        except Exception:
            pass

    if EVIDENCE_PATH.exists():
        try:
            with EVIDENCE_PATH.open("r", encoding="utf-8") as f:
                evidence = json.load(f)
            metadata["split_stats"] = evidence.get("split_stats", {}) or {}
            metadata["checkpoint_cfg"] = evidence.get("checkpoint_cfg", {}) or {}
        except Exception:
            pass

    if E2E_METRICS_PATH.exists():
        try:
            metrics = pd.read_csv(E2E_METRICS_PATH)
            if len(metrics) > 0 and "val_v_f2" in metrics.columns:
                best_idx = metrics["val_v_f2"].astype(float).idxmax()
                best_row = metrics.loc[best_idx]
                metadata["best_val_metrics"] = {
                    "epoch": int(_coerce_float(best_row.get("epoch", -1), -1)),
                    "train_loss": _coerce_float(best_row.get("train_loss", 0.0)),
                    "val_loss": _coerce_float(best_row.get("val_loss", 0.0)),
                    "val_v_prec": _coerce_float(best_row.get("val_v_prec", 0.0)),
                    "val_v_rec": _coerce_float(best_row.get("val_v_rec", 0.0)),
                    "val_v_f1": _coerce_float(best_row.get("val_v_f1", 0.0)),
                    "val_v_f2": _coerce_float(best_row.get("val_v_f2", 0.0)),
                    "val_v_auc": _coerce_float(best_row.get("val_v_auc", 0.0)),
                    "val_v_pr_auc": _coerce_float(best_row.get("val_v_pr_auc", 0.0)),
                    "val_s_mean": _coerce_float(best_row.get("val_s_mean", 0.0)),
                    "val_n_mean": _coerce_float(best_row.get("val_n_mean", 0.0)),
                    "shortcut_gap": _coerce_float(best_row.get("shortcut_gap", 0.0)),
                }
                last_row = metrics.iloc[-1]
                metadata["last_metrics"] = {
                    "epoch": int(_coerce_float(last_row.get("epoch", -1), -1)),
                    "train_loss": _coerce_float(last_row.get("train_loss", 0.0)),
                    "val_loss": _coerce_float(last_row.get("val_loss", 0.0)),
                    "val_v_f2": _coerce_float(last_row.get("val_v_f2", 0.0)),
                    "val_v_pr_auc": _coerce_float(last_row.get("val_v_pr_auc", 0.0)),
                    "val_v_auc": _coerce_float(last_row.get("val_v_auc", 0.0)),
                }
        except Exception:
            pass

    return metadata


PIPELINE_META = load_pipeline_metadata()


def build_pipeline_summary_md() -> str:
    thresholds = PIPELINE_META.get("thresholds", {})
    split_stats = PIPELINE_META.get("split_stats", {})
    best = PIPELINE_META.get("best_val_metrics", {})
    last = PIPELINE_META.get("last_metrics", {})
    checkpoint_cfg = PIPELINE_META.get("checkpoint_cfg", {})

    def fmt4(value) -> str:
        return "N/A" if value is None else f"{_coerce_float(value):.4f}"

    def _split_line(name: str) -> str:
        stats = split_stats.get(name, {}) or {}
        rows = stats.get("rows", "?")
        pos = stats.get("violence_pos", "?")
        ratio = stats.get("violence_ratio", None)
        ratio_txt = f"{_coerce_float(ratio):.4f}" if ratio is not None else "?"
        return f"- {name.title()}: rows={rows}, violence_pos={pos}, violence_ratio={ratio_txt}"

    best_epoch = best.get("epoch", "?")
    best_v_f2 = best.get("val_v_f2", None)
    best_v_auc = best.get("val_v_auc", None)
    best_v_pr_auc = best.get("val_v_pr_auc", None)
    best_val_loss = best.get("val_loss", None)
    last_epoch = last.get("epoch", "?")

    return (
        "### V6.1 Baseline Summary\n"
        f"- Artifact dir: `{ARTIFACTS_DIR}`\n"
        f"- Calibration file: `{CALIBRATION_PATH.name}`\n"
        f"- Violence threshold: **{thresholds.get('thresh_v', 0.0):.4f}**\n"
        f"- Self-harm threshold: **{thresholds.get('thresh_s', 0.0):.4f}**\n"
        f"- NSFW threshold: **{thresholds.get('thresh_n', 0.0):.4f}**\n"
        f"- S/N pooling: **{PIPELINE_META.get('sn_pooling', 'topk_noisy_or')}** (topk_ratio={PIPELINE_META.get('sn_topk_ratio', 0.2):.2f}, topk_min={PIPELINE_META.get('sn_topk_min', 3)})\n"
        f"- Best val epoch: **{best_epoch}** | val_loss={fmt4(best_val_loss)}\n"
        f"- Best val V_F2: **{fmt4(best_v_f2)}** | V_AUC={fmt4(best_v_auc)} | V_PR-AUC={fmt4(best_v_pr_auc)}\n"
        f"- Last epoch in metrics: **{last_epoch}**\n"
        f"{_split_line('train')}\n"
        f"{_split_line('val')}\n"
        f"{_split_line('test')}\n"
        "- UI thresholds are loaded automatically from calibration_v6.json; no manual threshold slider is used.\n"
        f"- Checkpoint cfg: temp={checkpoint_cfg.get('temperature', '?')}, lambda_dist={checkpoint_cfg.get('lambda_dist', '?')}, lambda_ent={checkpoint_cfg.get('lambda_ent', '?')}"
    )


PIPELINE_SUMMARY_MD = build_pipeline_summary_md()


def safe_torch_load(path: Path):
    try:
        return torch.load(path, map_location=DEVICE, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=DEVICE)


def _load_state_dict(model: torch.nn.Module, checkpoint):
    if isinstance(checkpoint, dict):
        state = checkpoint.get("model_state_dict") or checkpoint.get("model_state") or checkpoint
    else:
        state = checkpoint
    model.load_state_dict(state, strict=True)


def _extract_state_dict(checkpoint) -> dict:
    if isinstance(checkpoint, dict):
        state = checkpoint.get("model_state_dict") or checkpoint.get("model_state") or checkpoint
        if isinstance(state, dict):
            return dict(state)
    if isinstance(checkpoint, dict):
        return dict(checkpoint)
    return dict(checkpoint)


def _load_v7_state_dict_compat(model: VideoModerationV7, checkpoint) -> None:
    state = _extract_state_dict(checkpoint)
    expected = model.state_dict()
    expected_keys = set(expected.keys())

    adapted = dict(state)
    allowed_unexpected_suffixes = (
        ".attention.attention.q_bias",
        ".attention.attention.v_bias",
        "classifier.weight",
        "classifier.bias",
        "fc_norm.weight",
        "fc_norm.bias",
    )

    # Convert old VideoMAE q_bias/v_bias keys into query/value bias keys.
    for k in list(state.keys()):
        if k.endswith(".attention.attention.q_bias"):
            prefix = k[: -len("q_bias")]
            for cand in (prefix + "query.bias", prefix + "query.base.bias"):
                if cand in expected_keys and cand not in adapted:
                    adapted[cand] = state[k].clone()
                    break
        elif k.endswith(".attention.attention.v_bias"):
            prefix = k[: -len("v_bias")]
            for cand in (prefix + "value.bias", prefix + "value.base.bias"):
                if cand in expected_keys and cand not in adapted:
                    adapted[cand] = state[k].clone()
                    break

    # Fill missing key.bias with zeros when old checkpoint format has no explicit key bias.
    for ek in expected_keys:
        if ek.endswith(".attention.attention.key.bias") and ek not in adapted:
            adapted[ek] = torch.zeros_like(expected[ek])

    # Remove old-format extras that we already converted.
    for k in list(adapted.keys()):
        if (k.endswith(".attention.attention.q_bias") or k.endswith(".attention.attention.v_bias")) and k not in expected_keys:
            adapted.pop(k, None)
        elif any(k.endswith(suf) for suf in ("classifier.weight", "classifier.bias", "fc_norm.weight", "fc_norm.bias")) and k not in expected_keys:
            adapted.pop(k, None)

    incompatible = model.load_state_dict(adapted, strict=False)
    missing = list(incompatible.missing_keys)
    unexpected = list(incompatible.unexpected_keys)

    # One more pass: query/value bias may still be missing on some transformer versions.
    if missing:
        for mk in list(missing):
            if mk.endswith(".attention.attention.query.bias"):
                src = mk.replace(".query.bias", ".q_bias")
                if src in state:
                    adapted[mk] = state[src].clone()
            elif mk.endswith(".attention.attention.query.base.bias"):
                src = mk.replace(".query.base.bias", ".q_bias")
                if src in state:
                    adapted[mk] = state[src].clone()
            elif mk.endswith(".attention.attention.value.bias"):
                src = mk.replace(".value.bias", ".v_bias")
                if src in state:
                    adapted[mk] = state[src].clone()
            elif mk.endswith(".attention.attention.value.base.bias"):
                src = mk.replace(".value.base.bias", ".v_bias")
                if src in state:
                    adapted[mk] = state[src].clone()
            elif mk.endswith(".attention.attention.key.bias"):
                adapted[mk] = torch.zeros_like(expected[mk])

        incompatible = model.load_state_dict(adapted, strict=False)
        missing = list(incompatible.missing_keys)
        unexpected = list(incompatible.unexpected_keys)

    filtered_unexpected = [
        k for k in unexpected if not k.endswith(allowed_unexpected_suffixes)
    ]
    filtered_missing = [k for k in missing if k in expected_keys]
    if filtered_missing or filtered_unexpected:
        raise RuntimeError(
            "V7 checkpoint incompatible after bias-key adaptation. "
            f"Missing={len(filtered_missing)}, Unexpected={len(filtered_unexpected)}. "
            f"First missing={filtered_missing[:5]} | first unexpected={filtered_unexpected[:5]}"
        )


def load_common_models():
    if MODEL_CACHE.get("common_loaded", False):
        return

    # YOLO DISABLED — skip loading yolo weights
    missing = [name for name, fn in WEIGHT_FILES_V6.items() if name not in ("task", "yolo") and not (WEIGHTS_DIR / fn).exists()]
    if missing:
        missing_str = ", ".join(missing)
        raise FileNotFoundError(f"Missing common weight files in {WEIGHTS_DIR}: {missing_str}")

    processor, clip_model = load_clip(DEVICE)

    gore_model = GoreDetector(unfreeze_from_layer=0).to(DEVICE)
    _load_state_dict(gore_model, safe_torch_load(WEIGHTS_DIR / WEIGHT_FILES_V6["gore"]))
    gore_model.eval()

    selfharm_model = SelfHarmDetector(unfreeze_from_layer=0).to(DEVICE)
    _load_state_dict(selfharm_model, safe_torch_load(WEIGHTS_DIR / WEIGHT_FILES_V6["selfharm"]))
    selfharm_model.eval()

    nsfw_model = NSFWClassifier(unfreeze_from_layer=0).to(DEVICE)
    _load_state_dict(nsfw_model, safe_torch_load(WEIGHTS_DIR / WEIGHT_FILES_V6["nsfw"]))
    nsfw_model.eval()

    MODEL_CACHE.update(
        {
            "common_loaded": True,
            "processor": processor,
            "clip": clip_model,
            "yolo": None,
            "gore": gore_model,
            "selfharm": selfharm_model,
            "nsfw": nsfw_model,
        }
    )


def load_task_model_v6():
    load_common_models()
    if MODEL_CACHE.get("v6_loaded", False):
        return

    task_path = WEIGHTS_DIR / WEIGHT_FILES_V6["task"]
    if not task_path.exists():
        raise FileNotFoundError(f"Missing V6 task weight: {task_path}")

    ckpt = safe_torch_load(task_path)
    ckpt_args = ckpt.get("args", {}) if isinstance(ckpt, dict) else {}
    has_v7_quick_cfg = "sn_pooling" in ckpt_args
    if has_v7_quick_cfg:
        sn_pooling = ckpt_args.get("sn_pooling", "topk_noisy_or")
        sn_topk_ratio = float(ckpt_args.get("sn_topk_ratio", 0.2))
        sn_topk_min = int(ckpt_args.get("sn_topk_min", 3))
        modality_balance = not bool(ckpt_args.get("disable_modality_balance", False))
        v_clip_scale = float(ckpt_args.get("v_clip_scale", 0.35))
        s_clip_scale = float(ckpt_args.get("s_clip_scale", 0.45))
        n_clip_scale = float(ckpt_args.get("n_clip_scale", 0.65))
    else:
        sn_pooling = "weighted_mean"
        sn_topk_ratio = 0.2
        sn_topk_min = 3
        modality_balance = False
        v_clip_scale = 1.0
        s_clip_scale = 1.0
        n_clip_scale = 1.0

    task_model = TaskGatedModelV6(
        clip_dim=768,
        d_model=256,
        max_frames=64,
        dropout=0.2,
        sn_pooling=sn_pooling,
        sn_topk_ratio=sn_topk_ratio,
        sn_topk_min=sn_topk_min,
        modality_balance=modality_balance,
        v_clip_scale=v_clip_scale,
        s_clip_scale=s_clip_scale,
        n_clip_scale=n_clip_scale,
    ).to(DEVICE)
    _load_state_dict(task_model, ckpt)
    task_model.eval()

    MODEL_CACHE.update(
        {
            "task_v6": task_model,
            "v6_loaded": True,
            "v6_cfg": {
                "sn_pooling": sn_pooling,
                "sn_topk_ratio": sn_topk_ratio,
                "sn_topk_min": sn_topk_min,
                "modality_balance": modality_balance,
                "v_clip_scale": v_clip_scale,
                "s_clip_scale": s_clip_scale,
                "n_clip_scale": n_clip_scale,
            },
        }
    )


def _build_v7_model_from_ckpt(ckpt: dict) -> tuple[VideoModerationV7, dict]:
    model_cfg_dict = ckpt.get("model_cfg", None)
    if model_cfg_dict:
        cfg = V7Config(**model_cfg_dict)
    else:
        args = ckpt.get("args", {}) if isinstance(ckpt, dict) else {}
        cfg = V7Config(
            model_name=args.get("model_name", "MCG-NJU/videomae-small-finetuned-ssv2"),
            d_fuse=int(args.get("d_fuse", 384)),
            lora_r=int(args.get("lora_r", 8)),
            lora_alpha=float(args.get("lora_alpha", 16.0)),
            lora_dropout=float(args.get("lora_dropout", 0.05)),
            lora_last_n_layers=int(args.get("lora_last_n_layers", 4)),
            dropout=float(args.get("dropout", 0.2)),
        )
    model = VideoModerationV7(cfg).to(DEVICE)
    _load_v7_state_dict_compat(model, ckpt)
    model.eval()
    return model, cfg.__dict__


def load_task_model_v7():
    load_common_models()
    if MODEL_CACHE.get("v7_loaded", False):
        return

    v7_path = WEIGHTS_DIR / WEIGHT_FILE_V7
    if not v7_path.exists():
        raise FileNotFoundError(f"Missing V7 weight: {v7_path}")

    ckpt = safe_torch_load(v7_path)
    model, cfg_dict = _build_v7_model_from_ckpt(ckpt)
    args = ckpt.get("args", {}) if isinstance(ckpt, dict) else {}

    MODEL_CACHE.update(
        {
            "task_v7": model,
            "v7_loaded": True,
            "v7_ckpt": ckpt,
            "v7_cfg": cfg_dict,
            "v7_args": args,
        }
    )


def get_thresholds_for_variant(model_variant: str) -> tuple[dict, str]:
    if model_variant == "V7 VideoMAE-LoRA":
        if CALIBRATION_V7_PATH.exists():
            try:
                payload = json.loads(CALIBRATION_V7_PATH.read_text(encoding="utf-8"))
                return {
                    "thresh_v": _coerce_float(payload.get("thresh_v", 0.5), 0.5),
                    "thresh_s": _coerce_float(payload.get("thresh_s", 0.5), 0.5),
                    "thresh_n": _coerce_float(payload.get("thresh_n", 0.5), 0.5),
                }, f"calibration_v7.json ({CALIBRATION_V7_PATH.name})"
            except Exception:
                pass
        try:
            load_task_model_v7()
            ckpt = MODEL_CACHE.get("v7_ckpt", {})
            v7_thresh_v = _coerce_float(ckpt.get("thresh_v", 0.5), 0.5) if isinstance(ckpt, dict) else 0.5
        except Exception:
            v7_thresh_v = 0.5

        fallback = PIPELINE_META.get("thresholds", {})
        return {
            "thresh_v": v7_thresh_v,
            "thresh_s": _coerce_float(fallback.get("thresh_s", 0.995), 0.995),
            "thresh_n": _coerce_float(fallback.get("thresh_n", 0.999), 0.999),
        }, "fallback: V7 ckpt(thresh_v) + V6 calibration(S/N)"

    thresholds = PIPELINE_META.get("thresholds", {})
    return {
        "thresh_v": _coerce_float(thresholds.get("thresh_v", 0.9136363636363637)),
        "thresh_s": _coerce_float(thresholds.get("thresh_s", 0.995)),
        "thresh_n": _coerce_float(thresholds.get("thresh_n", 0.999)),
    }, "calibration_v6.json"


@torch.no_grad()
def batch_expert_probs(frames: list[Image.Image], model: torch.nn.Module, transform, batch_size: int = 16) -> np.ndarray:
    rows = []
    for i in range(0, len(frames), batch_size):
        batch_frames = frames[i : i + batch_size]
        x = torch.stack([transform(img) for img in batch_frames], dim=0).to(DEVICE)
        probs = model.predict_proba(x).squeeze(1).detach().cpu().numpy()
        rows.append(probs)
    out = np.concatenate(rows, axis=0).astype(np.float32)
    return out.reshape(-1, 1)


@torch.no_grad()
def run_yolo_with_details(frames: list[Image.Image], yolo_model):
    # YOLO DISABLED — always return zeros
    t = max(len(frames), 1)
    return np.zeros((t, 1), dtype=np.float32), np.zeros((t, 1), dtype=np.float32), [{} for _ in range(t)]


def normalize01(x: np.ndarray) -> np.ndarray:
    x = x.astype(np.float32)
    if x.size == 0:
        return x
    mn, mx = float(x.min()), float(x.max())
    if mx - mn < 1e-8:
        return np.zeros_like(x, dtype=np.float32)
    return (x - mn) / (mx - mn)


def apply_modality_toggles(
    clip_f: np.ndarray,
    flow_f: np.ndarray,
    yolo_w: np.ndarray,
    gore_p: np.ndarray,
    sh_p: np.ndarray,
    nsfw_p: np.ndarray,
    enabled_modalities: set[str],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    clip_m = clip_f.copy()
    flow_m = flow_f.copy()
    yolo_m = yolo_w.copy()
    gore_m = gore_p.copy()
    sh_m = sh_p.copy()
    nsfw_m = nsfw_p.copy()

    if "CLIP" not in enabled_modalities:
        clip_m[:] = 0.0
    if "Flow" not in enabled_modalities:
        flow_m[:] = 0.0
    if "YOLO" not in enabled_modalities:
        yolo_m[:] = 0.0
    if "Gore" not in enabled_modalities:
        gore_m[:] = 0.0
    if "SelfHarm" not in enabled_modalities:
        sh_m[:] = 0.0
    if "NSFW" not in enabled_modalities:
        nsfw_m[:] = 0.0

    return clip_m, flow_m, yolo_m, gore_m, sh_m, nsfw_m


def build_v7_aux_summary(
    flow_f: np.ndarray,
    yolo_w: np.ndarray,
    gore_p: np.ndarray,
    sh_p: np.ndarray,
    nsfw_p: np.ndarray,
) -> np.ndarray:
    aux = np.zeros((1, 7), dtype=np.float32)
    if flow_f.size:
        aux[0, 0:3] = flow_f[:, :3].mean(axis=0).astype(np.float32)
    aux[0, 3] = float(yolo_w.max()) if yolo_w.size else 0.0
    aux[0, 4] = float(gore_p.max()) if gore_p.size else 0.0
    aux[0, 5] = float(sh_p.max()) if sh_p.size else 0.0
    aux[0, 6] = float(nsfw_p.max()) if nsfw_p.size else 0.0
    return aux


def prepare_v7_pixel_values(
    frames: list[Image.Image],
    num_frames: int = 16,
    image_size: int = 224,
    clip_enabled: bool = True,
) -> torch.Tensor:
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 1, 3)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 1, 3)
    n_frames = max(int(num_frames), 1)
    if len(frames) == 0:
        arr = np.zeros((n_frames, image_size, image_size, 3), dtype=np.float32)
    else:
        idxs = np.linspace(0, len(frames) - 1, num=n_frames, dtype=np.int32).tolist()
        rows = []
        for idx in idxs:
            rgb = np.array(frames[idx].convert("RGB").resize((image_size, image_size), Image.BILINEAR), dtype=np.float32) / 255.0
            rows.append(rgb)
        arr = np.stack(rows, axis=0)
    arr = (arr - mean) / std
    x = torch.from_numpy(arr).permute(0, 3, 1, 2).contiguous().float().unsqueeze(0).to(DEVICE)
    if not clip_enabled:
        x = torch.zeros_like(x)
    return x


def topk_noisy_or_debug(
    attn: np.ndarray | None,
    probs: np.ndarray,
    topk_ratio: float = 0.2,
    topk_min: int = 3,
) -> dict:
    eps = 1e-6
    p = np.asarray(probs, dtype=np.float32).reshape(-1)
    p = np.clip(p, 0.0, 1.0)
    if p.size == 0:
        return {"score": 0.0, "k": 0, "top_ids": [], "top_vals": [], "mean": 0.0, "std": 0.0, "max": 0.0}

    if attn is None:
        gated = p.copy()
    else:
        a = np.asarray(attn, dtype=np.float32).reshape(-1)
        a = np.maximum(a, eps)
        a = a / max(float(a.sum()), eps)
        a_peak = a / max(float(a.max()), eps)
        gated = p * (0.5 + 0.5 * a_peak)

    t = gated.size
    k = min(t, max(int(topk_min), int(math.ceil(t * float(topk_ratio)))))
    top_ids = np.argsort(gated)[::-1][:k].astype(int).tolist()
    top_vals = gated[top_ids]
    score = float(1.0 - np.prod(1.0 - top_vals + eps))
    return {
        "score": score,
        "k": int(k),
        "top_ids": top_ids,
        "top_vals": [float(v) for v in top_vals.tolist()],
        "mean": float(p.mean()),
        "std": float(p.std()),
        "max": float(p.max()),
    }


def compute_sn_coupling_debug(
    sh_probs: np.ndarray,
    nsfw_probs: np.ndarray,
    s_attn: np.ndarray | None,
    n_attn: np.ndarray | None,
    topk_ratio: float,
    topk_min: int,
) -> dict:
    sh = np.asarray(sh_probs, dtype=np.float32).reshape(-1)
    ns = np.asarray(nsfw_probs, dtype=np.float32).reshape(-1)
    if sh.size == 0 or ns.size == 0:
        corr = 0.0
    elif float(sh.std()) < 1e-8 or float(ns.std()) < 1e-8:
        corr = 0.0
    else:
        corr = float(np.corrcoef(sh, ns)[0, 1])

    s_dbg = topk_noisy_or_debug(s_attn, sh, topk_ratio=topk_ratio, topk_min=topk_min)
    n_dbg = topk_noisy_or_debug(n_attn, ns, topk_ratio=topk_ratio, topk_min=topk_min)

    s_set = set(s_dbg["top_ids"])
    n_set = set(n_dbg["top_ids"])
    overlap = sorted(list(s_set.intersection(n_set)))
    overlap_ratio = float(len(overlap) / max(min(s_dbg["k"], n_dbg["k"]), 1))
    return {
        "corr": corr,
        "s": s_dbg,
        "n": n_dbg,
        "overlap_ids": overlap,
        "overlap_ratio": overlap_ratio,
    }


def build_skin_mask(frame_rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2HSV)
    lower = np.array([0, 25, 50], dtype=np.uint8)
    upper = np.array([25, 200, 255], dtype=np.uint8)
    mask = cv2.inRange(hsv, lower, upper).astype(np.float32) / 255.0
    return cv2.GaussianBlur(mask, (0, 0), 5)


def build_generic_saliency(frame_rgb: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    blur = cv2.GaussianBlur(gray, (0, 0), 3)
    high = np.abs(gray - blur)
    return normalize01(high)


def build_token_overlay(
    frame: Image.Image,
    token_name: str,
    token_attn: float,
    expert_prob: float,
    focus_score: float,
    yolo_detail: dict,
) -> Image.Image:
    frame_rgb = np.array(frame.convert("RGB"))
    h, w = frame_rgb.shape[:2]

    saliency = build_generic_saliency(frame_rgb)
    if token_name == "N":
        saliency = 0.55 * saliency + 0.45 * build_skin_mask(frame_rgb)

    if token_name == "S" and yolo_detail:
        box_map = np.zeros((h, w), dtype=np.float32)
        for box in yolo_detail.get("boxes", []):
            cls_id = int(box["cls"])
            if cls_id not in (0, 1):
                continue
            x1, y1, x2, y2 = [int(v) for v in box["xyxy"]]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w - 1, x2), min(h - 1, y2)
            if x2 <= x1 or y2 <= y1:
                continue
            box_map[y1:y2, x1:x2] = max(box_map[y1:y2, x1:x2].max(), float(box["conf"]))
        if box_map.max() > 0:
            saliency = 0.6 * saliency + 0.4 * normalize01(box_map)

    saliency = normalize01(saliency)
    alpha = 0.2 + 0.55 * float(np.clip(focus_score, 0.0, 1.0))

    heatmap = cv2.applyColorMap((saliency * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    blended = cv2.addWeighted(frame_rgb, 1.0 - alpha, heatmap, alpha, 0.0)

    text = f"{token_name}: attn={token_attn:.3f} | expert={expert_prob:.3f} | focus={focus_score:.3f}"
    cv2.putText(blended, text, (10, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(blended, text, (10, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (30, 30, 30), 1, cv2.LINE_AA)
    return Image.fromarray(blended)


def draw_yolo_boxes(frame: Image.Image, yolo_detail: dict) -> Image.Image:
    img = np.array(frame.convert("RGB")).copy()
    color_map = {0: (255, 80, 80), 1: (80, 220, 255)}
    name_map = {0: "Weapon", 1: "Medical"}

    for box in yolo_detail.get("boxes", []):
        cls_id = int(box["cls"])
        conf = float(box["conf"])
        x1, y1, x2, y2 = [int(v) for v in box["xyxy"]]
        color = color_map.get(cls_id, (200, 200, 200))
        label = f"{name_map.get(cls_id, f'cls{cls_id}')} {conf:.2f}"
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        cv2.putText(img, label, (x1, max(16, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.52, color, 2, cv2.LINE_AA)

    return Image.fromarray(img)


def build_attention_plot(
    v_attn: np.ndarray,
    s_attn: np.ndarray,
    n_attn: np.ndarray,
    selfharm_probs: np.ndarray,
    nsfw_probs: np.ndarray,
) -> Image.Image:
    width, height = 980, 360
    canvas = np.full((height, width, 3), 245, dtype=np.uint8)
    left, right, top, bottom = 60, width - 24, 30, height - 44
    cv2.rectangle(canvas, (left, top), (right, bottom), (220, 220, 220), 1)

    def plot_line(values: np.ndarray, color: tuple[int, int, int], thickness: int = 2):
        vals = normalize01(values.reshape(-1))
        n = len(vals)
        if n <= 1:
            return
        xs = np.linspace(left, right, n).astype(np.int32)
        ys = (bottom - vals * (bottom - top)).astype(np.int32)
        pts = np.stack([xs, ys], axis=1).reshape(-1, 1, 2)
        cv2.polylines(canvas, [pts], False, color, thickness, cv2.LINE_AA)

    plot_line(v_attn, (20, 20, 220), 2)
    plot_line(s_attn, (220, 90, 20), 2)
    plot_line(n_attn, (20, 160, 30), 2)
    plot_line(selfharm_probs, (255, 170, 120), 1)
    plot_line(nsfw_probs, (120, 220, 120), 1)

    cv2.putText(canvas, "Temporal Attention / Expert Scores", (left, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.63, (20, 20, 20), 2, cv2.LINE_AA)
    cv2.putText(canvas, "V_attn", (left, bottom + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (20, 20, 220), 2, cv2.LINE_AA)
    cv2.putText(canvas, "S_attn", (left + 88, bottom + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (220, 90, 20), 2, cv2.LINE_AA)
    cv2.putText(canvas, "N_attn", (left + 176, bottom + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (20, 160, 30), 2, cv2.LINE_AA)
    cv2.putText(canvas, "SelfHarm_prob", (left + 264, bottom + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 170, 120), 2, cv2.LINE_AA)
    cv2.putText(canvas, "NSFW_prob", (left + 456, bottom + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (120, 220, 120), 2, cv2.LINE_AA)

    return Image.fromarray(canvas)


def build_token_gallery(
    frames: list[Image.Image],
    token_name: str,
    attn: np.ndarray,
    expert_probs: np.ndarray | None = None,
    yolo_details: list[dict] | None = None,
    top_k: int = 6,
):
    yolo_details = yolo_details or []
    attn_vec = attn.reshape(-1)
    if expert_probs is None:
        expert = attn_vec.copy()
        focus = normalize01(attn_vec)
    else:
        expert = expert_probs.reshape(-1)
        focus = normalize01(attn_vec) * normalize01(expert)
    order = np.argsort(focus)[::-1]
    top_ids = [int(i) for i in order[: max(1, min(top_k, len(order)))]]

    gallery = []
    for rank, idx in enumerate(top_ids, start=1):
        detail = yolo_details[idx] if idx < len(yolo_details) else {}
        overlay = build_token_overlay(
            frame=frames[idx],
            token_name=token_name,
            token_attn=float(attn[idx]),
            expert_prob=float(expert[idx]),
            focus_score=float(focus[idx]),
            yolo_detail=detail,
        )
        caption = (
            f"#{rank} | frame={idx} | {token_name}_attn={float(attn[idx]):.4f} | "
            f"expert={float(expert[idx]):.4f} | focus={float(focus[idx]):.4f}"
        )
        gallery.append((overlay, caption))
    return gallery, focus


def make_yolo_markdown(yolo_weapon: np.ndarray, yolo_medical: np.ndarray, yolo_details: list[dict]) -> str:
    weapon_max = float(yolo_weapon.max()) if yolo_weapon.size else 0.0
    medical_max = float(yolo_medical.max()) if yolo_medical.size else 0.0
    weapon_idx = int(np.argmax(yolo_weapon[:, 0])) if yolo_weapon.size else 0
    medical_idx = int(np.argmax(yolo_medical[:, 0])) if yolo_medical.size else 0

    total_weapon_boxes = int(sum(d.get("weapon_count", 0) for d in yolo_details))
    total_medical_boxes = int(sum(d.get("medical_count", 0) for d in yolo_details))

    return (
        "### YOLO Detect Metrics\n"
        f"- Weapon max confidence: **{weapon_max:.4f}** (frame {weapon_idx})\n"
        f"- Medical max confidence: **{medical_max:.4f}** (frame {medical_idx})\n"
        f"- Total weapon boxes: **{total_weapon_boxes}**\n"
        f"- Total medical boxes: **{total_medical_boxes}**"
    )


@torch.no_grad()
def compute_v_ablation(
    task_model: torch.nn.Module,
    x: torch.Tensor,
    flow_t: torch.Tensor,
    yolo_t: torch.Tensor,
    gore_t: torch.Tensor,
    nsfw_t: torch.Tensor,
    selfharm_t: torch.Tensor,
) -> dict[str, float]:
    def vprob(
        clip_in: torch.Tensor,
        flow_in: torch.Tensor,
        yolo_in: torch.Tensor,
        gore_in: torch.Tensor,
        nsfw_in: torch.Tensor,
        selfharm_in: torch.Tensor,
    ) -> float:
        v_logit, _, _, _ = task_model(clip_in, flow_in, yolo_in, gore_in, nsfw_in, selfharm_in)
        return float(torch.sigmoid(v_logit)[0, 0].item())

    z_flow = torch.zeros_like(flow_t)
    z_yolo = torch.zeros_like(yolo_t)
    z_gore = torch.zeros_like(gore_t)
    z_clip = torch.zeros_like(x)
    z_selfharm = torch.zeros_like(selfharm_t)

    base = vprob(x, flow_t, yolo_t, gore_t, nsfw_t, selfharm_t)
    no_flow = vprob(x, z_flow, yolo_t, gore_t, nsfw_t, selfharm_t)
    no_yolo = vprob(x, flow_t, z_yolo, gore_t, nsfw_t, selfharm_t)
    no_gore = vprob(x, flow_t, yolo_t, z_gore, nsfw_t, selfharm_t)
    no_clip = vprob(z_clip, flow_t, yolo_t, gore_t, nsfw_t, selfharm_t)
    no_selfharm = vprob(x, flow_t, yolo_t, gore_t, nsfw_t, z_selfharm)

    return {
        "base": base,
        "no_flow": no_flow,
        "no_yolo": no_yolo,
        "no_gore": no_gore,
        "no_clip": no_clip,
        "no_selfharm": no_selfharm,
        "delta_flow": base - no_flow,
        "delta_yolo": base - no_yolo,
        "delta_gore": base - no_gore,
        "delta_clip": base - no_clip,
        "delta_selfharm": base - no_selfharm,
    }


@torch.no_grad()
def compute_v7_ablation(
    task_model: VideoModerationV7,
    pixel_values: torch.Tensor,
    aux_summary: torch.Tensor,
) -> dict[str, float]:
    def vprob(px: torch.Tensor, aux: torch.Tensor) -> float:
        v_logit, _, _ = task_model(px, aux)
        return float(torch.sigmoid(v_logit)[0].item())

    z_px = torch.zeros_like(pixel_values)
    z_aux = torch.zeros_like(aux_summary)

    base = vprob(pixel_values, aux_summary)

    aux_no_flow = aux_summary.clone()
    aux_no_flow[:, 0:3] = 0.0
    aux_no_yolo = aux_summary.clone()
    aux_no_yolo[:, 3] = 0.0
    aux_no_gore = aux_summary.clone()
    aux_no_gore[:, 4] = 0.0
    aux_no_selfharm = aux_summary.clone()
    aux_no_selfharm[:, 5] = 0.0

    no_flow = vprob(pixel_values, aux_no_flow)
    no_yolo = vprob(pixel_values, aux_no_yolo)
    no_gore = vprob(pixel_values, aux_no_gore)
    no_selfharm = vprob(pixel_values, aux_no_selfharm)
    no_clip = vprob(z_px, aux_summary)
    no_aux = vprob(pixel_values, z_aux)

    return {
        "base": base,
        "no_flow": no_flow,
        "no_yolo": no_yolo,
        "no_gore": no_gore,
        "no_clip": no_clip,
        "no_selfharm": no_selfharm,
        "no_aux": no_aux,
        "delta_flow": base - no_flow,
        "delta_yolo": base - no_yolo,
        "delta_gore": base - no_gore,
        "delta_clip": base - no_clip,
        "delta_selfharm": base - no_selfharm,
        "delta_aux": base - no_aux,
    }


def apply_clip_dominant_nsfw_guard(
    v_prob: float,
    n_prob: float,
    thresh_v: float,
    yolo_weapon: np.ndarray,
    gore_p: np.ndarray,
    nsfw_p: np.ndarray,
    flow_f: np.ndarray,
    v_ablation: dict[str, float],
) -> tuple[float, dict]:
    yolo_max = float(yolo_weapon.max()) if yolo_weapon.size else 0.0
    gore_max = float(gore_p.max()) if gore_p.size else 0.0
    nsfw_max = float(nsfw_p.max()) if nsfw_p.size else 0.0
    flow_mean = float(flow_f[:, 0].mean()) if flow_f.ndim == 2 and flow_f.shape[1] > 0 else 0.0

    clip_dominant = (
        v_ablation["delta_clip"] >= 0.60
        and abs(v_ablation["delta_flow"]) <= 0.03
        and abs(v_ablation["delta_gore"]) <= 0.03
        and abs(v_ablation["delta_yolo"]) <= 0.02
    )
    weak_violence_evidence = (yolo_max < 0.05) and (gore_max < 0.25)
    nsfw_context = (n_prob >= 0.20) or (nsfw_max >= 0.85)

    fired = bool(clip_dominant and weak_violence_evidence and nsfw_context)
    adjusted_v = min(v_prob, max(0.0, thresh_v - 0.02)) if fired else v_prob

    return adjusted_v, {
        "fired": fired,
        "clip_dominant": clip_dominant,
        "weak_violence_evidence": weak_violence_evidence,
        "nsfw_context": nsfw_context,
        "yolo_max": yolo_max,
        "gore_max": gore_max,
        "nsfw_max": nsfw_max,
        "flow_mean": flow_mean,
    }


def process_video(
    video_path: str,
    top_k: int,
    apply_guard: bool,
    model_variant: str,
    enabled_branches: list[str],
    enabled_modalities: list[str],
):
    thresholds, threshold_source = get_thresholds_for_variant(model_variant)
    thresh_v = _coerce_float(thresholds.get("thresh_v", 0.5))
    thresh_s = _coerce_float(thresholds.get("thresh_s", 0.5))
    thresh_n = _coerce_float(thresholds.get("thresh_n", 0.5))
    enabled_branch_set = set(enabled_branches) if enabled_branches is not None else {"V", "S", "N"}
    enabled_modal_set = (
        set(enabled_modalities)
        if enabled_modalities is not None
        else {"CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"}
    )
    topk_ratio = float(PIPELINE_META.get("sn_topk_ratio", 0.2))
    topk_min = int(PIPELINE_META.get("sn_topk_min", 3))

    empty = (
        "### Lỗi\nVideo không hợp lệ hoặc xử lý thất bại.",
        "",
        "",
        "",
        None,
        None,
        [],
        [],
        [],
    )
    if isinstance(video_path, dict):
        video_path = video_path.get("path") or video_path.get("name")
    if not video_path:
        return empty

    try:
        t0 = time.time()
        load_common_models()

        frames = sample_video_frames(Path(video_path), max_frames=64)
        if not frames:
            return empty

        clip_feat = extract_clip_features(frames, MODEL_CACHE["processor"], MODEL_CACHE["clip"], DEVICE, batch_size=8)
        flow_feat = compute_flow_features(frames).astype(np.float32)
        yolo_weapon, yolo_medical, yolo_details = run_yolo_with_details(frames, MODEL_CACHE["yolo"])

        gore_probs = batch_expert_probs(frames, MODEL_CACHE["gore"], gore_val_transform(is_train=False))
        # SELFHARM DISABLED — always return zeros
        selfharm_probs = np.zeros((len(frames), 1), dtype=np.float32)
        nsfw_probs = batch_expert_probs(frames, MODEL_CACHE["nsfw"], nsfw_val_transform())

        clip_f_raw, flow_f_raw, yolo_w_raw, gore_p_raw, sh_p_raw, nsfw_p_raw = pad_to_match(
            [clip_feat, flow_feat, yolo_weapon, gore_probs, selfharm_probs, nsfw_probs]
        )
        clip_f, flow_f, yolo_w, gore_p, sh_p, nsfw_p = apply_modality_toggles(
            clip_f_raw, flow_f_raw, yolo_w_raw, gore_p_raw, sh_p_raw, nsfw_p_raw, enabled_modal_set
        )

        v_attn = np.zeros((len(frames),), dtype=np.float32)
        s_attn = np.zeros((len(frames),), dtype=np.float32)
        n_attn = np.zeros((len(frames),), dtype=np.float32)

        if model_variant == "V7 VideoMAE-LoRA":
            load_task_model_v7()
            v7_args = MODEL_CACHE.get("v7_args", {}) or {}
            v7_num_frames = int(v7_args.get("num_frames", 16))
            v7_image_size = int(v7_args.get("image_size", 224))
            x_v7 = prepare_v7_pixel_values(
                frames=frames,
                num_frames=v7_num_frames,
                image_size=v7_image_size,
                clip_enabled=("CLIP" in enabled_modal_set),
            )
            aux_summary = build_v7_aux_summary(flow_f, yolo_w, gore_p, sh_p, nsfw_p)
            aux_t = torch.from_numpy(aux_summary).to(DEVICE)
            task_v7 = MODEL_CACHE["task_v7"]

            with torch.no_grad():
                v_logit, s_logit, n_logit = task_v7(x_v7, aux_t)
                v_prob = float(torch.sigmoid(v_logit)[0].item())
                s_prob = float(torch.sigmoid(s_logit)[0].item())
                n_prob = float(torch.sigmoid(n_logit)[0].item())
                v_ablation = compute_v7_ablation(task_v7, x_v7, aux_t)

            # V7 does not expose token-level attentions in this implementation.
            v_attn = normalize01((0.5 * yolo_w[:, 0] + 0.5 * gore_p[:, 0]).astype(np.float32))
            s_attn = normalize01(sh_p[:, 0].astype(np.float32))
            n_attn = normalize01(nsfw_p[:, 0].astype(np.float32)
            )
        else:
            load_task_model_v6()
            with torch.no_grad():
                x = torch.from_numpy(clip_f).unsqueeze(0).to(DEVICE)
                flow_t = torch.from_numpy(flow_f).unsqueeze(0).to(DEVICE)
                yolo_t = torch.from_numpy(yolo_w).unsqueeze(0).to(DEVICE)
                gore_t = torch.from_numpy(gore_p).unsqueeze(0).to(DEVICE)
                selfharm_t = torch.from_numpy(sh_p).unsqueeze(0).to(DEVICE)
                nsfw_t = torch.from_numpy(nsfw_p).unsqueeze(0).to(DEVICE)

                v_logit, s_score, n_score, saliency = MODEL_CACHE["task_v6"](
                    x, flow_t, yolo_t, gore_t, nsfw_t, selfharm_t
                )
                v_prob = float(torch.sigmoid(v_logit)[0, 0].item())
                s_prob = float(s_score[0].item())
                n_prob = float(n_score[0].item())
                v_ablation = compute_v_ablation(
                    MODEL_CACHE["task_v6"], x, flow_t, yolo_t, gore_t, nsfw_t, selfharm_t
                )
                v_attn = saliency["violence"][0].detach().cpu().numpy()
                s_attn = saliency["self_harm"][0].detach().cpu().numpy()
                n_attn = saliency["nsfw"][0].detach().cpu().numpy()

        if apply_guard:
            v_effective, guard_info = apply_clip_dominant_nsfw_guard(
                v_prob=v_prob,
                n_prob=n_prob,
                thresh_v=thresh_v,
                yolo_weapon=yolo_w,
                gore_p=gore_p,
                nsfw_p=nsfw_p,
                flow_f=flow_f,
                v_ablation=v_ablation,
            )
        else:
            v_effective = v_prob
            guard_info = {
                "fired": False,
                "clip_dominant": False,
                "weak_violence_evidence": False,
                "nsfw_context": False,
                "yolo_max": float(yolo_w.max()) if yolo_w.size else 0.0,
                "gore_max": float(gore_p.max()) if gore_p.size else 0.0,
                "nsfw_max": float(nsfw_p.max()) if nsfw_p.size else 0.0,
                "flow_mean": float(flow_f[:, 0].mean()) if flow_f.ndim == 2 and flow_f.shape[1] > 0 else 0.0,
            }

        v_peak_idx = int(np.argmax(v_attn)) if v_attn.size else 0
        s_peak_idx = int(np.argmax(sh_p[:, 0])) if sh_p.size else 0
        n_peak_idx = int(np.argmax(nsfw_p[:, 0])) if nsfw_p.size else 0
        s_mean = float(sh_p.mean()) if sh_p.size else 0.0
        s_std = float(sh_p.std()) if sh_p.size else 0.0
        n_mean = float(nsfw_p.mean()) if nsfw_p.size else 0.0
        n_std = float(nsfw_p.std()) if nsfw_p.size else 0.0

        verdict_flags: list[str] = []
        if "V" in enabled_branch_set and v_effective >= thresh_v:
            verdict_flags.append("Violence")
        if "S" in enabled_branch_set and s_prob >= thresh_s:
            verdict_flags.append("Self-harm")
        if "N" in enabled_branch_set and n_prob >= thresh_n:
            verdict_flags.append("NSFW")

        is_flagged = bool(verdict_flags)
        verdict = "🔴 VI PHẠM (FLAGGED)" if is_flagged else "🟢 AN TOÀN (SAFE)"
        reasons = ", ".join(verdict_flags) if verdict_flags else "Không có nhãn nào vượt ngưỡng"
        verdict_md = f"## {verdict}\n**Lý do:** {reasons}"

        branch_state = f"V={'ON' if 'V' in enabled_branch_set else 'OFF'} | S={'ON' if 'S' in enabled_branch_set else 'OFF'} | N={'ON' if 'N' in enabled_branch_set else 'OFF'}"
        modality_state = (
            f"CLIP={'ON' if 'CLIP' in enabled_modal_set else 'OFF'} | "
            f"Flow={'ON' if 'Flow' in enabled_modal_set else 'OFF'} | "
            f"YOLO={'ON' if 'YOLO' in enabled_modal_set else 'OFF'} | "
            f"Gore={'ON' if 'Gore' in enabled_modal_set else 'OFF'} | "
            f"SelfHarm={'ON' if 'SelfHarm' in enabled_modal_set else 'OFF'} | "
            f"NSFW={'ON' if 'NSFW' in enabled_modal_set else 'OFF'}"
        )
        aux_ablation_line = ""
        if "no_aux" in v_ablation:
            aux_ablation_line = (
                f"- V khi tắt toàn bộ AUX: **{v_ablation['no_aux']:.4f}** "
                f"(delta={v_ablation['delta_aux']:+.4f})\n"
            )

        score_md = (
            "### Điểm dự đoán\n"
            f"- Model variant: **{model_variant}**\n"
            f"- Threshold source: **{threshold_source}**\n"
            f"- Calibration thresholds: V={thresh_v:.4f} | S={thresh_s:.4f} | N={thresh_n:.4f}\n"
            f"- Branch toggles: {branch_state}\n"
            f"- Modality toggles: {modality_state}\n"
            f"- Violence raw: **{v_prob:.4f}** | effective: **{v_effective:.4f}** | peak frame: **{v_peak_idx}**\n"
            f"- Self-harm score: **{s_prob:.4f}** | peak frame: **{s_peak_idx}** | frame mean/std: **{s_mean:.4f} / {s_std:.4f}**\n"
            f"- NSFW score: **{n_prob:.4f}** | peak frame: **{n_peak_idx}** | frame mean/std: **{n_mean:.4f} / {n_std:.4f}**\n"
            "### V token / S token / N token diagnostics\n"
            "- V token gallery bên dưới hiển thị các frame có attention cao nhất của nhánh Violence.\n"
            "- S token gallery dùng attention x self-harm expert probability để xếp hạng frame.\n"
            "- N token gallery dùng attention x NSFW expert probability để xếp hạng frame.\n"
            f"- V7 note: {'Dùng pseudo attention từ expert vì V7 hiện không trả token-attn.' if model_variant == 'V7 VideoMAE-LoRA' else 'Token-attn là output thật của V6 gate.'}\n"
            "### V-Token Ablation (debug)\n"
            f"- Base V: **{v_ablation['base']:.4f}**\n"
            f"- V khi tắt Flow: **{v_ablation['no_flow']:.4f}** (delta={v_ablation['delta_flow']:+.4f})\n"
            f"- V khi tắt Gore: **{v_ablation['no_gore']:.4f}** (delta={v_ablation['delta_gore']:+.4f})\n"
            f"- V khi tắt YOLO: **{v_ablation['no_yolo']:.4f}** (delta={v_ablation['delta_yolo']:+.4f})\n"
            f"- V khi tắt CLIP: **{v_ablation['no_clip']:.4f}** (delta={v_ablation['delta_clip']:+.4f})\n"
            f"- V khi tắt SelfHarm: **{v_ablation['no_selfharm']:.4f}** (delta={v_ablation['delta_selfharm']:+.4f})\n"
            f"{aux_ablation_line}"
            "### Clip-Dominant NSFW Guard\n"
            f"- Guard enabled: **{bool(apply_guard)}**\n"
            f"- Guard fired: **{guard_info['fired']}**\n"
            f"- clip_dominant={guard_info['clip_dominant']} | weak_violence_evidence={guard_info['weak_violence_evidence']} | nsfw_context={guard_info['nsfw_context']}\n"
            f"- flow_mean={guard_info['flow_mean']:.4f} | yolo_max={guard_info['yolo_max']:.4f} | gore_max={guard_info['gore_max']:.4f} | nsfw_max={guard_info['nsfw_max']:.4f}\n"
            f"- Frames used: **{len(frames)}**\n"
            f"- Device: **{DEVICE.type}**\n"
            f"- Runtime: **{time.time() - t0:.2f}s**"
        )

        sn_debug = compute_sn_coupling_debug(
            sh_probs=sh_p[:, 0] if sh_p.ndim == 2 else sh_p,
            nsfw_probs=nsfw_p[:, 0] if nsfw_p.ndim == 2 else nsfw_p,
            s_attn=(s_attn if model_variant == "V6 Task-Gated" else None),
            n_attn=(n_attn if model_variant == "V6 Task-Gated" else None),
            topk_ratio=topk_ratio,
            topk_min=topk_min,
        )
        debug_md = (
            "### S/N Coupling Debug\n"
            f"- Pearson corr(selfharm_prob, nsfw_prob): **{sn_debug['corr']:.4f}**\n"
            f"- Pooling config: topk_ratio={topk_ratio:.2f}, topk_min={topk_min}\n"
            f"- S score recompute: **{sn_debug['s']['score']:.4f}** | k={sn_debug['s']['k']} | "
            f"top_ids={sn_debug['s']['top_ids'][:8]} | top_vals={[round(v, 4) for v in sn_debug['s']['top_vals'][:8]]}\n"
            f"- N score recompute: **{sn_debug['n']['score']:.4f}** | k={sn_debug['n']['k']} | "
            f"top_ids={sn_debug['n']['top_ids'][:8]} | top_vals={[round(v, 4) for v in sn_debug['n']['top_vals'][:8]]}\n"
            f"- S/N top-k overlap ratio: **{sn_debug['overlap_ratio']:.4f}** | overlap_ids={sn_debug['overlap_ids'][:12]}\n"
            f"- SelfHarm frame stats: mean={sn_debug['s']['mean']:.4f}, std={sn_debug['s']['std']:.4f}, max={sn_debug['s']['max']:.4f}\n"
            f"- NSFW frame stats: mean={sn_debug['n']['mean']:.4f}, std={sn_debug['n']['std']:.4f}, max={sn_debug['n']['max']:.4f}"
        )

        yolo_md = make_yolo_markdown(yolo_w_raw, yolo_medical, yolo_details)
        best_yolo_idx = int(np.argmax(yolo_w_raw[:, 0])) if yolo_w_raw.size else 0
        yolo_img = draw_yolo_boxes(frames[best_yolo_idx], yolo_details[best_yolo_idx]) if yolo_details else frames[0]

        attn_plot = build_attention_plot(v_attn, s_attn, n_attn, sh_p[:, 0], nsfw_p[:, 0])

        v_gallery, _ = build_token_gallery(
            frames=frames,
            token_name="V",
            attn=v_attn,
            expert_probs=None,
            yolo_details=yolo_details,
            top_k=int(top_k),
        )

        s_gallery, _ = build_token_gallery(
            frames=frames,
            token_name="S",
            attn=s_attn,
            expert_probs=sh_p,
            yolo_details=yolo_details,
            top_k=int(top_k),
        )
        n_gallery, _ = build_token_gallery(
            frames=frames,
            token_name="N",
            attn=n_attn,
            expert_probs=nsfw_p,
            yolo_details=yolo_details,
            top_k=int(top_k),
        )

        return verdict_md, score_md, yolo_md, debug_md, yolo_img, attn_plot, v_gallery, s_gallery, n_gallery
    except Exception as exc:
        return (
            f"## Lỗi xử lý\n`{exc}`",
            "",
            "",
            "",
            None,
            None,
            [],
            [],
            [],
        )


def process_image(
    image_path: str,
    apply_guard: bool,
    model_variant: str,
    enabled_branches: list[str],
    enabled_modalities: list[str],
):
    """Process a single image through the moderation pipeline."""
    thresholds, threshold_source = get_thresholds_for_variant(model_variant)
    thresh_v = _coerce_float(thresholds.get("thresh_v", 0.5))
    thresh_s = _coerce_float(thresholds.get("thresh_s", 0.5))
    thresh_n = _coerce_float(thresholds.get("thresh_n", 0.5))
    enabled_branch_set = set(enabled_branches) if enabled_branches is not None else {"V", "S", "N"}
    enabled_modal_set = (
        set(enabled_modalities)
        if enabled_modalities is not None
        else {"CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"}
    )

    empty = (
        "### Error\nImage is invalid or processing failed.",
        "",
        "",
        None,
        None,
        [],
        [],
        [],
    )

    if isinstance(image_path, dict):
        image_path = image_path.get("path") or image_path.get("name") or image_path.get("url")
    if not image_path:
        return empty

    try:
        t0 = time.time()
        load_common_models()

        img = Image.open(image_path).convert("RGB")
        frames = [img]
        n_frames = 1

        clip_feat = extract_clip_features(frames, MODEL_CACHE["processor"], MODEL_CACHE["clip"], DEVICE, batch_size=1)
        flow_feat = np.zeros((1, 3), dtype=np.float32)
        yolo_weapon, yolo_medical, yolo_details = run_yolo_with_details(frames, MODEL_CACHE["yolo"])

        gore_probs = batch_expert_probs(frames, MODEL_CACHE["gore"], gore_val_transform(is_train=False))
        # SELFHARM DISABLED — always return zeros
        selfharm_probs = np.zeros((len(frames), 1), dtype=np.float32)
        nsfw_probs = batch_expert_probs(frames, MODEL_CACHE["nsfw"], nsfw_val_transform())

        clip_f_raw, flow_f_raw, yolo_w_raw, gore_p_raw, sh_p_raw, nsfw_p_raw = pad_to_match(
            [clip_feat, flow_feat, yolo_weapon, gore_probs, selfharm_probs, nsfw_probs]
        )
        clip_f, flow_f, yolo_w, gore_p, sh_p, nsfw_p = apply_modality_toggles(
            clip_f_raw, flow_f_raw, yolo_w_raw, gore_p_raw, sh_p_raw, nsfw_p_raw, enabled_modal_set
        )

        v_attn = np.zeros((n_frames,), dtype=np.float32)
        s_attn = np.zeros((n_frames,), dtype=np.float32)
        n_attn = np.zeros((n_frames,), dtype=np.float32)

        if model_variant == "V7 VideoMAE-LoRA":
            load_task_model_v7()
            v7_args = MODEL_CACHE.get("v7_args", {}) or {}
            v7_num_frames = int(v7_args.get("num_frames", 16))
            v7_image_size = int(v7_args.get("image_size", 224))
            x_v7 = prepare_v7_pixel_values(
                frames=frames,
                num_frames=v7_num_frames,
                image_size=v7_image_size,
                clip_enabled=("CLIP" in enabled_modal_set),
            )
            aux_summary = build_v7_aux_summary(flow_f, yolo_w, gore_p, sh_p, nsfw_p)
            aux_t = torch.from_numpy(aux_summary).to(DEVICE)
            task_v7 = MODEL_CACHE["task_v7"]

            with torch.no_grad():
                v_logit, s_logit, n_logit = task_v7(x_v7, aux_t)
                v_prob = float(torch.sigmoid(v_logit)[0].item())
                s_prob = float(torch.sigmoid(s_logit)[0].item())
                n_prob = float(torch.sigmoid(n_logit)[0].item())
                v_ablation = compute_v7_ablation(task_v7, x_v7, aux_t)

            v_attn = normalize01((0.5 * yolo_w[:, 0] + 0.5 * gore_p[:, 0]).astype(np.float32))
            s_attn = normalize01(sh_p[:, 0].astype(np.float32))
            n_attn = normalize01(nsfw_p[:, 0].astype(np.float32))
        else:
            load_task_model_v6()
            with torch.no_grad():
                x = torch.from_numpy(clip_f).unsqueeze(0).to(DEVICE)
                flow_t = torch.from_numpy(flow_f).unsqueeze(0).to(DEVICE)
                yolo_t = torch.from_numpy(yolo_w).unsqueeze(0).to(DEVICE)
                gore_t = torch.from_numpy(gore_p).unsqueeze(0).to(DEVICE)
                selfharm_t = torch.from_numpy(sh_p).unsqueeze(0).to(DEVICE)
                nsfw_t = torch.from_numpy(nsfw_p).unsqueeze(0).to(DEVICE)

                v_logit, s_score, n_score, saliency = MODEL_CACHE["task_v6"](
                    x, flow_t, yolo_t, gore_t, nsfw_t, selfharm_t
                )
                v_prob = float(torch.sigmoid(v_logit)[0, 0].item())
                s_prob = float(s_score[0].item())
                n_prob = float(n_score[0].item())
                v_ablation = compute_v_ablation(
                    MODEL_CACHE["task_v6"], x, flow_t, yolo_t, gore_t, nsfw_t, selfharm_t
                )
                v_attn = saliency["violence"][0].detach().cpu().numpy()
                s_attn = saliency["self_harm"][0].detach().cpu().numpy()
                n_attn = saliency["nsfw"][0].detach().cpu().numpy()

        if apply_guard:
            v_effective, guard_info = apply_clip_dominant_nsfw_guard(
                v_prob=v_prob, n_prob=n_prob, thresh_v=thresh_v,
                yolo_weapon=yolo_w, gore_p=gore_p, nsfw_p=nsfw_p,
                flow_f=flow_f, v_ablation=v_ablation,
            )
        else:
            v_effective = v_prob
            guard_info = {
                "fired": False, "clip_dominant": False,
                "weak_violence_evidence": False, "nsfw_context": False,
                "yolo_max": float(yolo_w.max()) if yolo_w.size else 0.0,
                "gore_max": float(gore_p.max()) if gore_p.size else 0.0,
                "nsfw_max": float(nsfw_p.max()) if nsfw_p.size else 0.0,
                "flow_mean": 0.0,
            }

        verdict_flags: list[str] = []
        if "V" in enabled_branch_set and v_effective >= thresh_v:
            verdict_flags.append("Violence")
        if "S" in enabled_branch_set and s_prob >= thresh_s:
            verdict_flags.append("Self-harm")
        if "N" in enabled_branch_set and n_prob >= thresh_n:
            verdict_flags.append("NSFW")

        is_flagged = bool(verdict_flags)
        verdict_str = "FLAGGED" if is_flagged else "SAFE"
        reasons = ", ".join(verdict_flags) if verdict_flags else "No label exceeds threshold"
        verdict_md = f"## {verdict_str}\n**Reason:** {reasons}"

        branch_state = f"V={'ON' if 'V' in enabled_branch_set else 'OFF'} | S={'ON' if 'S' in enabled_branch_set else 'OFF'} | N={'ON' if 'N' in enabled_branch_set else 'OFF'}"
        modality_state = (
            f"CLIP={'ON' if 'CLIP' in enabled_modal_set else 'OFF'} | "
            f"Flow={'ON' if 'Flow' in enabled_modal_set else 'OFF'} | "
            f"YOLO={'ON' if 'YOLO' in enabled_modal_set else 'OFF'} | "
            f"Gore={'ON' if 'Gore' in enabled_modal_set else 'OFF'} | "
            f"SelfHarm={'ON' if 'SelfHarm' in enabled_modal_set else 'OFF'} | "
            f"NSFW={'ON' if 'NSFW' in enabled_modal_set else 'OFF'}"
        )
        aux_ablation_line = ""
        if "no_aux" in v_ablation:
            aux_ablation_line = (
                f"- V with all AUX off: **{v_ablation['no_aux']:.4f}** "
                f"(delta={v_ablation['delta_aux']:+.4f})\n"
            )

        score_md = (
            "### Prediction Scores\n"
            f"- Model variant: **{model_variant}**\n"
            f"- Input type: **Image** (single frame, no temporal features)\n"
            f"- Threshold source: **{threshold_source}**\n"
            f"- Calibration thresholds: V={thresh_v:.4f} | S={thresh_s:.4f} | N={thresh_n:.4f}\n"
            f"- Branch toggles: {branch_state}\n"
            f"- Modality toggles: {modality_state}\n"
            f"- Violence raw: **{v_prob:.4f}** | effective: **{v_effective:.4f}**\n"
            f"- Self-harm score: **{s_prob:.4f}**\n"
            f"- NSFW score: **{n_prob:.4f}**\n"
            "### V-Token Ablation (debug)\n"
            f"- Base V: **{v_ablation['base']:.4f}**\n"
            f"- V w/o Flow: **{v_ablation['no_flow']:.4f}** (delta={v_ablation['delta_flow']:+.4f})\n"
            f"- V w/o Gore: **{v_ablation['no_gore']:.4f}** (delta={v_ablation['delta_gore']:+.4f})\n"
            f"- V w/o YOLO: **{v_ablation['no_yolo']:.4f}** (delta={v_ablation['delta_yolo']:+.4f})\n"
            f"- V w/o CLIP: **{v_ablation['no_clip']:.4f}** (delta={v_ablation['delta_clip']:+.4f})\n"
            f"- V w/o SelfHarm: **{v_ablation['no_selfharm']:.4f}** (delta={v_ablation['delta_selfharm']:+.4f})\n"
            f"{aux_ablation_line}"
            "### Clip-Dominant NSFW Guard\n"
            f"- Guard enabled: **{bool(apply_guard)}**\n"
            f"- Guard fired: **{guard_info['fired']}**\n"
            f"- clip_dominant={guard_info['clip_dominant']} | weak_violence_evidence={guard_info['weak_violence_evidence']} | nsfw_context={guard_info['nsfw_context']}\n"
            f"- Device: **{DEVICE.type}**\n"
            f"- Runtime: **{time.time() - t0:.2f}s**"
        )

        yolo_md = make_yolo_markdown(yolo_w_raw, yolo_medical, yolo_details)
        yolo_img = draw_yolo_boxes(frames[0], yolo_details[0]) if yolo_details else frames[0]

        attn_plot = build_attention_plot(v_attn, s_attn, n_attn, sh_p[:, 0], nsfw_p[:, 0])

        v_gallery, _ = build_token_gallery(
            frames=frames, token_name="V", attn=v_attn,
            expert_probs=None, yolo_details=yolo_details, top_k=1,
        )
        s_gallery, _ = build_token_gallery(
            frames=frames, token_name="S", attn=s_attn,
            expert_probs=sh_p, yolo_details=yolo_details, top_k=1,
        )
        n_gallery, _ = build_token_gallery(
            frames=frames, token_name="N", attn=n_attn,
            expert_probs=nsfw_p, yolo_details=yolo_details, top_k=1,
        )

        return verdict_md, score_md, yolo_md, yolo_img, attn_plot, v_gallery, s_gallery, n_gallery
    except Exception as exc:
        return (
            f"## Processing Error\n`{exc}`",
            "", "", None, None, [], [], [],
        )


# ═══════════════════════════════════════════════════════════════
# IMAGE MODERATION (ViT Violence + ViT NSFW, sequential pipeline)
# ═══════════════════════════════════════════════════════════════

VIT_VIOLENCE_MODEL = "jaranohaal/vit-base-violence-detection"
VIT_NSFW_MODEL = "AdamCodd/vit-base-nsfw-detector"


def load_vit_models():
    if MODEL_CACHE.get("vit_loaded", False):
        return
    from transformers import ViTForImageClassification, ViTImageProcessor
    from safetensors.torch import load_file as st_load_file
    from huggingface_hub import hf_hub_download

    # --- Violence model: checkpoint uses non-standard key names (blocks.*)
    # Must manually remap to ViTForImageClassification format (vit.encoder.layer.*)
    print("  [ViT] Loading ViT Violence classifier (with key remapping)...")
    violence_model = ViTForImageClassification.from_pretrained(VIT_VIOLENCE_MODEL, ignore_mismatched_sizes=True)
    ckpt_path = hf_hub_download(repo_id=VIT_VIOLENCE_MODEL, filename="model.safetensors")
    raw_ckpt = st_load_file(ckpt_path)

    # Remap keys: blocks.* → vit.encoder.layer.*
    remapped = {}
    for k, v in raw_ckpt.items():
        if k.startswith("blocks."):
            parts = k.split(".", 2)
            idx = parts[1]
            rest = parts[2]
            if rest.startswith("attn.qkv."):
                suffix = rest.replace("attn.qkv.", "")
                dim = v.shape[0] // 3
                remapped[f"vit.encoder.layer.{idx}.attention.attention.query.{suffix}"] = v[:dim]
                remapped[f"vit.encoder.layer.{idx}.attention.attention.key.{suffix}"] = v[dim:2*dim]
                remapped[f"vit.encoder.layer.{idx}.attention.attention.value.{suffix}"] = v[2*dim:]
            elif rest.startswith("attn.proj."):
                remapped[f"vit.encoder.layer.{idx}.attention.output.dense.{rest.replace('attn.proj.', '')}"] = v
            elif rest.startswith("norm1."):
                remapped[f"vit.encoder.layer.{idx}.layernorm_before.{rest.replace('norm1.', '')}"] = v
            elif rest.startswith("norm2."):
                remapped[f"vit.encoder.layer.{idx}.layernorm_after.{rest.replace('norm2.', '')}"] = v
            elif rest.startswith("mlp.fc1."):
                remapped[f"vit.encoder.layer.{idx}.intermediate.dense.{rest.replace('mlp.fc1.', '')}"] = v
            elif rest.startswith("mlp.fc2."):
                remapped[f"vit.encoder.layer.{idx}.output.dense.{rest.replace('mlp.fc2.', '')}"] = v
        elif k == "patch_embed.proj.weight":
            remapped["vit.embeddings.patch_embeddings.projection.weight"] = v
        elif k == "patch_embed.proj.bias":
            remapped["vit.embeddings.patch_embeddings.projection.bias"] = v
        elif k == "cls_token":
            remapped["vit.embeddings.cls_token"] = v
        elif k == "pos_embed":
            remapped["vit.embeddings.position_embeddings"] = v
        elif k == "norm.weight":
            remapped["vit.layernorm.weight"] = v
        elif k == "norm.bias":
            remapped["vit.layernorm.bias"] = v
        elif k == "head.weight":
            remapped["classifier.weight"] = v
        elif k == "head.bias":
            remapped["classifier.bias"] = v

    missing, unexpected = violence_model.load_state_dict(remapped, strict=False)
    violence_model.eval()
    violence_processor = ViTImageProcessor.from_pretrained(VIT_VIOLENCE_MODEL)
    print(f"  [ViT] Violence model loaded: {len(remapped)} keys remapped, {len(missing)} missing, {len(unexpected)} unexpected")

    # --- NSFW model: standard format, load normally
    print("  [ViT] Loading ViT NSFW classifier...")
    nsfw_pipe = hf_pipeline("image-classification", model=VIT_NSFW_MODEL, device=DEVICE)

    MODEL_CACHE.update({
        "vit_loaded": True,
        "vit_violence_model": violence_model,
        "vit_violence_processor": violence_processor,
        "vit_nsfw": nsfw_pipe,
    })


def process_image_vit(image_path: str):
    """Process image with sequential ViT pipeline: Violence first, then NSFW if safe."""
    empty = ("### Error\nImage is invalid or processing failed.", "", None)

    if isinstance(image_path, dict):
        image_path = image_path.get("path") or image_path.get("name") or image_path.get("url")
    if not image_path:
        return empty

    try:
        t0 = time.time()
        load_vit_models()
        img = Image.open(image_path).convert("RGB")

        # Thresholds
        thresh_v_ban = 0.80   # violence ban
        thresh_n_ban = 0.90   # nudity ban
        thresh_blur = 0.60    # both: blur threshold

        # STEP 1: Violence detection (manually remapped weights)
        violence_model = MODEL_CACHE["vit_violence_model"]
        violence_proc = MODEL_CACHE["vit_violence_processor"]
        v_inputs = violence_proc(images=img, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            v_logits = violence_model(**v_inputs).logits
            v_probs = torch.softmax(v_logits, dim=1).squeeze()
        v_prob = float(v_probs[1].item())
        violence_results = [
            {"label": "non-violence", "score": float(v_probs[0].item())},
            {"label": "violence", "score": v_prob},
        ]

        # STEP 2: NSFW detection (always run)
        nsfw_results = MODEL_CACHE["vit_nsfw"](img, top_k=5)
        nsfw_scores = {r["label"].lower(): r["score"] for r in nsfw_results}
        nsfw_prob = nsfw_scores.get("nsfw", 0.0)

        # Verdict logic
        verdict_flags: list[str] = []
        if v_prob >= thresh_v_ban:
            verdict_flags.append("Violence (ban)")
        if nsfw_prob >= thresh_n_ban:
            verdict_flags.append("NSFW (nudity ban)")
        if not verdict_flags:
            if v_prob >= thresh_blur:
                verdict_flags.append("Violence (blur)")
            if nsfw_prob >= thresh_blur:
                verdict_flags.append("NSFW (blur)")
        verdict_str = "FLAGGED" if verdict_flags else "SAFE"
        reasons = ", ".join(verdict_flags) if verdict_flags else "No label exceeds threshold"
        verdict_md = f"## {verdict_str}\n**Reason:** {reasons}"

        # Build output
        nsfw_10 = round(nsfw_prob * 10, 1)
        v_10 = round(v_prob * 10, 1)

        violence_detail = "\n".join(f"  - {r['label']}: {r['score']:.4f}" for r in violence_results)
        nsfw_detail = "\n".join(f"  - {r['label']}: {r['score']:.4f}" for r in nsfw_results) if nsfw_results else "  - SKIPPED (violence detected)"

        score_md = (
            "### Image Moderation Scores (ViT Pipeline)\n"
            f"- Model Violence: **{VIT_VIOLENCE_MODEL}**\n"
            f"- Model NSFW: **{VIT_NSFW_MODEL}**\n"
            f"- **Violence probability: {v_prob:.4f}** (1-10: {v_10})\n"
            f"- **NSFW probability: {nsfw_prob:.4f}** (1-10: {nsfw_10})\n"
            f"- NSFW skipped: False\n"
            f"- Violence threshold (ban): {thresh_v_ban:.2f}\n"
            f"- NSFW threshold (blur): {thresh_blur:.2f} | NSFW threshold (ban): {thresh_n_ban:.2f}\n"
            "### Violence detail\n"
            f"{violence_detail}\n"
            "### NSFW detail\n"
            f"{nsfw_detail}\n"
            f"- Runtime: **{time.time() - t0:.2f}s**"
        )

        return verdict_md, score_md, img

    except Exception as exc:
        return (f"## Processing Error\n`{exc}`", "", None)


with gr.Blocks(title="Video & Image Moderation Debug Lab (V6 + V7)", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# Video & Image Moderation Debug Lab (V6 + V7)")
    gr.Markdown(
        "Analyze videos and images for Violence / Self-harm / NSFW content. "
        "Toggle prediction branches and input modalities for debugging."
    )
    gr.Markdown(PIPELINE_SUMMARY_MD)

    with gr.Tabs():
        # ─── VIDEO TAB ──────────────────────────────────────────────
        with gr.Tab("Video Analysis"):
            with gr.Row():
                with gr.Column(scale=1):
                    video_input = gr.Video(label="Input video", include_audio=False)
                    vid_model_variant = gr.Radio(
                        choices=list(MODEL_VARIANTS),
                        value="V6 Task-Gated",
                        label="Model variant",
                    )
                    vid_enabled_branches = gr.CheckboxGroup(
                        choices=["V", "S", "N"],
                        value=["V", "S", "N"],
                        label="Enable/Disable branches (V/S/N)",
                    )
                    vid_enabled_modalities = gr.CheckboxGroup(
                        choices=["CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"],
                        value=["CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"],
                        label="Enable/Disable input modalities",
                    )
                    vid_top_k = gr.Slider(2, 12, value=6, step=1, label="Top-K frames for S/N token")
                    vid_apply_guard = gr.Checkbox(
                        value=True,
                        label="Enable guard: reduce false-positive Violence when clip-dominant + NSFW context",
                    )
                    vid_run_btn = gr.Button("Run Video Inference", variant="primary")

                with gr.Column(scale=1):
                    vid_verdict_out = gr.Markdown()
                    vid_score_out = gr.Markdown()
                    vid_yolo_metrics_out = gr.Markdown()
                    vid_debug_out = gr.Markdown()

            with gr.Row():
                vid_yolo_img_out = gr.Image(label="YOLO frame (max weapon confidence)", type="pil")
                vid_attn_plot_out = gr.Image(label="Temporal attention + expert score", type="pil")

            with gr.Row():
                vid_v_gallery_out = gr.Gallery(label="V token focus frames", columns=3, height=420)
                vid_s_gallery_out = gr.Gallery(label="S token focus frames", columns=3, height=420)
                vid_n_gallery_out = gr.Gallery(label="N token focus frames", columns=3, height=420)

            vid_run_btn.click(
                fn=process_video,
                inputs=[video_input, vid_top_k, vid_apply_guard, vid_model_variant, vid_enabled_branches, vid_enabled_modalities],
                outputs=[vid_verdict_out, vid_score_out, vid_yolo_metrics_out, vid_debug_out, vid_yolo_img_out, vid_attn_plot_out, vid_v_gallery_out, vid_s_gallery_out, vid_n_gallery_out],
            )

        # ─── IMAGE TAB (ViT-based) ────────────────────────────────
        with gr.Tab("Image Analysis (ViT)"):
            with gr.Row():
                with gr.Column(scale=1):
                    image_input = gr.Image(label="Input image", type="filepath")
                    img_run_btn = gr.Button("Run Image Inference", variant="primary")

                with gr.Column(scale=1):
                    img_verdict_out = gr.Markdown()
                    img_score_out = gr.Markdown()

            with gr.Row():
                img_preview_out = gr.Image(label="Input preview", type="pil")

            img_run_btn.click(
                fn=process_image_vit,
                inputs=[image_input],
                outputs=[img_verdict_out, img_score_out, img_preview_out],
            )


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, share=False)
