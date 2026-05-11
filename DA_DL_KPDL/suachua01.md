# Sua chua 01 - Xu ly lech nhan va calibration cho spatial / temporal / multitask

## 1. Trang thai da sua

Co. Toi da sua theo huong khac phuc ngay 3 van de chinh:

1. **Spatial SSL / SwAV evaluation bi ao do cat prefix 2000 mau dau**.
   - Da bo truncation trong KNN evaluation.
   - Da chuyen sang danh gia tren **toan bo train / val**.
   - Da giu diagnostic script de in ra them thong tin prefix neu can debug.

2. **Multitask evaluation thieu ROC / AUC / PR-AUC va chua co threshold calibration dung nghia**.
   - Da them ROC plot, PR plot, ROC-AUC, PR-AUC.
   - Da them threshold search theo Youden, F1 va F2.
   - Da luu threshold JSON de dung lai cho test, challenge va inference.

3. **Temporal / multitask supervised training chua khac phuc imbalance nhan**.
   - Da them `pos_weight` tu dong tinh tu train split trong `src/training/engine.py`.
   - Da cap `pos_weight` de tranh phóng dai qua muc khi class qua hiem.
   - Da bat `use_pos_weight: true` va `pos_weight_cap: 20.0` trong config temporal va finetune multitask.

## 2. Cac file da sua

### Spatial / SwAV

- `src/training/swav_trainer.py`
  - Bo `max_knn_points` truncation trong KNN eval.
  - KNN score nay gio dung tren toan bo train/val manifest.

- `scripts/debug_swav_spatial_knn.py`
  - Diagnostic mac dinh chay full-val.
  - Khong con dua vao prefix 2000 mau dau.
  - In them thong ke de xem train/val co bi lech source hay khong.

- `configs/ssl_spatial.yaml`
  - `max_knn_points: 0` de hieu la khong gioi han.

### Multitask / Calibration / Inference

- `scripts/evaluate_multitask.py`
  - Xuat ROC-AUC, PR-AUC, ROC plot, PR plot.
  - Calibrate threshold theo `youden`, `f1`, `f2`.
  - Luu `thresholds_json` de dung lai.
  - Ho tro threshold ngoai tu file JSON.

- `scripts/evaluate_challenge.py`
  - Doc duoc threshold JSON de dung threshold da calibrate tren validation.

- `scripts/run_inference_end_to_end.py`
  - Doc duoc threshold JSON.
  - Dung threshold da calibrate thay vi mac dinh chi so 0.5.

- `src/utils/thresholds.py`
  - Helper chung de nap threshold map tu JSON.

- `configs/finetune_multitask.yaml`
  - Them `evaluation.calibration_mode: f2`
  - Them `evaluation.beta: 2.0`
  - Them `thresholds_json: ''`
  - Them `target.use_pos_weight: true`
  - Them `target.pos_weight_cap: 20.0`

- `configs/inference.yaml`
  - Them `thresholds_json: ''`

### Temporal / Supervised training

- `src/training/engine.py`
  - Tinh `pos_weight` tu train manifest.
  - Dung `BCEWithLogitsLoss(pos_weight=...)` cho cac stage supervised multi-label.
  - Ghi lai pos_weight vao summary checkpoint.

- `configs/ssl_temporal.yaml`
  - Them `target.use_pos_weight: true`
  - Them `target.pos_weight_cap: 20.0`

- `configs/finetune_multitask.yaml`
  - Da them cung tham so tren.

### Moi truong Kaggle

- `requirements-kaggle.txt`
  - Da them `matplotlib` de ve ROC / PR plot.

## 3. Vi sao day la sua dung cho bai toan cua ban

### Spatial SSL

Van de ban gap khong phai self-matching, ma la do metric KNN chi nhin mot doan prefix bi lech source. Khi `prepare_kaggle_data.py` sort manifest theo `source`, 2000 mau dau co the toan la 1 source va 1 signature. Khi do:

- `real_score = 1.0000`
- `shuffled_train_labels_score = 1.0000`
- `val_majority_baseline = 1.0000`

Day la **metric ao**, khong phai representation that su qua tot.

Sau sua:

- KNN doc toan bo train / val.
- Diagnostic se in ro prefix neu ban muon kiem tra lech source.
- Khong con tinh cam giac model "than thanh" chi vi tap con 2000 mau dau qua de.

### Temporal / Multitask

Du lieu cua ban lech manh ve `000`, va class hiem nhu `010`, `100` co nguy co bi bo sot.

Sau sua:

- Loss supervised co `pos_weight` de tang trong so cho class hiem.
- ROC / PR / threshold calibration giup ban khong chi nhin 1 con so accuracy hay F1 mac dinh.
- Inference / challenge co the dung threshold da calibrate tu validation, tranh FP/FN mo ho.

## 4. Trang thai co the xem la da chot

Neu toi tom tat ngan gon:

- **Spatial KNN evaluation**: da sua.
- **Temporal supervised imbalance**: da sua.
- **Multitask supervised imbalance**: da sua.
- **Calibration / thresholding cho moderation**: da sua.
- **Challenge / inference threshold reuse**: da sua.

Chua can sua them o muc data prep ngay luc nay, vi split va overlap da duoc kiem tra:

- Train / val khong overlap path.
- Lech source co that, nhung bay gio code da khong con de bi metric ao do prefix.

## 5. Thu tu nen chay tiep tren Kaggle

### Truoc khi chay lai

Ban can dam bao Kaggle dang dung **ban code moi**. Neu notebook dang dung project cu, hay copy / upload lai project da cap nhat vao `/kaggle/working/DA_DL_KPDL`.

### Cell nen chay lai theo thu tu

#### Nhom bat buoc de dong bo config moi

1. **Cell 1 -> Cell 4** trong runbook cu
   - Tim project root
   - Copy code sang `/kaggle/working`
   - Khai bao bien
   - Cai dependency

2. **Cell 5 - Chay lai `prepare_kaggle_data.py`**
   - Muc dich: sinh lai runtime configs co `use_pos_weight`, `pos_weight_cap`, `calibration_mode`, `beta`, `thresholds_json`.
   - Day la buoc can lam neu ban muon dung config moi tren Kaggle.

#### Nhom train lai de ap dung sua chua

3. **Cell 12 - Train SwAV spatial SSL**
   - Rerun de lay checkpoint va metric full-val moi.

4. **Cell 16 - Temporal SSL pretext**
   - Khong bat buoc neu ban muon giu checkpoint cu.
   - Nen rerun neu ban muon full pipeline dong bo.

5. **Cell 17 - Temporal supervised stage**
   - Da dung `pos_weight` moi.
   - Nen rerun de ap dung sua imbalance.

6. **Cell 18 - Fine-tune multitask**
   - Da dung `pos_weight` moi.
   - Nen rerun de ap dung sua imbalance.

#### Nhom calibration / danh gia

7. **Chay `scripts/evaluate_multitask.py` tren validation split**
   - Muc dich: ve ROC / PR, tinh AUC, tim threshold.
   - Dung manifest val, khong phai test.
   - File sinh ra se co dang:
     - `*_roc.png`
     - `*_pr.png`
     - `*_thresholds.json`
     - `*_summary.json`

8. **Chay `scripts/evaluate_multitask.py` tren test split**
   - Truyen `--thresholds_json` lay tu validation.
   - Muc dich: xem FP / FN that su sau calibration.

9. **Chay `scripts/evaluate_challenge.py`**
   - Truyen cung `--thresholds_json` tu validation.
   - Muc dich: do on dinh tren `normal_hard` va `positive_hard`.

10. **Chay `scripts/run_inference_end_to_end.py`**
    - Truyen `--thresholds_json` hoac set trong `configs/inference.yaml`.
    - Muc dich: dung threshold da calibrate khi kiem duyet video that.

### Rieng cho NSFW scorer

- `Cell 14` va `Cell 15` khong lien quan den NSFW scorer.
- Neu ban chi doi `nsfw_scorer` checkpoint hoac loss / preprocessing cua NSFW, khong can chay lai `Cell 14` va `Cell 15`.
- Neu ban muon so sanh ket qua cuoi cung, hay chay `scripts/evaluate_nsfw_scorer.py` tren `labels_nsfw_test.csv` voi `nsfw_scorer_best.pth`.
- Neu muon kiem tra leakage giua cac split, hay chay `scripts/audit_nsfw_splits.py` tren `labels_nsfw_train.csv`, `labels_nsfw_val.csv`, `labels_nsfw_test.csv`, va `labels_nsfw_challenge.csv`.

### Cell co the bo qua neu artifact da co san

- Cell 8 / 9 / 13 / 14 / 15 chi can chay lai neu ban can tao lai feature / proxy / YOLO artifact.
- Neu cac artifact nay da co va khong doi, co the bo qua.

## 6. Cach dung threshold JSON moi

Sau khi chay `scripts/evaluate_multitask.py` tren val, ban se co file threshold JSON trong `artifacts/metrics/`.

Vi du:

- `multitask_val_thresholds.json`
- `multitask_val_roc.png`
- `multitask_val_pr.png`

Sau do:

- Dung file nay cho `evaluate_multitask.py` tren test.
- Dung file nay cho `evaluate_challenge.py`.
- Dung file nay cho `run_inference_end_to_end.py`.

Neu ban uu tien giam FN trong moderation, giu `calibration_mode: f2`.
Neu ban muon giam FP manh hon, doi sang `f1` hoac `youden`.

## 7. Ghi chu quan trong

- Spatial SwAV la self-supervised, nen lech nhan khong tac dong truc tiep vao loss train, nhung co tac dong manh vao cach ban **danh gia**.
- Temporal / multitask la supervised multi-label, nen imbalance truoc day co the day model ve phia `000`.
- Sau sua, model van co the lech neu du lieu that su qua lech, nhung bay gio no khong con bi lech do code nua.
- De bao cao moderation, khong nen chi nhin 1 metric duy nhat. Phai xem:
  - ROC-AUC
  - PR-AUC
  - confusion matrix
  - per-label recall
  - per-source / challenge bucket

## 8. Ket luan

Ban co the xem day la ban sua chua da xong ve phia code:

- **da sua evaluation sai**,
- **da sua thresholding cho moderation**,
- **da sua imbalance cho temporal va multitask supervised training**.

Buoc tiep theo la **copy lai code moi len Kaggle va rerun Cell 5, Cell 12, Cell 16, Cell 17, Cell 18, sau do chay evaluation voi threshold JSON**.

Neu ban muon, toi co the tiep tuc viet cho ban 2 cell Kaggle:

1. mot cell de chay `evaluate_multitask.py` tren validation va sinh `thresholds_json`,
2. mot cell de dung JSON do chay `evaluate_multitask.py` tren test / challenge.
