# Phân Chia Công Việc - Nhóm 6 Thành Viên

Tài liệu này được viết dựa trên các file hiện có của dự án, đặc biệt là [capnhat01.md](capnhat01.md), [doc/kehoach.md](doc/kehoach.md), [doc/kientruc.md](doc/kientruc.md), [README.md](README.md), [docs/kaggle_runbook.md](docs/kaggle_runbook.md) và các script trong [scripts/](scripts/). Mục tiêu là chia việc cho 6 thành viên sao cho:

- phần nào có thể làm song song thì làm song song
- phần nào phải đợi artifact thì nêu rõ phụ thuộc
- phần nào nên làm chậm, kiểm tra kỹ, không nên train vội
- có một thứ tự thực hiện rõ ràng để dễ tổng hợp trên Kaggle

## 1. Tóm tắt luồng dự án

Pipeline hiện tại có thể hiểu gọn thành 6 khối:

1. Chuẩn hoá dữ liệu và sinh split: [scripts/prepare_kaggle_data.py](scripts/prepare_kaggle_data.py)
2. Tạo đầu vào nhẹ cho trạm 1 proxy: [scripts/build_proxy_arrays.py](scripts/build_proxy_arrays.py)
3. Chuẩn bị YOLO và train detector: [scripts/prepare_yolo_dataset.py](scripts/prepare_yolo_dataset.py), [scripts/train_yolov8.py](scripts/train_yolov8.py)
4. Train NSFW scorer riêng: [scripts/train_nsfw_scorer.py](scripts/train_nsfw_scorer.py)
5. Trích xuất CLIP feature + aux feature: [scripts/build_clip_features.py](scripts/build_clip_features.py)
6. Train temporal / fine-tune / evaluation: [scripts/train_temporal_ssl.py](scripts/train_temporal_ssl.py), [scripts/train_ssl_temporal.py](scripts/train_ssl_temporal.py), [scripts/train_finetune.py](scripts/train_finetune.py), [scripts/evaluate_challenge.py](scripts/evaluate_challenge.py)

## 2. Nguyên tắc phân công

- Ban đầu có thể tách thành 3 nhóm song song:
  - nhóm dữ liệu và manifest
  - nhóm proxy / YOLO / NSFW
  - nhóm CLIP feature / temporal / fine-tune / evaluation
- Các stage train lớn không nên train cùng lúc trên 1 GPU Kaggle vì sẽ tranh VRAM và làm chậm toàn bộ pipeline.
- Mỗi stage chỉ nên bắt đầu khi artifact đầu vào đã sẵn sàng:
  - data prep xong mới build proxy arrays và feature manifests
  - train proxy / train NSFW / train YOLO xong thì mới đưa weights vào build aux feature
  - build feature xong thì mới train temporal SSL
  - temporal SSL xong thì mới resume sang ssl_temporal
  - ssl_temporal xong thì mới fine-tune multitask
  - fine-tune xong mới evaluate challenge và inference full pipeline

## 3. Phân công 6 thành viên

### Thành viên 1 - Quản lý dữ liệu và taxonomy

**Trách nhiệm chính**

- Kiểm tra nguồn dữ liệu trên Kaggle theo đúng hướng trong [capnhat01.md](capnhat01.md) và [doc/kehoach.md](doc/kehoach.md)
- Chuẩn hoá taxonomy cho các nguồn video / ảnh:
  - RWF-2000
  - UCF-Crimes
  - UCF-101
  - Adult content dataset
  - Self Harm Detection
  - Suicide Detection
  - Surgical Tools Dataset
  - Wound dataset
  - NSFW dataset v1
- Đảm bảo split `train/val/test` và `challenge_holdout` không rò rỉ giữa các clip cùng gốc
- Kiểm tra các file manifest được tạo ra có đúng cột và đúng layout hay không

**File / script cần theo dõi**

- [scripts/prepare_kaggle_data.py](scripts/prepare_kaggle_data.py)
- [configs/kaggle_data_prep.yaml](configs/kaggle_data_prep.yaml)
- [manifests/README.md](manifests/README.md)
- [docs/kaggle_dataset_audit.md](docs/kaggle_dataset_audit.md)

**Sản phẩm đầu ra**

- `classification_master.csv`
- `classification_summary.json`
- `labels_proxy_*`, `labels_temporal_*`, `labels_multitask_*`, `labels_spatial_*`
- `labels_multitask_challenge.csv` nếu có challenge split

**Có thể làm song song với**

- Thành viên 2, 3, 4, 5, 6 ngay sau khi có schema manifest ban đầu

### Thành viên 2 - Trạm proxy và proxy arrays

**Trách nhiệm chính**

- Tạo proxy array từ video thành `.npy` 8 frame mẫu để train nhanh hơn
- Đảm bảo manifest proxy hỗ trợ cả `image manifest` và `array manifest`
- Train trạm 1 `EfficientNet-B0` theo [scripts/train_proxy_efficientnet.py](scripts/train_proxy_efficientnet.py)
- Tối ưu recall của class nguy cơ
- Viết / kiểm tra checkpoint và metric `proxy_efficientnet_best.pth`, `proxy_history.csv`

**File / script cần theo dõi**

- [scripts/build_proxy_arrays.py](scripts/build_proxy_arrays.py)
- [scripts/train_proxy_efficientnet.py](scripts/train_proxy_efficientnet.py)
- [src/data/proxy_array_dataset.py](src/data/proxy_array_dataset.py)
- [src/data/image_manifest_dataset.py](src/data/image_manifest_dataset.py)
- [src/models/proxy_efficientnet.py](src/models/proxy_efficientnet.py)
- [src/training/proxy_trainer.py](src/training/proxy_trainer.py)

**Phụ thuộc**

- Cần đợi Thành viên 1 xong `proxy_video_train/val/test.csv`
- Không cần đợi CLIP features

**Có thể làm song song với**

- Thành viên 3, 4, 5 trong lúc train proxy

### Thành viên 3 - YOLO và NSFW scorer

**Trách nhiệm chính**

- Chuẩn hoá dataset YOLO bằng [scripts/prepare_yolo_dataset.py](scripts/prepare_yolo_dataset.py)
- Train YOLOv8-nano bằng [scripts/train_yolov8.py](scripts/train_yolov8.py)
- Train NSFW scorer riêng bằng [scripts/train_nsfw_scorer.py](scripts/train_nsfw_scorer.py)
- Xuất 2 checkpoint quan trọng để phục vụ aux feature:
  - `yolo_runs/.../best.pt`
  - `nsfw_scorer_best.pth`

**File / script cần theo dõi**

- [scripts/prepare_yolo_dataset.py](scripts/prepare_yolo_dataset.py)
- [scripts/train_yolov8.py](scripts/train_yolov8.py)
- [scripts/train_nsfw_scorer.py](scripts/train_nsfw_scorer.py)
- [src/training/nsfw_trainer.py](src/training/nsfw_trainer.py)

**Phụ thuộc**

- Cần đợi Thành viên 1 xong phần taxonomy / label mapping
- Không cần đợi proxy training

**Có thể làm song song với**

- Thành viên 2, 4, 5

### Thành viên 4 - CLIP feature và aux feature

**Trách nhiệm chính**

- Sinh CLIP CLS feature `[T, 768]` từ video / ảnh bằng [scripts/build_clip_features.py](scripts/build_clip_features.py)
- Khi có `yolo_weights` và `nsfw_weights` thì sinh thêm aux feature:
  - optical flow magnitude
  - score từ YOLO
  - score từ NSFW scorer
- Tạo manifest riêng cho `temporal`, `multitask`, `spatial`
- Đảm bảo feature `.npy` được lưu đúng đường dẫn để loader có thể resolve trên Kaggle và local

**File / script cần theo dõi**

- [scripts/build_clip_features.py](scripts/build_clip_features.py)
- [src/data/manifest_dataset.py](src/data/manifest_dataset.py)
- [docs/kaggle_runbook.md](docs/kaggle_runbook.md)
- [manifests/README.md](manifests/README.md)

**Phụ thuộc**

- Cần đợi Thành viên 3 có checkpoint YOLO và NSFW nếu muốn bật aux feature đầy đủ
- Cần đợi Thành viên 1 có manifest labels chuẩn

**Có thể làm song song với**

- Thành viên 2 và 3 ở giai đoạn trước khi ghép aux feature

### Thành viên 5 - Spatial SSL và temporal pretext

**Trách nhiệm chính**

- Train SwAV spatial SSL bằng [scripts/train_ssl_spatial.py](scripts/train_ssl_spatial.py)
- Kiểm tra xem spatial backbone có output ổn định không
- Train temporal SSL pretext bằng [scripts/train_temporal_ssl.py](scripts/train_temporal_ssl.py)
- Quản lý chuyển tiếp checkpoint giữa spatial SSL và temporal pretext

**File / script cần theo dõi**

- [src/training/swav_trainer.py](src/training/swav_trainer.py)
- [src/data/swav_dataset.py](src/data/swav_dataset.py)
- [src/training/temporal_ssl_trainer.py](src/training/temporal_ssl_trainer.py)
- [configs/ssl_spatial.yaml](configs/ssl_spatial.yaml)
- [configs/temporal_ssl_pretext.yaml](configs/temporal_ssl_pretext.yaml)

**Phụ thuộc**

- Phải đợi Thành viên 4 có `temporal_train.csv`, `temporal_val.csv`
- Nếu muốn warm-start, có thể đợi Thành viên 3 có `ssl_spatial_best.pth`

**Có thể làm song song với**

- Thành viên 2, 3, 4 trong lúc sẵn sàng feature

### Thành viên 6 - Temporal combo, fine-tune, evaluation và inference

**Trách nhiệm chính**

- Chạy stage `ssl_temporal` bằng [scripts/train_ssl_temporal.py](scripts/train_ssl_temporal.py)
- Resume từ `temporal_ssl_last.pth`
- Chạy fine-tune `finetune_multitask` bằng [scripts/train_finetune.py](scripts/train_finetune.py)
- Đánh giá proxy, multitask, challenge holdout bằng:
  - [scripts/evaluate_proxy.py](scripts/evaluate_proxy.py)
  - [scripts/evaluate_multitask.py](scripts/evaluate_multitask.py)
  - [scripts/evaluate_challenge.py](scripts/evaluate_challenge.py)
- Chạy inference end-to-end bằng [scripts/run_inference_end_to_end.py](scripts/run_inference_end_to_end.py)

**File / script cần theo dõi**

- [src/training/engine.py](src/training/engine.py)
- [src/models/task_prompted_model.py](src/models/task_prompted_model.py)
- [src/models/gated_fusion.py](src/models/gated_fusion.py)
- [configs/ssl_temporal.yaml](configs/ssl_temporal.yaml)
- [configs/finetune_multitask.yaml](configs/finetune_multitask.yaml)
- [configs/inference.yaml](configs/inference.yaml)

**Phụ thuộc**

- Cần đợi Thành viên 5 xong temporal pretext checkpoint
- Cần đợi Thành viên 4 xong temporal feature manifests
- Cần đợi Thành viên 2 và 3 xong checkpoint proxy / YOLO / NSFW nếu muốn chạy inference đủ aux

## 4. Phần nào có thể train song song

### 4.1 Song song tốt nhất

1. Thành viên 2 train proxy gate
2. Thành viên 3 train YOLO + NSFW scorer
3. Thành viên 4 build CLIP features và manifests
4. Thành viên 5 setup SwAV spatial SSL, test pipeline temporal pretext

Những việc này có thể đi song song về mặt công việc và code, vì chúng không phụ thuộc trực tiếp vào nhau ngay từ đầu.

### 4.2 Có thể train song song nếu có nhiều máy / GPU riêng

1. Proxy gate và NSFW scorer
2. YOLO và SwAV spatial SSL
3. Build CLIP features cho `temporal`, `multitask`, `spatial` theo từng split `train/val/test`

### 4.3 Không nên train song song trên cùng 1 Kaggle GPU

1. `train_proxy_efficientnet.py`
2. `train_yolov8.py`
3. `train_nsfw_scorer.py`
4. `train_ssl_spatial.py`
5. `train_temporal_ssl.py`
6. `train_ssl_temporal.py`
7. `train_finetune.py`

Nếu chỉ có 1 GPU, nên chạy lần lượt. Những lệnh này nếu để song song trên cùng 1 GPU sẽ gây:

- tranh VRAM
- giảm tốc độ
- khó debug nếu crash

## 5. Thứ tự phải đợi nhau

Đây là chuỗi phụ thuộc cần giữ rất chặt:

1. `prepare_kaggle_data.py` xong trước
2. `build_proxy_arrays.py`, `prepare_yolo_dataset.py`, `build_clip_features.py` mới có đầu vào chuẩn
3. `train_proxy_efficientnet.py`, `train_yolov8.py`, `train_nsfw_scorer.py` có thể chạy cùng giai đoạn, nhưng vẫn nên tách job
4. `build_clip_features.py` với aux feature đầy đủ phải đợi checkpoint YOLO và NSFW
5. `train_temporal_ssl.py` phải đợi temporal feature manifest xong
6. `train_ssl_temporal.py` phải đợi `temporal_ssl_last.pth`
7. `train_finetune.py` phải đợi `ssl_temporal_last.pth`
8. `evaluate_challenge.py` phải đợi feature manifest challenge và checkpoint fine-tune
9. `run_inference_end_to_end.py` phải đợi ít nhất là config inference và các checkpoint cần thiết

## 6. Phần nào nên làm từ từ, làm kỹ

### Làm từ từ để tránh lỗi dữ liệu

- Taxonomy và mapping label
- Split group theo `group_id`
- Kiểm tra các file bị hỏng, file `.jpg` lỗi, file video không đọc được
- Kiểm tra cột manifest và path resolve

### Làm từ từ để tránh train sai

- Chạy proxy trên subset nhỏ trước
- Chạy YOLO trên dataset merged nhỏ trước
- Chạy NSFW scorer trên subset trước
- Chạy CLIP feature extraction với `--skip_existing` để test path
- Chạy temporal SSL trên manifest nhỏ trước khi bung full

### Làm từ từ để tránh nhầm stage

- `temporal_ssl_pretext` là stage pretext
- `ssl_temporal` là stage kết hợp temporal + spatial
- `finetune_multitask` là stage cuối để ra 3 logit cho violence / self_harm / nsfw

## 7. Kế hoạch thực hiện để nhóm 6 người chạy nhanh

### Pha 1 - 1 ngày đầu

- Thành viên 1: chốt taxonomy, split, summary manifest
- Thành viên 2: chuẩn bị proxy arrays và loader
- Thành viên 3: chuẩn bị YOLO dataset và NSFW scorer data
- Thành viên 4: test `build_clip_features.py` trên 1 subset nhỏ
- Thành viên 5: đọc và test config cho SwAV + temporal pretext
- Thành viên 6: đọc engine, kiểm tra forward model, chuẩn bị checklist evaluation

### Pha 2 - khi data prep đã ổn

- Thành viên 1 đóng vai trò QA cho manifest
- Thành viên 2 train proxy gate
- Thành viên 3 train YOLO và NSFW scorer
- Thành viên 4 build full CLIP features và aux features
- Thành viên 5 train SwAV spatial, sau đó train temporal SSL pretext
- Thành viên 6 setup eval script và chuẩn bị resume chain

### Pha 3 - khi đã có checkpoint đầu tiên

- Thành viên 5 chuyển checkpoint cho Thành viên 6
- Thành viên 6 train `ssl_temporal`
- Thành viên 6 train `finetune_multitask`
- Thành viên 6 chạy `evaluate_proxy`, `evaluate_multitask`, `evaluate_challenge`
- Thành viên 1 soát lại split nếu false positive / false negative cao
- Thành viên 2 và 3 điều chỉnh ngưỡng / dataset nếu cần

## 8. Đề xuất phân công theo vai trò thực tế

- **Thành viên 1 - Data lead**: taxonomy, split, manifest, QA dữ liệu
- **Thành viên 2 - Proxy lead**: proxy arrays, proxy gate, recall
- **Thành viên 3 - Detection lead**: YOLO, NSFW scorer, hard negatives
- **Thành viên 4 - Feature lead**: CLIP feature, aux feature, manifest feature
- **Thành viên 5 - SSL lead**: SwAV spatial, temporal pretext
- **Thành viên 6 - Integration lead**: ssl_temporal, fine-tune, evaluation, inference, ghép checkpoint

## 9. Definition of Done cho từng nhân sự

### Thành viên 1 xong khi

- có `classification_summary.json` hợp lệ
- có đầy đủ manifest `proxy`, `spatial`, `temporal`, `multitask`
- có `challenge_holdout` nếu dữ liệu cho phép

### Thành viên 2 xong khi

- train proxy ra `proxy_efficientnet_best.pth`
- có history và confusion matrix

### Thành viên 3 xong khi

- có `best.pt` của YOLO
- có `nsfw_scorer_best.pth`
- có checkpoint và metric riêng cho mỗi nhánh

### Thành viên 4 xong khi

- có feature `.npy` cho `train/val/test`
- có manifest feature đúng cột và resolve được trên Kaggle

### Thành viên 5 xong khi

- có `ssl_spatial_best.pth`
- có `temporal_ssl_best.pth`
- có resume chain ổn định

### Thành viên 6 xong khi

- có `ssl_temporal_last.pth`
- có `finetune_multitask_best.pth`
- có JSON metrics cho proxy, multitask, challenge
- có luồng inference chạy được end-to-end

## 10. Lưu ý thực tế khi chạy trên Kaggle

- `Kaggle Input` là read-only, code phải copy sang `Kaggle Working` trước khi cài dependency và chạy lệnh train
- Nguồn video lớn không nên copy sang working, chỉ copy project code
- Mỗi stage nên dùng `--skip_existing` nếu rerun sau khi timeout
- Nếu chỉ có 1 GPU, ưu tiên sequence:
  1. data prep
  2. proxy / YOLO / NSFW
  3. feature extraction
  4. SwAV + temporal pretext
  5. ssl_temporal
  6. fine-tune
  7. evaluation

## 11. Gộp lại thành lịch trình thống nhất

### Nhóm có thể làm ngay song song

- Data prep
- Proxy gate
- YOLO
- NSFW scorer
- CLIP feature test
- SwAV setup

### Nhóm phải chờ đầu ra

- Aux feature extraction phải chờ YOLO và NSFW checkpoint
- Temporal pretext phải chờ temporal manifest
- ssl_temporal phải chờ temporal pretext checkpoint
- Fine-tune phải chờ ssl_temporal checkpoint
- Challenge evaluation phải chờ feature manifest challenge + checkpoint fine-tune

### Nhóm làm chậm, kiểm tra kỹ

- taxonomy / split / holdout
- path resolve trong manifest
- checkpoint resume
- evaluation trên challenge holdout
- inference end-to-end

## 12. Kết luận

Nếu chia theo kế hoạch này, nhóm 6 người có thể làm song song ở 4 khối đầu, sau đó ghép lại theo đúng dependency để chạy được pipeline end-to-end trên Kaggle. Điểm quan trọng nhất là không để 3 stage train lớn tranh nhau GPU, và không cho fine-tune chạy trước khi feature / checkpoint đầu vào đã sẵn sàng.

Nếu cần, bước tiếp theo nên là:

1. Chốt tên 6 thành viên và đổi thành phân công thành bảng tên thật
2. Tôi có thể tạo tiếp bản `phanchiacongviec` theo dạng bảng 2 cột `Người phụ trách / Việc / Deadline / Phụ thuộc`
3. Tôi có thể làm tiếp một bản `timeline_14_ngay.md` để nhóm làm theo từng ngày