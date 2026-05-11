Đánh giá nhanh

    Cấu trúc cũ đã đúng hướng cho nghiên cứu: tách configs, src, scripts và checkpoints.
    Điểm chưa tối ưu cho Kaggle: chưa làm rõ đường dẫn chuẩn /kaggle/input (read-only), /kaggle/working (ghi file), và luồng xuất artifact để nộp output.
    Tên thư mục docs và doc đang không thống nhất. Nên chọn 1 tên duy nhất để tránh import/script lỗi đường dẫn.

Cấu trúc chuẩn đề xuất cho train trên Kaggle (V5.2)

Video-Moderation-V5.2/
│
├── configs/
│   ├── base.yaml                      # Cấu hình chung: seed, device, num_workers, logging
│   ├── ssl_spatial.yaml               # Giai đoạn 1: SwAV cho không gian
│   ├── ssl_temporal.yaml              # Giai đoạn 2: Temporal SSL
│   ├── finetune_multitask.yaml        # Giai đoạn 3: Fine-tuning đa nhiệm
│   └── inference.yaml                 # Ngưỡng cảnh báo và tham số suy luận
│
├── src/
│   ├── __init__.py
│   ├── data/
│   │   ├── dataset.py
│   │   ├── samplers.py                # Hybrid sampling cho YOLO + temporal sampling
│   │   └── augmentations.py
│   ├── models/
│   │   ├── vit_extractor.py
│   │   ├── temporal_transformer.py
│   │   ├── gated_fusion.py
│   │   ├── task_prompted_model.py
│   │   └── heads.py                   # NSFW head, multi-task classifier heads
│   ├── pipeline/
│   │   ├── shot_detector.py
│   │   ├── proxy_scorer.py
│   │   ├── optical_flow.py
│   │   ├── object_detector.py
│   │   └── nsfw_scorer.py
│   ├── training/
│   │   ├── engine.py                  # Vòng train/val chung
│   │   ├── losses.py
│   │   ├── metrics.py
│   │   └── callbacks.py               # Early stopping, checkpoint saver, lr scheduler hook
│   └── utils/
│       ├── io_paths.py                # Resolve path cho local và Kaggle
│       ├── logger.py
│       ├── reproducibility.py
│       └── distributed.py             # Tùy chọn nếu mở rộng multi-GPU
│
├── scripts/
│   ├── train_ssl_spatial.py
│   ├── train_ssl_temporal.py
│   ├── train_finetune.py
│   ├── evaluate.py
│   └── inference_video.py
│
├── notebooks/
│   ├── kaggle_train.ipynb             # Notebook chính để train trên Kaggle
│   ├── kaggle_eval.ipynb              # Notebook đánh giá nhanh sau train
│   └── eda_data_check.ipynb
│
├── artifacts/                         # Tạo local; trên Kaggle sẽ map sang /kaggle/working/artifacts
│   ├── checkpoints/
│   ├── logs/
│   ├── metrics/
│   └── submissions/
│
├── tests/
│   ├── test_dataset.py
│   ├── test_fusion_shapes.py
│   └── test_metrics.py
│
├── docs/                              # Dùng thống nhất docs (không dùng song song doc)
│   ├── kientruc.md
│   ├── kehoach.md
│   ├── cautructhumuc.md
│   └── kaggle_runbook.md
│
├── requirements.txt
├── requirements-kaggle.txt            # Bản tối giản, tương thích image Kaggle
├── .gitignore
└── README.md

Quy ước đường dẫn bắt buộc khi chạy trên Kaggle

    Input dataset: /kaggle/input/<dataset-slug>/...
    Working directory ghi file: /kaggle/working/
    Thư mục tạm: /kaggle/temp/
    Checkpoint và log: /kaggle/working/artifacts/checkpoints, /kaggle/working/artifacts/logs

Nguyên tắc để không vỡ pipeline khi chuyển Local <-> Kaggle

    Không hard-code đường dẫn trong code. Mọi script nhận --data_root và --output_root.
    Mọi tham số train nằm trong YAML, script chỉ nhận --config.
    Tách rõ script train từng giai đoạn thay vì gộp một file lớn.
    Luôn lưu best và last checkpoint để resume được khi Kaggle timeout phiên.
    Mỗi epoch ghi metrics ra CSV hoặc JSON để dễ vẽ lại khi rerun notebook.

Mẫu lệnh train trên Kaggle

    python scripts/train_ssl_spatial.py --config configs/ssl_spatial.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts

    python scripts/train_ssl_temporal.py --config configs/ssl_temporal.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --resume /kaggle/working/artifacts/checkpoints/ssl_spatial_best.pth

    python scripts/train_finetune.py --config configs/finetune_multitask.yaml --data_root /kaggle/input/your-dataset --output_root /kaggle/working/artifacts --resume /kaggle/working/artifacts/checkpoints/ssl_temporal_best.pth

Kết luận

    Cấu trúc cũ là ổn cho bản local nghiên cứu.
    Bản V5.2 ở trên là bản chuẩn hóa tốt hơn cho Kaggle: rõ đường dẫn hệ thống, dễ resume, dễ xuất model và log, đồng thời vẫn giữ nguyên triết lý module hóa của dự án.