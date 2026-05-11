# BAO CAO 08 — V7 Architecture Plan + Quick Fix Implementation

**Ngay cap nhat:** 2026-05-04  
**Muc tieu:** giam false positive cua `Violence`, giam shortcut do `CLIP` lan at, va sua logic `S/N` de phat hien event ngan dung ban chat moderation.

---

## 1) Van de goc da xac nhan

1. `V` bi chi phoi boi semantic tu `CLIP(768)` -> `delta_clip` rat lon, trong khi `flow/yolo/gore` dong gop thap.  
2. `S` va `N` dang tinh diem theo weighted-mean theo thoi gian -> event ngan bi pha loang.  
3. FP cao cua `V` lien quan truc tiep den objective train qua recall-first (`pos_weight` + weighted sampler cao).

---

## 2) Bước nhanh (da implement trong code hien tai)

### 2.1 Fusion balancing (giam CLIP lan at)
Da sua trong [src/models/task_gated_attention.py](/d:/python/DA_DL_KPDL/src/models/task_gated_attention.py):
- Them RMS normalization theo tung modality truoc khi concat.
- Scale CLIP rieng cho tung gate:
  - `v_clip_scale=0.35`
  - `s_clip_scale=0.45`
  - `n_clip_scale=0.65`
- Co cong tac `modality_balance` de bat/tat.

Tac dung: CLIP khong con “nuot” flow/yolo/gore/nsfw khi vao pool.

### 2.2 S/N pooling doi sang event-based
Da sua trong [src/models/task_gated_model.py](/d:/python/DA_DL_KPDL/src/models/task_gated_model.py):
- Bo sung 2 che do pooling cho `S_score`, `N_score`:
  - `weighted_mean` (legacy)
  - `topk_noisy_or` (khuyen nghi)
- `topk_noisy_or`: giu duoc event ngan, khong bi pha loang theo 64 frame.

### 2.3 Giam recall cuc doan de ha FP cua V
Da sua trong [scripts/train_e2e_v6.py](/d:/python/DA_DL_KPDL/scripts/train_e2e_v6.py):
- `pos_weight` cua BCE violence thanh tham so:
  - `--violence_pos_weight`
- Weight cua sampler positive thanh tham so:
  - `--sampler_pos_weight`

Muc dich: cho phep tune precision/recall thay vi khoa cung 44.0.

### 2.4 Backward compatibility cho checkpoint cu
Da sua trong:
- [scripts/calibrate_v6.py](/d:/python/DA_DL_KPDL/scripts/calibrate_v6.py)
- [scripts/evaluate_v6.py](/d:/python/DA_DL_KPDL/scripts/evaluate_v6.py)

Logic:
- Neu checkpoint co `args` V7 quick-fix -> load dung config pooling/fusion.
- Neu checkpoint cu (khong co `sn_pooling`) -> fallback legacy an toan:
  - `sn_pooling=weighted_mean`
  - `modality_balance=False`
  - clip scales = 1.0

---

## 3) Cach chay de retrain nhanh (khuyen nghi)

```bash
python scripts/train_e2e_v6.py \
  --train_manifest /kaggle/working/manifests_v6/train_manifest.csv \
  --val_manifest /kaggle/working/manifests_v6/val_manifest.csv \
  --features_dir /kaggle/working/features_v6 \
  --output_dir /kaggle/working/trong_so \
  --temperature 2.0 \
  --epochs 50 --lambda_dist 0.5 --lambda_ent 0.1 --warmup_epochs 5 --patience 10 \
  --sn_pooling topk_noisy_or --sn_topk_ratio 0.2 --sn_topk_min 3 \
  --v_clip_scale 0.35 --s_clip_scale 0.45 --n_clip_scale 0.65 \
  --violence_pos_weight 20 --sampler_pos_weight 20
```

Goi y tuning FP:
- Neu FP van cao: giam tiep `violence_pos_weight/sampler_pos_weight` (vi du 16).
- Neu miss nhieu violence that: tang nhe len (vi du 24).

---

## 4) Bước lớn — V7 migrate sang VideoMAE + LoRA

## 4.1 Muc tieu kien truc
- Thay backbone frame semantic (CLIP frame-wise) bang backbone video native (temporal-aware).
- Giu cac expert signals (`gore/selfharm/nsfw/yolo`) lam aux evidence.
- V van supervised chinh; S/N dung event-based scoring.

## 4.2 Module giu / thay

**Giu:**
1. Expert models:
- `gore_detector_v6_best.pth`
- `selfharm_detector_v6_best.pth`
- `nsfw_classifier_v6_best.pth`
- `yolov8_weapon_v6_best.pt`
2. Pipeline gate logic, validate/calibrate/evaluate.
3. Taxonomy labels va split protocol.

**Thay:**
1. Nhanh video encoder:
- `CLIP per-frame + flow` -> `VideoMAE encoder`.
2. Fusion head:
- Dung gated fusion voi modality projection dong kich thuoc.
3. `S/N` score:
- Duy tri `topk_noisy_or` (event policy).

## 4.3 LoRA/Finetune de xai duoc voi RTX 4050 6GB

### Option A (khuyen nghi): VideoMAE-Small + LoRA
- Freeze backbone goc.
- LoRA dat vao attention `q,v` cua 4 block cuoi.
- LoRA rank `r=8`, `alpha=16`, `dropout=0.05`.
- Input: `T=16`, `224x224`.
- Batch thuc: `2`, gradient accumulation `8` (effective batch = 16).
- Mixed precision: fp16/bf16 (neu co).

### Option B (du phong): VideoMAE-Base + LoRA (freeze manh)
- Freeze ~90-95% backbone.
- LoRA rank `r=4` (hoac `r=8` neu VRAM con du), `alpha=16`, `dropout=0.05`.
- Input: `T=16`, `224x224`.
- Batch thuc: `1`, accumulation `16`.

**Khong khuyen nghi QLoRA cho vision/video trong phase dau** vi do on dinh train va ecosystem chua loi nhuan bang LoRA thuong.

---

## 5) V7 de xuat chi tiet (module-level)

1. `VideoBackboneV7`:
- Input clip `[B,T,3,H,W]`.
- Output temporal tokens `[B,T,Dv]` (vi du `Dv=384/768`).

2. `AuxProjectorV7`:
- Project `yolo/gore/selfharm/nsfw` vao cung dim nho (vi du 32 moi nhanh).
- Optional flow co the giu hoac bo (neu VideoMAE da hoc motion du).

3. `TaskGatedHeadV7`:
- V head: cross-attn + FFN logit (supervised).
- S/N head: event score `topk_noisy_or`.

4. Loss:
- `L_v`: BCE/Focal co pos_weight vua phai (khong qua cao).
- `L_dist`: KL cho attn alignment S/N (neu can).
- `L_ent`: entropy regularization vua phai.
- Optional anti-shortcut regularizer:
  - phat khi `V` qua phu thuoc CLIP-like stream ma thieu gore/yolo evidence.

---

## 6) Tieu chi GO/NO-GO sau khi sua

1. FP giam ro tren tap NSFW-only.
2. `delta_clip` giam, dong gop gore/yolo co y nghia hon trong ablation.
3. `S/N` flag duoc event ngan (khong bi pha loang).
4. Violence precision tang nhung recall khong sup manh.

---

## 7) Tong ket quyet dinh

1. Da chot **quick-fix trong V6 hien tai**: fusion balancing + event pooling + FP knobs.  
2. Da trien khai **V7 code path**: VideoMAE + LoRA (uu tien Small), giu experts lam aux.  
3. Huong nay giam rui ro: co ban nang cap ngay (quick-fix), dong thoi co duong len backbone video native cho phase tiep theo.

---

## 8) Trang thai implement thuc te (2026-05-04)

Da them cac file moi:
1. [src/models/v7_videomae_lora.py](/d:/python/DA_DL_KPDL/src/models/v7_videomae_lora.py)
2. [src/data/video_moderation_v7_dataset.py](/d:/python/DA_DL_KPDL/src/data/video_moderation_v7_dataset.py)
3. [scripts/prepare_video_manifests_v7.py](/d:/python/DA_DL_KPDL/scripts/prepare_video_manifests_v7.py)
4. [scripts/train_v7_videomae_lora.py](/d:/python/DA_DL_KPDL/scripts/train_v7_videomae_lora.py)
5. [scripts/calibrate_v7.py](/d:/python/DA_DL_KPDL/scripts/calibrate_v7.py)
6. [scripts/evaluate_v7.py](/d:/python/DA_DL_KPDL/scripts/evaluate_v7.py)

Da cap nhat huong dan Kaggle:
1. [run_kaggle01.md](/d:/python/DA_DL_KPDL/run_kaggle01.md): them SESSION 3 cho V7.

Ket luan quan trong ve du lieu:
1. Feature `.npy` tu Cell 5 **khong the thay** raw video de train VideoMAE.
2. Feature Cell 5 duoc tai su dung lam `aux summary` + pseudo teacher S/N trong V7.

---

## 9) Bo sung sua loi theo review (2026-05-04, cap nhat them)

1. **Runbook V7 da co SESSION 3** trong [run_kaggle01.md](/d:/python/DA_DL_KPDL/run_kaggle01.md):
- Da co day du `V7.0 -> V7.3` + precheck.

2. **Da bo sung quality augmentation chong shortcut do chat luong video** trong [src/data/video_moderation_v7_dataset.py](/d:/python/DA_DL_KPDL/src/data/video_moderation_v7_dataset.py):
- Them blur/noise/jpeg compression ngau nhien (chi train split).
- Muc tieu: model khong duoc dua vao quality cue de phan loai.

3. **Da harden mapping manifest V7 de tranh sai do trung basename** trong [scripts/prepare_video_manifests_v7.py](/d:/python/DA_DL_KPDL/scripts/prepare_video_manifests_v7.py):
- Uu tien map theo normalized **full feature path**.
- Chi fallback basename khi key duy nhat.
- Co warning ro rang khi co collision key.

4. **Da chan tinh huong S/N bi keo ve 0 khi thieu features_dir** trong [scripts/train_v7_videomae_lora.py](/d:/python/DA_DL_KPDL/scripts/train_v7_videomae_lora.py):
- Neu khong co pseudo teacher hop le, script tu dong ep `effective_lambda_s=effective_lambda_n=0`.
- Script uoc luong `teacher feature coverage`; neu coverage thap hon `--min_teacher_coverage` thi cung tu dong tat loss S/N.
- Tranh huan luyen sai objective cho 2 head S/N.

5. **Da them giam over-confidence cua V** trong [scripts/train_v7_videomae_lora.py](/d:/python/DA_DL_KPDL/scripts/train_v7_videomae_lora.py):
- `violence_pos_weight` va `sampler_pos_weight` mac dinh auto (clamp, khong recall bias cuc doan).
- Them `violence_label_smoothing` (mac dinh 0.02).
- Muc tieu: giam FP cao bat thuong cua Violence, dac biet tren video NSFW dong hoc.
