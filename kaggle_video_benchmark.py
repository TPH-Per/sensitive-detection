# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  KAGGLE VIDEO BENCHMARK — sensitive-detection Pipeline                      ║
# ║  Clone repo → Install deps → Discover dataset → Run inference → Metrics     ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
#
# INSTRUCTIONS:
# 1. Add your video dataset to Kaggle (violent/ + non-violent/ folders)
# 2. Create a new Kaggle notebook with GPU (T4)
# 3. Add your dataset as a data source
# 4. Paste this entire file into a cell and run
#
# ─── CELL 1: Clone repo & install dependencies ────────────────────────────────

import os, sys

# Clone the repo
REPO_URL = "https://github.com/TPH-Per/sensitive-detection.git"
REPO_DIR = "/kaggle/working/sensitive-detection"

if not os.path.exists(os.path.join(REPO_DIR, "app.py")):
    print("Cloning repo...")
    !git clone --depth 1 {REPO_URL} {REPO_DIR}
else:
    print("Repo already cloned, pulling latest...")
    !cd {REPO_DIR} && git pull

# Install dependencies
print("\nInstalling dependencies...")
!pip install -q gradio transformers safetensors huggingface_hub nudenet opencv-python-headless scikit-learn seaborn pandas matplotlib

# Verify GPU
import torch
print(f"\nPyTorch: {torch.__version__}")
print(f"CUDA: {torch.cuda.is_available()} — {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'}")
print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB" if torch.cuda.is_available() else "")

# ─── CELL 2: Benchmark ────────────────────────────────────────────────────────

import sys, time, os, json, subprocess, importlib.util
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns
import torch
from pathlib import Path
from sklearn.metrics import (
    accuracy_score, confusion_matrix, roc_auc_score, f1_score
)

# ── Load app.py via importlib (avoids 'app' name conflict) ────────────────────
_APP_DIR = REPO_DIR
sys.path.insert(0, _APP_DIR)
_spec = importlib.util.spec_from_file_location("pipeline_app", os.path.join(_APP_DIR, "app.py"))
pipeline_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pipeline_app)

run_v2_inference = pipeline_app.run_v2_inference
load_vit_models  = pipeline_app.load_vit_models
DEVICE           = pipeline_app.DEVICE

# ── CONFIG ────────────────────────────────────────────────────────────────────
KAGGLE_INPUT     = Path("/kaggle/input")
RESULTS_DIR      = Path("/kaggle/working/results")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_EXTS       = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"}
MAX_PER_CLASS    = 150
THRESHOLDS       = {"violence": 0.50, "nsfw": 0.50}

# ── DISCOVER VIDEO DATASET ────────────────────────────────────────────────────
print("=" * 65)
print("  VIDEO BENCHMARK — sensitive-detection Pipeline")
print(f"  Device: {DEVICE}")
print("=" * 65)

def collect_videos(label_dirs, max_n):
    paths = []
    for d in label_dirs:
        if not d.exists():
            continue
        vids = sorted([str(f) for f in d.rglob("*")
                       if f.is_file() and f.suffix.lower() in VIDEO_EXTS])
        paths.extend(vids)
    return paths[:max_n]

def find_video_dataset():
    non_viol_dirs, viol_dirs = [], []
    for d in sorted(KAGGLE_INPUT.rglob("*")):
        if not d.is_dir():
            continue
        name = d.name.lower().replace("-", "").replace("_", "")
        if name in ("nonviolent", "nonviolence", "sfw", "safe", "normal", "benign"):
            non_viol_dirs.append(d)
        elif name in ("violent", "violence", "gore", "fight", "brawl", "assault", "attack"):
            parent = d.parent.name.lower().replace("-", "").replace("_", "")
            if "non" not in parent:
                viol_dirs.append(d)
    return non_viol_dirs, viol_dirs

in_non_viol, in_viol = find_video_dataset()

# Fallback: check subdirectories
if not in_non_viol and not in_viol:
    for d in sorted(KAGGLE_INPUT.iterdir()):
        if not d.is_dir():
            continue
        for sub in sorted(d.iterdir()):
            if not sub.is_dir():
                continue
            name = sub.name.lower()
            if name in ("non-violent", "nonviolent", "non_violent", "sfw", "safe"):
                in_non_viol.append(sub)
            elif name in ("violent", "violence", "gore", "fight"):
                in_viol.append(sub)

non_viol_paths = collect_videos(in_non_viol, MAX_PER_CLASS)
viol_paths     = collect_videos(in_viol, MAX_PER_CLASS)

print(f"\n📂 Non-violent : {len(non_viol_paths)} videos")
for d in in_non_viol:
    if d.exists():
        print(f"     <- {d}")

print(f"📂 Violent     : {len(viol_paths)} videos")
for d in in_viol:
    if d.exists():
        print(f"     <- {d}")

if not non_viol_paths and not viol_paths:
    print("\n⚠️  No videos found. Add a video dataset with violent/ + non-violent/ folders.")
    print("Available datasets:")
    for d in sorted(KAGGLE_INPUT.iterdir()):
        print(f"  {d.name}/")
        if d.is_dir():
            for sub in sorted(d.iterdir())[:10]:
                print(f"    {sub.name}/")
    raise SystemExit()

samples = (
    [{"path": p, "true": 0, "class": "non-violent"} for p in non_viol_paths] +
    [{"path": p, "true": 1, "class": "violent"}     for p in viol_paths]
)
print(f"\nTotal: {len(samples)} videos "
      f"(non-violent={len(non_viol_paths)}, violent={len(viol_paths)})")

# ── INFERENCE ──────────────────────────────────────────────────────────────────
print(f"\n--- Video Pipeline Inference ---")
print(f"--- Thresholds: violence={THRESHOLDS['violence']}, nsfw={THRESHOLDS['nsfw']} ---\n")

load_vit_models()

results = []
t0 = time.time()
errors = 0

for idx, sample in enumerate(samples):
    vpath = sample["path"]
    vname = Path(vpath).name
    try:
        t_vid = time.time()
        verdict_md, score_md, timeline, v_gallery, n_gallery = \
            run_v2_inference(vpath, THRESHOLDS, top_k=4)
        vid_elapsed = time.time() - t_vid

        is_banned  = "BAN" in verdict_md
        is_blurred = "BLUR" in verdict_md and not is_banned

        v_peak = 0.0
        for line in score_md.split("\n"):
            if "Violence peak:" in line:
                try: v_peak = float(line.split("**")[1])
                except: pass

        if is_banned:    pred_level = 2
        elif is_blurred: pred_level = 1
        else:            pred_level = 0

        verdict = "ban" if is_banned else ("blur" if is_blurred else "safe")
        sample.update({
            "v_peak": v_peak, "pred_level": pred_level,
            "verdict": verdict, "runtime": vid_elapsed, "error": None,
        })

        tag = {"safe": "OK ", "blur": "BLR", "ban": "BAN"}[verdict]
        print(f"  [{idx+1:3d}/{len(samples)}] {tag}  v={v_peak:.3f}  {vid_elapsed:.1f}s  {vname}")

    except Exception as e:
        errors += 1
        sample.update({
            "v_peak": 0.0, "pred_level": 0, "verdict": "error",
            "runtime": 0.0, "error": str(e),
        })
        print(f"  [{idx+1:3d}/{len(samples)}] ERR  {vname}: {e}")

    torch.cuda.empty_cache()

total_elapsed = time.time() - t0
df = pd.DataFrame(samples)
df_valid = df[df["verdict"] != "error"].copy()
n_errors = len(df) - len(df_valid)

print(f"\n✅ {len(df_valid)} videos | {total_elapsed:.1f}s | "
      f"{len(df_valid)/total_elapsed:.2f} vid/s | {n_errors} errors")

# ── SCORING ───────────────────────────────────────────────────────────────────
df_valid["s1_pred"] = (df_valid["pred_level"] == 2).astype(int)
df_valid["s1_true"] = df_valid["true"]

df2 = df_valid[df_valid["pred_level"] != 1].copy()
df2["s2_pred"] = (df2["pred_level"] == 2).astype(int)
df2["s2_true"] = df2["true"]
n_uncertain = int((df_valid["pred_level"] == 1).sum())
pct_uncertain = 100 * n_uncertain / len(df_valid) if len(df_valid) > 0 else 0

SEP = "─" * 65

def scheme_report(y_true, y_pred, scores, name, note=""):
    acc = accuracy_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    try: auc = roc_auc_score(y_true, scores)
    except: auc = float("nan")

    y_true, y_pred = np.array(y_true), np.array(y_pred)
    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())
    tp = int(((y_true == 1) & (y_pred == 1)).sum())
    n, nv, v = len(y_true), int((y_true == 0).sum()), int((y_true == 1).sum())

    prec_v = tp / (tp + fp) if (tp + fp) else 0
    rec_v  = tp / (tp + fn) if (tp + fn) else 0
    spec   = tn / (tn + fp) if (tn + fp) else 0

    print(f"\n  ┌─ {name} {'─' * (50 - len(name))}")
    if note:
        print(f"  │  {note}")
    print(f"  │  Total: {n} (non-violent={nv}, violent={v})")
    print(f"  │  Accuracy        : {acc * 100:6.2f}%")
    print(f"  │  F1-score(viol.) : {f1:.4f}")
    print(f"  │  AUC-ROC         : {auc:.4f}")
    print(f"  │  Non-viol recall : {spec * 100:6.2f}%  [{tn}/{nv}]")
    print(f"  │  Violent  recall : {rec_v * 100:6.2f}%  [{tp}/{v}]")
    print(f"  │  Violent  prec.  : {prec_v * 100:6.2f}%")
    print(f"  │  FP (safe→viol)  : {fp} ({100 * fp / nv:.1f}%)" if nv > 0 else "  │  FP: N/A")
    print(f"  │  FN (viol→safe)  : {fn} ({100 * fn / v:.1f}%)" if v > 0 else "  │  FN: N/A")
    print(f"  └{'─' * 55}")
    return {"acc": acc, "f1": f1, "auc": auc, "spec": spec,
            "recall_v": rec_v, "prec_v": prec_v, "fp": fp, "fn": fn, "tp": tp, "tn": tn}

print(f"\n{SEP}")
print(f"  Pipeline: ViT + CLIP activity + heuristics + gore/brawl")
print(f"  Thresholds: violence >= {THRESHOLDS['violence']}")
print(SEP)

dist = df_valid["pred_level"].value_counts().sort_index()
for lv in range(3):
    cnt = int(dist.get(lv, 0))
    tag = {0: "safe ", 1: "blur ", 2: "ban  "}[lv]
    bar = "█" * int(30 * cnt / len(df_valid)) if len(df_valid) > 0 else ""
    print(f"  {tag}(lv={lv}): {cnt:>5} ({100 * cnt / len(df_valid):5.1f}%)  {bar}")
print()

r1 = scheme_report(df_valid["s1_true"], df_valid["s1_pred"], df_valid["v_peak"],
                   "Scheme 1 — Strict (ban-only = violence)",
                   "blur + safe = non-violent")

r2 = scheme_report(df2["s2_true"], df2["s2_pred"], df2["v_peak"],
                   "Scheme 2 — Exclude Blur",
                   f"blur removed: {n_uncertain} ({pct_uncertain:.1f}%)")

print(f"\n{SEP}")
print("  COMPARISON")
print(SEP)
print(f"  {'Metric':<22} {'Scheme 1':>16} {'Scheme 2':>16}")
print(f"  {'':─<22} {'':─>16} {'':─>16}")
for m, v1, v2 in [
    ("Accuracy", f"{r1['acc']*100:.2f}%", f"{r2['acc']*100:.2f}%"),
    ("F1(violence)", f"{r1['f1']:.4f}", f"{r2['f1']:.4f}"),
    ("AUC-ROC", f"{r1['auc']:.4f}", f"{r2['auc']:.4f}"),
    ("Non-viol Recall", f"{r1['spec']*100:.2f}%", f"{r2['spec']*100:.2f}%"),
    ("Viol Recall", f"{r1['recall_v']*100:.2f}%", f"{r2['recall_v']*100:.2f}%"),
]:
    print(f"  {m:<22} {v1:>16} {v2:>16}")

runtimes = df_valid["runtime"].values
print(f"\n  Speed: {runtimes.mean():.2f}s/video | {len(df_valid)/total_elapsed:.2f} vid/s | total {total_elapsed:.0f}s")

# ── PLOTS ─────────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(18, 12))
gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.38, wspace=0.32)

# 1. Score distribution
ax1 = fig.add_subplot(gs[0, :2])
for cls, color in {"non-violent": "steelblue", "violent": "crimson"}.items():
    sub = df_valid[df_valid["class"] == cls]["v_peak"]
    if len(sub) > 0:
        ax1.hist(sub, bins=40, alpha=0.6, color=color,
                 label=f"{cls} (n={len(sub)})", density=True)
ax1.axvline(THRESHOLDS["violence"], color="red", lw=2, linestyle="--",
            label=f'threshold={THRESHOLDS["violence"]}')
ax1.set_title("Violence Peak Score Distribution", fontsize=13)
ax1.set_xlabel("v_peak"); ax1.set_ylabel("Density")
ax1.legend(fontsize=9); ax1.set_xlim(0, 1)

# 2. Pred level breakdown
ax2 = fig.add_subplot(gs[0, 2])
bar_data = {}
for cls in ["non-violent", "violent"]:
    sub = df_valid[df_valid["class"] == cls]
    n = len(sub)
    if n > 0:
        bar_data[cls] = {
            "safe": int((sub["pred_level"] == 0).sum()) / n * 100,
            "blur": int((sub["pred_level"] == 1).sum()) / n * 100,
            "ban":  int((sub["pred_level"] == 2).sum()) / n * 100,
        }
    else:
        bar_data[cls] = {"safe": 0, "blur": 0, "ban": 0}

x = np.arange(2); w = 0.5
labels = ["non-violent", "violent"]
b_safe = [bar_data[l]["safe"] for l in labels]
b_blur = [bar_data[l]["blur"] for l in labels]
b_ban  = [bar_data[l]["ban"]  for l in labels]
ax2.bar(x, b_safe, w, label="safe", color="steelblue", alpha=0.85)
ax2.bar(x, b_blur, w, bottom=b_safe, label="blur", color="orange", alpha=0.85)
ax2.bar(x, b_ban, w, bottom=[s+b for s,b in zip(b_safe, b_blur)],
        label="ban", color="crimson", alpha=0.85)
ax2.set_xticks(x); ax2.set_xticklabels(labels)
ax2.set_ylabel("%"); ax2.set_title("Prediction Breakdown", fontsize=12)
ax2.legend(fontsize=9); ax2.set_ylim(0, 110)

# 3. Confusion Matrix Scheme 1
ax3 = fig.add_subplot(gs[1, 0])
cm1 = confusion_matrix(df_valid["s1_true"], df_valid["s1_pred"])
sns.heatmap(cm1, annot=True, fmt="d", cmap="Blues", ax=ax3,
            xticklabels=["non-viol", "violent"],
            yticklabels=["non-viol", "violent"], annot_kws={"size": 13})
ax3.set_title(f"Scheme 1 — Strict\nAcc={r1['acc']*100:.1f}% F1={r1['f1']:.3f}", fontsize=11)

# 4. Confusion Matrix Scheme 2
ax4 = fig.add_subplot(gs[1, 1])
cm2 = confusion_matrix(df2["s2_true"], df2["s2_pred"]) if len(df2) > 0 else np.array([[0]])
sns.heatmap(cm2, annot=True, fmt="d", cmap="Greens", ax=ax4,
            xticklabels=["non-viol", "violent"],
            yticklabels=["non-viol", "violent"], annot_kws={"size": 13})
ax4.set_title(f"Scheme 2 — Excl.Blur ({pct_uncertain:.0f}%)\n"
              f"Acc={r2['acc']*100:.1f}% F1={r2['f1']:.3f}", fontsize=11)

# 5. Metric comparison
ax5 = fig.add_subplot(gs[1, 2])
metric_names = ["Acc", "F1", "AUC", "Spec", "Recall"]
s1 = [r1["acc"], r1["f1"], r1["auc"], r1["spec"], r1["recall_v"]]
s2 = [r2["acc"], r2["f1"], r2["auc"], r2["spec"], r2["recall_v"]]
xb = np.arange(len(metric_names)); bw = 0.35
bars1 = ax5.bar(xb - bw/2, s1, bw, label="Strict", color="#4472C4", alpha=0.85)
bars2 = ax5.bar(xb + bw/2, s2, bw, label="Excl.Blur", color="#70AD47", alpha=0.85)
ax5.set_xticks(xb); ax5.set_xticklabels(metric_names, fontsize=9)
ax5.set_ylim(0, 1.12); ax5.legend(fontsize=8)
for bars in [bars1, bars2]:
    for bar in bars:
        h = bar.get_height()
        if not np.isnan(h):
            ax5.text(bar.get_x() + bar.get_width()/2, h + 0.01,
                     f"{h:.2f}", ha="center", va="bottom", fontsize=8)

plt.suptitle(
    f"Video Violence Benchmark — {len(non_viol_paths)} non-viol + {len(viol_paths)} viol\n"
    f"Pipeline: ViT + CLIP + Heuristics + Gore/Brawl | threshold={THRESHOLDS['violence']}",
    fontsize=13, y=1.01)
plt.savefig(str(RESULTS_DIR / "benchmark_video.png"), dpi=130, bbox_inches="tight")
plt.show()

# ── SAVE ──────────────────────────────────────────────────────────────────────
df.to_csv(RESULTS_DIR / "benchmark_video.csv", index=False)
summary = {
    "total_videos": len(df_valid), "errors": n_errors,
    "total_runtime_s": round(total_elapsed, 1),
    "mean_runtime_s": round(float(runtimes.mean()), 2),
    "throughput_vid_per_s": round(len(df_valid) / total_elapsed, 2),
    "thresholds": THRESHOLDS,
    "scheme1": {k: round(float(v), 4) if isinstance(v, float) else int(v) for k, v in r1.items()},
    "scheme2": {k: round(float(v), 4) if isinstance(v, float) else int(v) for k, v in r2.items()},
    "blur_uncertain": n_uncertain, "blur_uncertain_pct": round(pct_uncertain, 1),
}
with open(RESULTS_DIR / "benchmark_video_summary.json", "w") as f:
    json.dump(summary, f, indent=2)

print(f"\n✅ Plot : {RESULTS_DIR}/benchmark_video.png")
print(f"✅ CSV  : {RESULTS_DIR}/benchmark_video.csv")
print(f"✅ JSON : {RESULTS_DIR}/benchmark_video_summary.json")
