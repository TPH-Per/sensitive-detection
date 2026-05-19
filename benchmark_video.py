# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  BENCHMARK — Video Violence Detection Pipeline                              ║
# ║  Scheme 1 · Strict  : ban = violence │ safe+blur = non-violent              ║
# ║  Scheme 2 · Exclude : blur = uncertain, excluded from metric                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import sys, time, os, json, subprocess, importlib.util
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns
import torch
from pathlib import Path
from sklearn.metrics import (
    accuracy_score, classification_report,
    confusion_matrix, roc_auc_score, f1_score
)

# ── Auto-detect app.py location ──────────────────────────────────────────────
_APP_CANDIDATES = [
    "/kaggle/working/sensitive-detection",
    "/kaggle/input/sensitive-detection",
    "/kaggle/working",
]
for _d in Path("/kaggle/input").glob("*"):
    if _d.is_dir() and (_d / "app.py").exists():
        _APP_CANDIDATES.insert(0, str(_d))
    for _sub in _d.glob("*"):
        if _sub.is_dir() and (_sub / "app.py").exists():
            _APP_CANDIDATES.insert(0, str(_sub))

_APP_DIR = None
for _cand in _APP_CANDIDATES:
    if os.path.isfile(os.path.join(_cand, "app.py")):
        _APP_DIR = _cand
        break

if _APP_DIR is None:
    _result = subprocess.run(["find", "/kaggle", "-name", "app.py", "-path", "*/sensitive*"],
                             capture_output=True, text=True, timeout=10)
    for _line in _result.stdout.strip().split("\n"):
        if _line and os.path.isfile(_line):
            _APP_DIR = os.path.dirname(_line)
            break

if _APP_DIR is None:
    print("ERROR: Cannot find app.py. Available directories:")
    for _d in sorted(Path("/kaggle/input").glob("*")):
        print(f"  {_d}")
        if _d.is_dir():
            for _f in sorted(_d.glob("*.py"))[:5]:
                print(f"    {_f.name}")
    raise SystemExit("app.py not found")

# Add to path so app.py's own imports (nsfw_classifier_v2, activity_context) work
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)
print(f"  [import] Loading app.py from: {_APP_DIR}")

# Use importlib to load directly from file path — avoids 'app' name conflicts
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
MAX_PER_CLASS    = 150    # video inference is slower, keep sample manageable

# Thresholds matching app.py
THRESHOLDS = {"violence": 0.50, "nsfw": 0.50}

# ── DISCOVER VIDEO DATASET ────────────────────────────────────────────────────
print("=" * 65)
print("  BENCHMARK — Video Violence Detection (Strict & Exclude-Blur)")
print(f"  Device: {DEVICE}")
print("=" * 65)

def collect_videos(label_dirs: list[Path], max_n: int) -> list[str]:
    paths = []
    for d in label_dirs:
        if not d.exists():
            continue
        vids = sorted([str(f) for f in d.rglob("*")
                       if f.is_file() and f.suffix.lower() in VIDEO_EXTS])
        paths.extend(vids)
    return paths[:max_n]

def find_video_dataset():
    """Search /kaggle/input for video datasets with violent/non-violent split."""
    non_viol_dirs, viol_dirs = [], []

    # Check common dataset structures
    for d in sorted(KAGGLE_INPUT.rglob("*")):
        if not d.is_dir():
            continue
        name = d.name.lower().replace("-", "").replace("_", "")

        # Non-violent directories
        if name in ("nonviolent", "nonviolence", "sfw", "safe",
                     "normal", "benign", "peaceful"):
            non_viol_dirs.append(d)

        # Violent directories (avoid matching "non-violent")
        elif name in ("violent", "violence", "gore", "fight",
                       "brawl", "assault", "attack"):
            # Double check parent isn't "non-violent"
            parent = d.parent.name.lower().replace("-", "").replace("_", "")
            if "non" not in parent:
                viol_dirs.append(d)

    return non_viol_dirs, viol_dirs

in_non_viol, in_viol = find_video_dataset()

# Fallback: check for single-level dataset structure
if not in_non_viol and not in_viol:
    # Maybe dataset has direct video files in labeled folders
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
    print("\n⚠️  No videos found. Check:")
    print("  1) Video dataset added to Kaggle?")
    print("  2) Directory structure: violent/ and non-violent/ folders")
    for d in sorted(KAGGLE_INPUT.iterdir()):
        print(f"     {d.name}/")
        if d.is_dir():
            for sub in sorted(d.iterdir())[:5]:
                print(f"       {sub.name}/")
    raise SystemExit()

samples = (
    [{"path": p, "true": 0, "class": "non-violent"} for p in non_viol_paths] +
    [{"path": p, "true": 1, "class": "violent"}     for p in viol_paths]
)
print(f"\nTotal: {len(samples)} videos "
      f"(non-violent={len(non_viol_paths)}, violent={len(viol_paths)})")

# ── INFERENCE ──────────────────────────────────────────────────────────────────
print(f"\n--- Video Pipeline Inference | device={DEVICE} ---")
print(f"--- Thresholds: violence={THRESHOLDS['violence']}, nsfw={THRESHOLDS['nsfw']} ---\n")

# Pre-load models once
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

        # Parse verdict from markdown
        is_flagged = "FLAGGED" in verdict_md
        is_banned = "BAN" in verdict_md
        is_blurred = "BLUR" in verdict_md and not is_banned

        # Parse violence peak from score_md
        v_peak = 0.0
        for line in score_md.split("\n"):
            if "Violence peak:" in line:
                try:
                    v_peak = float(line.split("**")[1])
                except:
                    pass

        # Determine action level: 0=safe, 1=blur, 2=ban
        if is_banned:
            pred_level = 2
        elif is_blurred:
            pred_level = 1
        else:
            pred_level = 0

        sample.update({
            "v_peak": v_peak,
            "pred_level": pred_level,
            "verdict": "ban" if is_banned else ("blur" if is_blurred else "safe"),
            "runtime": vid_elapsed,
            "error": None,
        })

        tag = {"safe": "OK ", "blur": "BLR", "ban": "BAN"}[sample["verdict"]]
        print(f"  [{idx+1:3d}/{len(samples)}] {tag}  "
              f"v={v_peak:.3f}  {vid_elapsed:.1f}s  {vname}")

    except Exception as e:
        errors += 1
        sample.update({
            "v_peak": 0.0,
            "pred_level": 0,
            "verdict": "error",
            "runtime": 0.0,
            "error": str(e),
        })
        print(f"  [{idx+1:3d}/{len(samples)}] ERR  {vname}: {e}")

    # Free GPU memory between videos
    torch.cuda.empty_cache()

total_elapsed = time.time() - t0
df = pd.DataFrame(samples)

# Remove errors from metric calculation
df_valid = df[df["verdict"] != "error"].copy()
n_errors = len(df) - len(df_valid)

print(f"\n✅ {len(df_valid)} videos processed | {total_elapsed:.1f}s total "
      f"| {len(df_valid)/total_elapsed:.2f} vid/s | {n_errors} errors")

# ── SCORING SCHEMES ───────────────────────────────────────────────────────────
#
#  Scheme 1 — Strict "ban-only = violence"
#    pred ∈ {0, 1} → non-violent
#    pred == 2     → violent
#
#  Scheme 2 — Exclude blur
#    pred == 1     → removed (uncertain)
#    pred == 0     → non-violent
#    pred == 2     → violent

# Scheme 1
df_valid["s1_pred"] = (df_valid["pred_level"] == 2).astype(int)
df_valid["s1_true"] = df_valid["true"]

# Scheme 2
df2 = df_valid[df_valid["pred_level"] != 1].copy()
df2["s2_pred"] = (df2["pred_level"] == 2).astype(int)
df2["s2_true"] = df2["true"]
n_uncertain = int((df_valid["pred_level"] == 1).sum())
pct_uncertain = 100 * n_uncertain / len(df_valid) if len(df_valid) > 0 else 0

# ── REPORT ────────────────────────────────────────────────────────────────────
SEP = "─" * 65

def scheme_report(y_true, y_pred, scores, name, note=""):
    acc = accuracy_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    try:
        auc = roc_auc_score(y_true, scores)
    except:
        auc = float("nan")

    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())
    tp = int(((y_true == 1) & (y_pred == 1)).sum())
    n = len(y_true)
    nv = int((y_true == 0).sum())
    v = int((y_true == 1).sum())

    prec_v = tp / (tp + fp) if (tp + fp) else 0
    rec_v = tp / (tp + fn) if (tp + fn) else 0
    spec = tn / (tn + fp) if (tn + fp) else 0

    print(f"\n  ┌─ {name} {'─' * (50 - len(name))}")
    if note:
        print(f"  │  {note}")
    print(f"  │  Total videos    : {n}  (non-violent={nv}, violent={v})")
    print(f"  │")
    print(f"  │  Accuracy        : {acc * 100:6.2f}%")
    print(f"  │  F1-score(viol.) : {f1:.4f}")
    print(f"  │  AUC-ROC         : {auc:.4f}")
    print(f"  │")
    print(f"  │  Non-violent recall (specificity) : {spec * 100:6.2f}%  [{tn}/{nv} correct]")
    print(f"  │  Violent    recall (sensitivity)  : {rec_v * 100:6.2f}%  [{tp}/{v} correct]")
    print(f"  │  Violent    precision             : {prec_v * 100:6.2f}%")
    print(f"  │")
    print(f"  │  False Positives (safe→violent)   : {fp}  ({100 * fp / nv:.1f}% of non-violent)" if nv > 0 else "  │  False Positives: N/A")
    print(f"  │  False Negatives (viol.→safe)     : {fn}  ({100 * fn / v:.1f}% of violent)" if v > 0 else "  │  False Negatives: N/A")
    print(f"  └{'─' * 55}")
    return {"acc": acc, "f1": f1, "auc": auc,
            "spec": spec, "recall_v": rec_v, "prec_v": prec_v,
            "fp": fp, "fn": fn, "tp": tp, "tn": tn}

print(f"\n{SEP}")
print(f"  THRESHOLDS: violence >= {THRESHOLDS['violence']:.2f}")
print(f"  Pipeline: ViT + CLIP activity + heuristics + gore/brawl verification")
print(SEP)

# Prediction level distribution
dist = df_valid["pred_level"].value_counts().sort_index()
for lv in range(3):
    cnt = int(dist.get(lv, 0))
    tag = {0: "safe ", 1: "blur ", 2: "ban  "}[lv]
    bar = "█" * int(30 * cnt / len(df_valid)) if len(df_valid) > 0 else ""
    print(f"  {tag}(lv={lv}): {cnt:>5} ({100 * cnt / len(df_valid):5.1f}%)  {bar}")
print()

r1 = scheme_report(
    df_valid["s1_true"], df_valid["s1_pred"], df_valid["v_peak"],
    "Scheme 1 — Strict (ban-only = violence)",
    note="blur(1) + safe(0) both count as non-violent"
)

r2 = scheme_report(
    df2["s2_true"], df2["s2_pred"], df2["v_peak"],
    "Scheme 2 — Exclude Blur (uncertain removed)",
    note=f"blur(1) removed: {n_uncertain} videos ({pct_uncertain:.1f}%)"
)

# Comparison summary
print(f"\n{SEP}")
print("  COMPARISON")
print(SEP)
metrics = ["Accuracy", "F1(violence)", "AUC-ROC", "Non-viol Recall", "Viol Recall", "FP Rate"]
vals1 = [f"{r1['acc'] * 100:.2f}%", f"{r1['f1']:.4f}", f"{r1['auc']:.4f}",
         f"{r1['spec'] * 100:.2f}%", f"{r1['recall_v'] * 100:.2f}%",
         f"{100 * r1['fp'] / (r1['fp'] + r1['tn']):.2f}%" if (r1['fp'] + r1['tn']) > 0 else "N/A"]
vals2 = [f"{r2['acc'] * 100:.2f}%", f"{r2['f1']:.4f}", f"{r2['auc']:.4f}",
         f"{r2['spec'] * 100:.2f}%", f"{r2['recall_v'] * 100:.2f}%",
         f"{100 * r2['fp'] / (r2['fp'] + r2['tn']):.2f}%" if (r2['fp'] + r2['tn']) > 0 else "N/A"]

print(f"  {'Metric':<22} {'Scheme 1 (Strict)':>20} {'Scheme 2 (Excl.Blur)':>22}")
print(f"  {'':─<22} {'':─>20} {'':─>22}")
for m, v1, v2 in zip(metrics, vals1, vals2):
    print(f"  {m:<22} {v1:>20} {v2:>22}")
print(f"\n  Blur/Uncertain : {n_uncertain} videos ({pct_uncertain:.1f}%)")

# Runtime stats
runtimes = df_valid["runtime"].values
print(f"\n  Runtime stats:")
print(f"    Mean   : {runtimes.mean():.2f}s per video")
print(f"    Median : {np.median(runtimes):.2f}s")
print(f"    Min    : {runtimes.min():.2f}s")
print(f"    Max    : {runtimes.max():.2f}s")
print(f"    Total  : {total_elapsed:.1f}s ({len(df_valid)} videos)")

# ── PLOTS ─────────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(18, 12))
gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.38, wspace=0.32)

# Plot 1: Score distribution
ax1 = fig.add_subplot(gs[0, :2])
colors = {"non-violent": "steelblue", "violent": "crimson"}
for cls, color in colors.items():
    sub = df_valid[df_valid["class"] == cls]["v_peak"]
    if len(sub) > 0:
        ax1.hist(sub, bins=40, alpha=0.6, color=color,
                 label=f"{cls} (n={len(sub)})", density=True)
ax1.axvline(THRESHOLDS["violence"], color="red", lw=2, linestyle="--",
            label=f'threshold={THRESHOLDS["violence"]}')
ax1.set_title("Violence Peak Score Distribution", fontsize=13)
ax1.set_xlabel("v_peak"); ax1.set_ylabel("Density")
ax1.legend(fontsize=9); ax1.set_xlim(0, 1)

# Plot 2: Pred level breakdown
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

x = np.arange(2); width = 0.5
labels = ["non-violent", "violent"]
b_safe = [bar_data[l]["safe"] for l in labels]
b_blur = [bar_data[l]["blur"] for l in labels]
b_ban  = [bar_data[l]["ban"]  for l in labels]
p1 = ax2.bar(x, b_safe, width, label="safe(0)", color="steelblue", alpha=0.85)
p2 = ax2.bar(x, b_blur, width, bottom=b_safe, label="blur(1)", color="orange", alpha=0.85)
p3 = ax2.bar(x, b_ban, width,
             bottom=[s + b for s, b in zip(b_safe, b_blur)],
             label="ban(2)", color="crimson", alpha=0.85)
ax2.set_xticks(x); ax2.set_xticklabels(labels, fontsize=10)
ax2.set_ylabel("% videos"); ax2.set_title("Pred Level Breakdown (%)", fontsize=12)
ax2.legend(fontsize=9); ax2.set_ylim(0, 110)
for bar, vals in zip([p1, p2, p3], [b_safe, b_blur, b_ban]):
    for rect, val in zip(bar, vals):
        if val > 3:
            ax2.text(rect.get_x() + rect.get_width() / 2,
                     rect.get_y() + rect.get_height() / 2,
                     f"{val:.0f}%", ha="center", va="center",
                     fontsize=9, color="white", fontweight="bold")

# Plot 3: Confusion Matrix Scheme 1
ax3 = fig.add_subplot(gs[1, 0])
cm1 = confusion_matrix(df_valid["s1_true"], df_valid["s1_pred"])
sns.heatmap(cm1, annot=True, fmt="d", cmap="Blues", ax=ax3,
            xticklabels=["pred: non-viol", "pred: violent"],
            yticklabels=["true: non-viol", "true: violent"],
            annot_kws={"size": 13})
ax3.set_title(f"Scheme 1 — Strict\nAcc={r1['acc'] * 100:.2f}%  F1={r1['f1']:.3f}", fontsize=11)

# Plot 4: Confusion Matrix Scheme 2
ax4 = fig.add_subplot(gs[1, 1])
cm2 = confusion_matrix(df2["s2_true"], df2["s2_pred"]) if len(df2) > 0 else np.array([[0]])
sns.heatmap(cm2, annot=True, fmt="d", cmap="Greens", ax=ax4,
            xticklabels=["pred: non-viol", "pred: violent"],
            yticklabels=["true: non-viol", "true: violent"],
            annot_kws={"size": 13})
ax4.set_title(
    f"Scheme 2 — Excl. Blur ({pct_uncertain:.1f}% removed)\n"
    f"Acc={r2['acc'] * 100:.2f}%  F1={r2['f1']:.3f}", fontsize=11)

# Plot 5: Metric comparison
ax5 = fig.add_subplot(gs[1, 2])
metric_names = ["Accuracy", "F1", "AUC-ROC", "Non-viol\nRecall", "Viol\nRecall"]
s1_vals = [r1["acc"], r1["f1"], r1["auc"], r1["spec"], r1["recall_v"]]
s2_vals = [r2["acc"], r2["f1"], r2["auc"], r2["spec"], r2["recall_v"]]
x_bar = np.arange(len(metric_names)); w = 0.35
bars1 = ax5.bar(x_bar - w / 2, s1_vals, w, label="Scheme 1 Strict", color="#4472C4", alpha=0.85)
bars2 = ax5.bar(x_bar + w / 2, s2_vals, w, label="Scheme 2 Excl.Blur", color="#70AD47", alpha=0.85)
ax5.set_xticks(x_bar); ax5.set_xticklabels(metric_names, fontsize=9)
ax5.set_ylim(0, 1.12); ax5.set_ylabel("Score")
ax5.set_title("Metric Comparison", fontsize=12)
ax5.legend(fontsize=8)
for bars in [bars1, bars2]:
    for bar in bars:
        h = bar.get_height()
        if not np.isnan(h):
            ax5.text(bar.get_x() + bar.get_width() / 2, h + 0.01,
                     f"{h:.2f}", ha="center", va="bottom", fontsize=8)

plt.suptitle(
    f"Video Violence Detection Benchmark\n"
    f"({len(non_viol_paths)} non-violent + {len(viol_paths)} violent videos | "
    f"threshold={THRESHOLDS['violence']})",
    fontsize=13, y=1.01
)
plt.savefig(str(RESULTS_DIR / "benchmark_video.png"), dpi=130, bbox_inches="tight")
plt.show()

# ── SAVE ──────────────────────────────────────────────────────────────────────
df.to_csv(RESULTS_DIR / "benchmark_video.csv", index=False)

# Save summary JSON
summary = {
    "total_videos": len(df_valid),
    "errors": n_errors,
    "total_runtime_s": round(total_elapsed, 1),
    "mean_runtime_s": round(float(runtimes.mean()), 2),
    "thresholds": THRESHOLDS,
    "scheme1": {k: round(float(v), 4) if isinstance(v, float) else int(v)
                for k, v in r1.items()},
    "scheme2": {k: round(float(v), 4) if isinstance(v, float) else int(v)
                for k, v in r2.items()},
    "blur_uncertain": n_uncertain,
    "blur_uncertain_pct": round(pct_uncertain, 1),
}
with open(RESULTS_DIR / "benchmark_video_summary.json", "w") as f:
    json.dump(summary, f, indent=2)

print(f"\n✅ Plot  : {RESULTS_DIR}/benchmark_video.png")
print(f"✅ CSV   : {RESULTS_DIR}/benchmark_video.csv")
print(f"✅ JSON  : {RESULTS_DIR}/benchmark_video_summary.json")
