# Phase 1: Baseline Audit Findings
## Date: 2026-05-14

## Critical Issues Found

### 1. Train/Val Leakage: 857 images (60% of val set)
- 857 images appear in BOTH train and val splits
- All leaked images are synthetic (syn_noose_*, syn_setup_*)
- Validation metrics are **completely unreliable**
- Files: `leakage_report.csv`

### 2. Test Set Missing Critical Classes
- ligature_noose: 0 samples in test
- ligature_setup: 0 samples in test
- hard_negative: 0 samples in test
- Cannot evaluate self-harm detection on held-out data

### 3. 100% Synthetic Ligature Data
- Train: 2,961 ligature boxes (1,823 noose + 1,138 setup) — ALL synthetic
- Val: 735 ligature boxes — ALL synthetic
- Zero real-world rope/noose images in training
- Root cause of 0.12 score on real images (domain gap)

### 4. Severe Class Imbalance
- weapon_bladed: 6,499 (38.5%) — massively overrepresented
- weapon_firearm: 800 (4.7%)
- sh_instrument: 800 (4.7%)
- ligature_noose: 2,277 (13.5%)
- ligature_setup: 1,419 (8.4%)
- hard_negative: 2,278 (13.5%)

### 5. Duplicate Images
- 859 duplicate images detected (MD5 hash)
- Mostly synthetic images that appear in multiple splits

## Dataset Summary

| Split | Images | Notes |
|-------|--------|-------|
| train | 8,999 | 60% synthetic |
| val   | 1,422 | 60% leaked from train |
| test  | 136   | Missing 3 critical classes |

## Model Artifacts

| Model | Size | Status |
|-------|------|--------|
| yolov8_v2_final.pt | 46.8 MB | OK — 6-class detector |
| vit_suicide_best/ | ~170 MB | Trained on synthetic-only |
| gore_detector_v6_best.pth | 45.1 MB | OK |
| nsfw_classifier_v6_best.pth | 45.1 MB | OK |
| selfharm_detector_v6_best.pth | 44.9 MB | OK |
| task_gated_v6_best.pth | 24.5 MB | OK |

## Current Ensemble Formula (to be replaced in Phase 8)
```
sh_p_final = 0.50 * max(vit_score, clip_score * 0.8) + 0.30 * yolo_selfharm + 0.20 * cnn_selfharm
weapon_p = max(yolo_weapon, gore_branch * 0.5)
```

## Immediate Actions Required
1. **Fix leakage**: Remove 857 overlapping images from train (keep in val)
2. **Fix test set**: Add ligature_noose, ligature_setup, hard_negative samples
3. **Collect real data**: At minimum 200 real rope/noose images for training
4. **Rebalance**: Undersample weapon_bladed or oversample minority classes
5. **Retrain**: After fixes, retrain YOLO and ViT on clean data
