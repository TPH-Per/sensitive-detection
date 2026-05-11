# Runbook Train Temporal Trên Kaggle (3 Dataset Cua Ban)

## Ket luan nhanh

Trang thai hien tai: da san sang chay train, NHUNG theo dieu kien.

Dieu kien bat buoc truoc khi train:

- Ban phai tao duoc cac manifest labels CSV cho cac split train/val.
- Ban phai trich xuat CLIP feature `.npy` cho tung split can train.
- Cac lenh train trong repo da duoc sua de chay on hon cho luong temporal tren Kaggle.

Theo output audit dataset:

- `rwf2000`: 2000 file, cau truc ro rang cho violence.
- `ucf-crimes`: 1964 file, co split/txt metadata, phu hop bo sung temporal anomaly.
- `data-dl`: 70563 file, nguon lon cho nsfw/self-harm/medical hard negatives.

Tom tat danh gia theo ke hoach V5.1:

- Giai doan 2 (Data curation): dat yeu cau ve do phong phu du lieu.
- Giai doan 4 (Temporal SSL + Fine-tune): da co code train theo stage.
- Chua dat 100% tu dong: can buoc tao labels CSV theo schema cua script trich xuat.

## Duong dan dataset tren Kaggle

```text
/kaggle/input/datasets/vulamnguyen/rwf2000
/kaggle/input/datasets/bypktt/ucf-crimes
/kaggle/input/datasets/caoqucph/data-dl
```

## 0) Cai dependency

```bash
pip install -r requirements-kaggle.txt
```

## 1) Chuan bi labels CSV de trich xuat feature

Script trich xuat `scripts/build_clip_features.py` yeu cau CSV co cac cot bat buoc:

- `relative_path`
- `violence`
- `self_harm`
- `nsfw`

Va cot tuy chon:

- `sample_id`
- `split`
- `source`

Mau 1 dong:

```csv
relative_path,violence,self_harm,nsfw,sample_id,split,source
videos/clip001.mp4,1,0,0,sample_000001,train,rwf2000
```

Khuyen nghi tao it nhat 4 file CSV:

- `labels_temporal_train.csv`
- `labels_temporal_val.csv`
- `labels_multitask_train.csv`
- `labels_multitask_val.csv`

Luu cac file nay vao vi tri de goi lenh (vi du `/kaggle/working/`).

## 2) Trich xuat CLIP feature `.npy`

### 2.1 Temporal train

```bash
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/labels_temporal_train.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out manifests/temporal_train.csv \
  --max_frames 64 \
  --batch_size 16
```

### 2.2 Temporal val

```bash
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/labels_temporal_val.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out manifests/temporal_val.csv \
  --max_frames 64 \
  --batch_size 16
```

### 2.3 Multitask train

```bash
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/labels_multitask_train.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out manifests/multitask_train.csv \
  --max_frames 64 \
  --batch_size 16
```

### 2.4 Multitask val

```bash
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/labels_multitask_val.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out manifests/multitask_val.csv \
  --max_frames 64 \
  --batch_size 16
```

## 3) Train theo pipeline temporal

### 3.1 Temporal SSL pretext (AoT + Frame Sorting)

```bash
python scripts/train_temporal_ssl.py \
  --config configs/temporal_ssl_pretext.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### 3.2 Temporal stage

```bash
python scripts/train_ssl_temporal.py \
  --config configs/ssl_temporal.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --resume /kaggle/working/artifacts/checkpoints/temporal_ssl_last.pth
```

### 3.3 Fine-tune multitask

```bash
python scripts/train_finetune.py \
  --config configs/finetune_multitask.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --resume /kaggle/working/artifacts/checkpoints/ssl_temporal_last.pth
```

## 4) Kiem tra output sau moi stage

Can kiem tra cac file:

- `/kaggle/working/artifacts/checkpoints/temporal_ssl_last.pth`
- `/kaggle/working/artifacts/checkpoints/ssl_temporal_last.pth`
- `/kaggle/working/artifacts/checkpoints/finetune_multitask_best.pth`
- `/kaggle/working/artifacts/metrics/*.csv`
- `/kaggle/working/artifacts/metrics/*.json`

## 5) Mapping label khuyen nghi tu 3 dataset

- `rwf2000`:
  - Fight -> `violence=1`
  - NonFight -> `violence=0`
- `ucf-crimes`:
  - Class anomaly (Abuse, Arrest, Assault, ...) -> `violence=1` (hoac mapping chi tiet theo policy)
  - Normal -> `violence=0`
- `data-dl`:
  - Nhom NSFW -> `nsfw=1`
  - Nhom Self Harm/Suicide -> `self_harm=1`
  - Hard negatives (medical/tool neutral) -> labels 0 neu an toan theo policy

Luu y: 1 sample co the co nhieu nhan (multi-label), vi du vua violence vua nsfw.

## 6) Kiem tra san sang truoc khi bam train

- Da attach du 3 dataset tren Kaggle.
- Da tao du 4 file labels CSV.
- Da tao du 4 manifest feature (`temporal_train/val`, `multitask_train/val`).
- Da co dung luong trong `/kaggle/working` de chua `.npy` va checkpoints.
- Da bat GPU trong notebook.

Neu tat ca dieu kien tren da dat, ban co the chay train ngay theo thu tu o muc 3.
