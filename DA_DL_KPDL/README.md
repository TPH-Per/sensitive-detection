# Video Moderation V5.2

Project scaffold optimized for Kaggle training.

## Training readiness checklist

- Proxy dataset manifest exists: manifests/proxy_train.csv, manifests/proxy_val.csv
- YOLO dataset yaml exists: yolo/data.yaml
- Temporal feature manifests exist: manifests/spatial_*.csv, manifests/temporal_*.csv, manifests/multitask_*.csv
- Feature tensors saved as .npy with shape [T, 768] (recommended T=64)

## Install

pip install -r requirements-kaggle.txt

## Command order

1) Train proxy gate (EfficientNet-B0)
python scripts/train_proxy_efficientnet.py --config configs/proxy_efficientnet.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

2) Train YOLOv8-nano
python scripts/train_yolov8.py --config configs/yolov8_nano.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

3) Build CLIP features to .npy
python scripts/build_clip_features.py --labels_csv /kaggle/input/your-dataset/labels_train.csv --input_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --manifest_out manifests/multitask_train.csv --max_frames 64 --batch_size 16

Run the same command for every split/manifest you train on (for example: manifests/temporal_train.csv, manifests/temporal_val.csv, manifests/multitask_val.csv).

4) Spatial SSL stage
python scripts/train_ssl_spatial.py --config configs/ssl_spatial.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

5) Temporal SSL pretext stage
python scripts/train_temporal_ssl.py --config configs/temporal_ssl_pretext.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

6) Temporal stage
python scripts/train_ssl_temporal.py --config configs/ssl_temporal.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --resume /kaggle/working/artifacts/checkpoints/temporal_ssl_last.pth

7) Spatiotemporal fine-tuning
python scripts/train_finetune.py --config configs/finetune_multitask.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --resume /kaggle/working/artifacts/checkpoints/ssl_temporal_last.pth
