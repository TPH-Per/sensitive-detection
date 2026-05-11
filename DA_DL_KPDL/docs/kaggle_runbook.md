# Kaggle Runbook

## 1) Chuẩn bị dataset
- Upload dataset lên Kaggle dưới dạng Kaggle Dataset (khuyến nghị chia theo loại: video, image labels, manifests).
- Sau khi attach vào Notebook, dữ liệu nằm ở /kaggle/input/<dataset-slug>/.

## 2) Cài dependency
pip install -r requirements-kaggle.txt

## 3) Chuan bi manifest cho tung nhanh
- Proxy gate (EfficientNet): manifests/proxy_train.csv, manifests/proxy_val.csv
- Temporal features: manifests/spatial_*.csv, manifests/temporal_*.csv, manifests/multitask_*.csv
- YOLO detector: yolo/data.yaml + labels theo format YOLO

## 4) Train Proxy gate (EfficientNet-B0)
python scripts/train_proxy_efficientnet.py --config configs/proxy_efficientnet.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

## 5) Train YOLOv8-nano detector
python scripts/train_yolov8.py --config configs/yolov8_nano.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

## 6) Trich xuat CLIP feature ra .npy
Labels CSV can have columns:
- relative_path, violence, self_harm, nsfw
- optional: sample_id, split, source

python scripts/build_clip_features.py --labels_csv /kaggle/input/your-dataset/labels_train.csv --input_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --manifest_out manifests/multitask_train.csv --max_frames 64 --batch_size 16

Run lai lenh tren cho moi split/manifest can train (vi du: manifests/temporal_train.csv, manifests/temporal_val.csv, manifests/multitask_val.csv).

Expected .npy tensor shape:
- [T, 768], with target T=64
- 768 is CLS embedding size of CLIP ViT-B/32

## 7) Chay SSL/Fine-tune cho Temporal model
python scripts/train_ssl_spatial.py --config configs/ssl_spatial.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

python scripts/train_temporal_ssl.py --config configs/temporal_ssl_pretext.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

python scripts/train_ssl_temporal.py --config configs/ssl_temporal.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --resume /kaggle/working/artifacts/checkpoints/temporal_ssl_last.pth

python scripts/train_finetune.py --config configs/finetune_multitask.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --resume /kaggle/working/artifacts/checkpoints/ssl_temporal_last.pth

## 8) Lưu output
- Toàn bộ kết quả nằm ở /kaggle/working/artifacts.
- Cuối phiên bấm Save Version để lưu output artifact.
