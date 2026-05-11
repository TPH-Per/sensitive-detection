# Báo Cáo 07 — Audit V6.1 Trước Khi Đưa Lên Kaggle

**Ngày audit:** 2026-05-02  
**Phạm vi audit:** pipeline hiện hành theo `run_kaggle01.md` và nhóm script `*_v6.py`

---

## 1. Kết luận ngắn gọn

Sau khi rà lại code hiện tại, mình **không thấy blocker logic mới ở Cell 6 -> Cell 8** của pipeline V6.1. Các phần này đã được kiểm tra lại ở mức:

- smoke test model: `src/models/task_gated_model.py` chạy PASS
- smoke test chuẩn bị dữ liệu Kaggle: `scripts/prepare_kaggle_data.py` chạy được trên bộ `artifacts/smoke_input3`
- smoke test chuỗi sau Cell 5: `prepare_data_v6.py -> train_e2e_v6.py -> calibrate_v6.py -> evaluate_v6.py` chạy được trên bộ feature giả lập `artifacts/cell678_smoke`

Tuy nhiên, cần nói thẳng:

1. **Chưa có bằng chứng trong máy local rằng toàn bộ real Kaggle datasets + real weights đã được rerun end-to-end lại trong đúng ngày 2026-05-02.**
2. **Cell 5 chỉ an toàn về mặt ML khi quality augmentation không làm bẩn val/test.** Vì vậy code hiện tại đã được sửa theo hướng an toàn:
   - nếu **không có** `features_manifest.csv` seed sẵn kèm cột `split`, script sẽ **tự tắt `quality_aug`**
   - nếu **có** `split=train/val/test`, script chỉ augment các hàng `split=train`

Nói ngắn: **project hiện tại đã sẵn sàng để mang lên Kaggle train theo nhánh V6.1**, nhưng cần tuân thủ đúng quy tắc của Cell 5 như ghi ở mục 5 dưới đây.

---

## 2. Chính sách nhãn bạo lực đã chốt

Các nhãn sau được xem là **violence = 1**:

- `Abuse`
- `Arrest`
- `Arson`
- `Assault`
- `Burglary`
- `Explosion`
- `Fighting`
- `RoadAccidents`
- `Robbery`
- `Shooting`

Các cập nhật đã áp vào code:

- `scripts/build_features_v6.py`
- `scripts/prepare_data_v6.py`
- `scripts/prepare_kaggle_data.py`
- `configs/kaggle_data_prep.yaml`

Quy tắc suy nhãn hiện tại ở Cell 5:

- `RWF-2000/Fight` -> `label_violence = 1`
- `RWF-2000/NonFight` -> `label_violence = 0`
- `UCF-Crimes/<10 class ở trên>` -> `label_violence = 1`
- `UCF-Crimes/normal folders` -> `label_violence = 0`
- `UCF-101/*` -> `label_violence = 0`

---

## 3. Phần nào dùng bộ dữ liệu nào

### 3.1 YOLO Weapon

**Mục đích:** tạo `yolo_feat`

**Positive:**

- HOD `gun`
- HOD `knife`

**Negative:**

- UCF-101 frames đã trích ở Cell 0.8

**Script chính:**

- `scripts/prepare_yolo_v6.py`
- `scripts/train_yolov8.py`

---

### 3.2 GoreDetector

**Mục đích:** tạo `gore_feat` cho V pool

**Positive:**

- `Blood_Violence.v1` class máu đã lọc bằng `categorize_image()`
- `HOD/blood` normal + hard cases

**Negative / hard negative:**

- `HOD/gun`
- `HOD/knife`
- `Wound_dataset copy`
- UCF-101 frames

**Nguyên tắc split:**

- `Blood_Violence.v1` dùng nguyên split `train/valid/test` của Roboflow
- HOD/Wound/UCF-101 được đưa vào train theo thiết kế hard-negative

**Script chính:**

- `scripts/train_gore_v6.py`
- `scripts/validate_experts.py`

---

### 3.3 SelfHarmDetector

**Mục đích:** tạo `selfharm_feat` cho **S token teacher**

**Positive:**

- `Self Harm Detection.v1i.yolov8/train/images`
- `Suicide Detection.v1i.yolov8(1)/train/images`

**Negative / hard negative:**

- `HOD/gun`
- sample từ `Blood_Violence` train
- `Wound_dataset copy` nếu có
- UCF-101 frames

**Val/Test dùng để gate:**

- `Self Harm Detection` `valid/images`
- `Self Harm Detection` `test/images`
- negative pool thêm từ `Blood_Violence valid` và UCF-101 `val/test`

**Script chính:**

- `scripts/train_selfharm_v6.py`
- `scripts/validate_experts.py`

---

### 3.4 NSFWClassifier

**Mục đích:** tạo `nsfw_feat` cho N token

**Positive:**

- `nsfw_dataset_v1/porn`
- `nsfw_dataset_v1/hentai`
- `nsfw_dataset_v1/sexy`

**Negative:**

- `nsfw_dataset_v1/neutral`
- `nsfw_dataset_v1/drawings`

**Nguyên tắc split:**

- split hash bằng `get_split_from_id`
- validate gate dùng đúng `test` split

**Script chính:**

- `scripts/train_nsfw_v6.py`
- `scripts/validate_experts.py`

---

### 3.5 Video Features 775-dim và E2E

**Mục đích:** train temporal video model cuối

**Video datasets dùng ở Cell 5:**

- `RWF-2000`
- `UCF-Crimes`
- `UCF-101`

**Feature layout:**

- `CLIP(768)`
- `Flow(3)`
- `YOLO(1)`
- `Gore(1)`
- `SelfHarm(1)`
- `NSFW(1)`

**Script chính:**

- `scripts/build_features_v6.py`
- `scripts/prepare_data_v6.py`
- `scripts/train_e2e_v6.py`
- `scripts/calibrate_v6.py`
- `scripts/evaluate_v6.py`

---

## 4. Shortcut do chất lượng video thấp đã xử lý thế nào

### 4.1 Bản chất shortcut

Nguồn gốc shortcut nằm ở chênh lệch domain:

- video bạo lực (`RWF-2000`, nhiều phần của `UCF-Crimes`) thường là CCTV, góc cao, mờ, nhiễu, độ phân giải thấp
- negative từ `UCF-101` thường HD hơn, bố cục đẹp hơn, ít nhiễu hơn

Nếu không can thiệp, model rất dễ học:

- `blurry / CCTV / top-view` -> `violence`
- hoặc tệ hơn:
  - `blurry + máu + súng` bị lan sai sang `S token`
  - `máu đánh nhau` bị hiểu sai thành `self_harm`

### 4.2 Cách xử lý đã chốt trong V6.1

#### A. Đổi teacher của S token

Không còn dùng GoreDetector làm teacher chính cho S token nữa.

Hiện tại:

- `S token` học từ `SelfHarmDetector`
- `GoreDetector` chỉ còn vai trò trong `V pool`

Ý nghĩa:

- giảm shortcut kiểu `có máu trong video bạo lực -> S token tăng sai`
- tách rõ hơn khái niệm `violence` và `self_harm`

#### B. Tạo `VideoQualityAugmentor`

Code ở:

- `src/data/video_augmentor.py`

Chiến lược:

- video bạo lực vốn mờ -> một phần được làm “HD hơn”
- video bình thường vốn rõ -> một phần được làm “surveillance-like” hơn

Mục tiêu:

- phá tương quan `quality <-> violence`
- buộc CLIP/context học hành vi thay vì học độ nét

#### C. Chặn sai về mặt ML

Điểm rất quan trọng:

- quality augmentation **không được phép** làm bẩn val/test

Vì vậy `scripts/build_features_v6.py` đã được sửa:

- nếu seed manifest có cột `split=train/val/test`
  - chỉ augment các hàng `split=train`
- nếu **không có split metadata**
  - script **tự tắt** `quality_aug`
  - mục tiêu là bảo vệ độ sạch của val/test sau Cell 6

Đây là quyết định đúng kiến thức machine learning hơn so với việc augment toàn bộ rồi mới split.

#### D. Có script probe riêng để audit shortcut

Script:

- `scripts/probe_shortcut.py`

Script này đã được cập nhật để:

- đọc đúng manifest V6.1 (`feature_path` / `violence`)
- load đúng checkpoint `model_state_dict`
- chạy được với feature 775-dim hiện tại

Ba probe:

1. blur effect
2. violence mean score
3. attention entropy ratio

---

## 5. Trạng thái Cell 5 và quy tắc dùng đúng

### 5.1 Điều đã sửa

Cell 5 trước đây có 2 rủi ro chính:

1. `label_violence` có thể sai hoặc toàn 0 nếu không seed manifest
2. `quality_aug` có thể vô tình áp lên toàn bộ videos trước khi split

Hiện tại đã sửa:

- nhãn bạo lực được infer tự động theo taxonomy tường minh
- `quality_aug` chỉ chạy khi có `split` metadata; nếu không có thì auto-disable

### 5.2 Cách dùng an toàn

**Trường hợp A — muốn train an toàn, sạch evaluation**

- chạy Cell 5 **không cần seed split manifest**
- script sẽ auto infer `label_violence`
- `quality_aug` sẽ bị tắt nếu không có cột `split`

Trường hợp này **an toàn để đi tiếp Cell 6-8**.

**Trường hợp B — muốn dùng quality augmentation đúng chuẩn**

- phải chuẩn bị trước `features_manifest.csv` seed sẵn với ít nhất:
  - `video_path`
  - `label_violence`
  - `split`
- trong đó `split` phải là `train/val/test`

Khi đó Cell 5 mới áp dụng `quality_aug` đúng vào train only.

---

## 6. Trạng thái các cell sau Cell 5

## 6.1 Cell 6 — `prepare_data_v6.py`

**Kết luận:** ổn về logic cho V6.1

Điểm đã xác nhận:

- đọc `features_manifest.csv`
- dùng `label_violence` đúng
- fallback path taxonomy có `Burglary`
- khóa test set bằng `test_set_lock.txt`
- xuất `train_manifest.csv`, `val_manifest.csv`, `test_manifest.csv`

Lưu ý:

- nếu môi trường chưa có `iterative-stratification`, script fallback sang `sklearn`
- Kaggle Cell 0 đã cài `iterative-stratification`, nên trên Kaggle sẽ dùng được stratified split đúng thiết kế

## 6.2 Cell 7 / 7b — `train_e2e_v6.py`

**Kết luận:** ổn về logic học máy cho V6.1

Các điểm đúng kiến thức ML:

- `Violence` dùng BCE thật
- `Self-harm` và `NSFW` không ép BCE giả lên video dataset không có ground-truth
- `S/N` học bằng KL distillation từ teacher frame-level
- early stopping dựa trên `Violence F2`
- checkpoint lưu đúng `model_state_dict`
- dataset loader tách đúng `CLIP(768)` và `AUX(7)`

Ngoài ra script đã được làm robust hơn:

- thêm `--num_workers`
- mặc định Windows/local = `0`, Kaggle Linux vẫn có thể dùng `4`

## 6.3 Cell 7.5 — `calibrate_v6.py`

**Kết luận:** chạy được với layout V6.1

Điểm đã xác nhận:

- load đúng `ManifestFeatureDataset`
- load đúng `model_state_dict`
- slicing aux đúng:
  - flow `0:3`
  - yolo `3:4`
  - gore `4:5`
  - selfharm `5:6`
  - nsfw `6:7`

## 6.4 Cell 8 — `evaluate_v6.py`

**Kết luận:** chạy được với layout V6.1

Điểm đã xác nhận:

- load đúng checkpoint
- slicing aux đúng V6.1
- report violence metrics thật
- self-harm / nsfw đang được report theo dạng weakly-supervised distribution, không giả vờ báo metric có ground-truth video-level

---

## 7. Bằng chứng audit đã chạy

### 7.1 Smoke test model

Đã chạy:

- `python src/models/task_gated_model.py`

Kết quả:

- PASS shape
- PASS backward
- PASS N-gate isolation với YOLO

### 7.2 Smoke test chuẩn bị dữ liệu Kaggle

Đã chạy:

- `python scripts/prepare_kaggle_data.py --input_root artifacts/smoke_input3 --output_root artifacts/smoke_audit_tmp --config configs/kaggle_data_prep.yaml`

Kết quả:

- script chạy xong
- taxonomy mới chấp nhận được
- export labels/runtime configs thành công

### 7.3 Smoke test chuỗi sau Cell 5

Đã chạy local trên bộ feature giả lập:

- `prepare_data_v6.py`
- `train_e2e_v6.py`
- `calibrate_v6.py`
- `evaluate_v6.py`
- `probe_shortcut.py`

Thư mục test:

- `artifacts/cell678_smoke/`

Kết quả:

- cả chuỗi chạy xong
- checkpoint `task_gated_v6_best.pth` được tạo
- calibrate/evaluate đọc được checkpoint và manifest V6.1

---

## 8. Những gì mình xác nhận được và chưa xác nhận được

### Đã xác nhận

- mapping nhãn bạo lực đúng theo danh sách mới, có `Burglary`
- Cell 6 -> Cell 8 không còn lỗi logic đã biết của V6.1
- `probe_shortcut.py` không còn stale theo manifest/checkpoint cũ
- `build_features_v6.py` không còn phụ thuộc vào việc phải seed nhãn thủ công mới chạy đúng

### Chưa thể khẳng định 100%

- chưa rerun toàn bộ real Kaggle pipeline với đúng full datasets trong ngày audit này
- chưa có metric mới của real Kaggle run sau khi áp các thay đổi ngày 2026-05-02
- quality shortcut chỉ được xử lý ở mức **đúng chuẩn** khi có split-aware manifest trước Cell 5

---

## 9. Kết luận cuối

Nếu mục tiêu là:

- **mang project hiện tại lên Kaggle để train tiếp**
- **giữ phần sau Cell 5 chạy đúng logic**
- **minh bạch dataset và mapping nhãn**

thì câu trả lời là:

**Có, nhánh V6.1 hiện tại đã đủ sạch để tiếp tục train trên Kaggle.**

Nhưng câu “không có vấn đề gì xảy ra cả” chỉ đúng khi hiểu chính xác như sau:

1. Cell 5 phải dùng bản code mới đã vá taxonomy và guard cho `quality_aug`
2. Cell 6-8 hiện không còn blocker logic đã biết
3. nếu muốn quality augmentation đúng chuẩn train-only, phải có seed manifest kèm `split`
4. metric thật cuối cùng vẫn phải tuân theo gate trên Kaggle, không được xem smoke test local là bằng chứng thay thế

---

## 10. File đã cập nhật trong lần audit này

- `scripts/build_features_v6.py`
- `scripts/prepare_data_v6.py`
- `scripts/prepare_kaggle_data.py`
- `configs/kaggle_data_prep.yaml`
- `scripts/probe_shortcut.py`
- `scripts/train_e2e_v6.py`
- `scripts/prepare_yolo_v6.py`
- `scripts/train_selfharm_v6.py`
- `scripts/validate_experts.py`
- `run_kaggle01.md`

---

## 11. Audit chi tiết Cell 1 -> Cell 5

### 11.1 Tóm tắt nhanh

| Cell | Trạng thái | Kết luận ngắn |
|---|---|---|
| Cell 1 | **PASS** | logic chuẩn bị YOLO hợp lý hơn trước, đã fail-fast khi thiếu dữ liệu |
| Cell 2 | **PASS CÓ ĐIỀU KIỆN** | phụ thuộc trực tiếp vào chất lượng Cell 1 và phải train lại checkpoint nếu checkpoint cũ sinh trước khi sửa split negatives |
| Cell 2.5 | **PASS** | dùng test split độc lập cho YOLO, đúng nguyên tắc ML |
| Cell 3 | **PASS CÓ ĐIỀU KIỆN** | thiết kế hard negatives và split tương đối đúng, nhưng vẫn có domain shift giữa train sources và test source |
| Cell 3.5 | **PASS CÓ ĐIỀU KIỆN** | ý tưởng đúng, nhưng positive set đánh giá nhỏ nên variance cao |
| Cell 4 | **PASS** | split hash rõ ràng, teacher NSFW tách train/val/test hợp lý |
| Cell 4.5 | **PASS** | gate đã tốt hơn sau khi calibration cho Gore/NSFW/SelfHarm đều tune nhiệt độ thật |
| Cell 5 | **PASS CÓ ĐIỀU KIỆN** | nhãn bạo lực đã rõ, nhưng xử lý shortcut bằng quality augmentation chỉ đạt chuẩn đầy đủ nếu có seed manifest kèm `split` |

---

### 11.2 Cell 1 — `prepare_yolo_v6.py`

**Đánh giá:** PASS

**Điểm đúng với machine learning:**

- gộp `gun + knife -> weapon` là nhất quán với mục tiêu của `yolo_feat`
- negative UCF-101 được split theo `video_id`, tránh leakage frame-level giữa train/val/test
- output đã có `train/valid/test` riêng, phục vụ đúng cho Cell 2 và Cell 2.5

**Điểm mình đã sửa để an toàn hơn:**

- nếu không tìm thấy positive HOD gun/knife -> script **dừng ngay**
- nếu không có UCF-101 frames từ Cell 0.8 -> script **dừng ngay**

**Kết luận Cell 1:**

- về logic ML: **đúng**
- về khả năng chạy: **ổn hơn trước** vì không còn kiểu “im lặng tạo data.yaml rỗng rồi hỏng ở Cell 2”

---

### 11.3 Cell 2 và Cell 2.5 — Train và test YOLO

**Đánh giá:** PASS CÓ ĐIỀU KIỆN

**Điểm đúng với machine learning:**

- Cell 2 train trên train split
- Cell 2 dùng val split nội bộ của Ultralytics cho early stopping
- Cell 2.5 đánh giá trên `split=test` độc lập

**Rủi ro còn lại:**

- nếu dùng lại `yolov8_weapon_v6_best.pt` cũ, được train trước khi sửa Cell 1, metric test có thể ảo
- chất lượng YOLO vẫn phụ thuộc mạnh vào việc Cell 0.8 trích đủ UCF-101 negatives và Cell 1 tạo split đúng

**Kết luận Cell 2/2.5:**

- mô tả trong runbook là **đúng**
- đây là nhánh khá sạch về mặt ML nếu checkpoint được train lại từ data mới sau khi sửa split negatives

---

### 11.4 Cell 3 — `train_gore_v6.py`

**Đánh giá:** PASS CÓ ĐIỀU KIỆN

**Điểm đúng với machine learning:**

- `Blood_Violence` dùng split `train/valid/test` có sẵn của Roboflow, không re-split bừa
- HOD blood chỉ dùng như positive train bổ sung, không còn dùng để “báo cáo test”
- HOD gun/knife, Wound, UCF-101 được dùng như hard/soft negatives có chủ đích
- có log `metrics/*.csv` theo epoch để xem overfit/underfit

**Rủi ro còn lại:**

- Gate test của Gore hiện thiên về `Blood_Violence test`, trong khi train positive còn có HOD/blood
- nghĩa là test sạch hơn trước, nhưng vẫn chưa phải benchmark đa-domain hoàn chỉnh

**Kết luận Cell 3:**

- về nguyên tắc ML: **đủ đúng để tiếp tục**
- về độ chắc chắn khoa học: **khá**, nhưng chưa thể xem là teacher hoàn toàn “đã giải quyết xong domain shift”

---

### 11.5 Cell 3.5 — `train_selfharm_v6.py`

**Đánh giá:** PASS CÓ ĐIỀU KIỆN

**Điểm đúng với machine learning:**

- giữ nguyên split Roboflow của `Self Harm Detection`, không re-split augmented images sang test
- thêm hard negatives đúng mục tiêu:
  - `HOD/gun`: súng thường khác súng kề đầu
  - `Blood_Violence`: máu đánh nhau khác tự hại
  - `Wound`: vết thương y tế khác tự hại
- UCF-101 negatives được chia theo hash cho `train/val/test`

**Rủi ro còn lại:**

- positive đánh giá thực vẫn nhỏ: `58 val + 29 test = 87`
- vì vậy AUC/Recall của SelfHarm teacher có variance cao hơn Gore/NSFW

**Kết luận Cell 3.5:**

- ý tưởng dữ liệu và kiến trúc teacher là **đúng hướng**
- nhưng đây vẫn là cell có **rủi ro khoa học cao nhất** trong Cell 1 -> 5 vì dữ liệu ít

---

### 11.6 Cell 4 — `train_nsfw_v6.py`

**Đánh giá:** PASS

**Điểm đúng với machine learning:**

- positive/negative mapping rõ:
  - positive: `porn`, `hentai`, `sexy`
  - negative: `neutral`, `drawings`
- split dùng `get_split_from_id`, đồng nhất với validate
- checkpoint chọn theo `val_f1`, hợp lý với bài toán nhị phân cần cân bằng precision/recall

**Rủi ro còn lại:**

- teacher này dùng `nsfw_dataset_v1` chứ không dùng thêm `adult_content_binary`
- nghĩa là domain của teacher vẫn hẹp hơn domain multitask image branch

**Kết luận Cell 4:**

- về mặt chạy và ML: **ổn**
- đây là cell ổn định hơn SelfHarm khá nhiều nhờ dữ liệu lớn hơn

---

### 11.7 Cell 4.5 — `validate_experts.py`

**Đánh giá:** PASS

**Điểm đúng với machine learning:**

- Gore gate dùng `Blood_Violence test` thay vì leak train positives
- NSFW gate dùng đúng `test` split hash
- SelfHarm gate dùng positive gốc `val+test` và negative pool từ `Blood_Violence valid + UCF-101 val/test`

**Điểm mình đã nâng cấp thêm:**

- Gate 2 calibration giờ không còn “ước lượng đại” cho NSFW/SelfHarm nữa
- hiện tại cả 3 expert đều có thể:
  - đo ECE
  - nếu ECE cao thì tune `Temperature T`
  - báo lại `best_T` thực sự cho Cell 5

**Kết luận Cell 4.5:**

- về mặt phương pháp: **đã đúng bài bản hơn trước**
- điểm yếu còn lại không nằm ở code, mà nằm ở dữ liệu SelfHarm quá ít

---

### 11.8 Cell 5 — `build_features_v6.py`

**Đánh giá:** PASS CÓ ĐIỀU KIỆN

**Điểm đúng với machine learning:**

- nhãn bạo lực đã được suy rõ ràng theo taxonomy, không còn phụ thuộc filename hash mơ hồ
- feature 775-dim nhất quán:
  - `CLIP(768) + Flow(3) + YOLO(1) + Gore(1) + SelfHarm(1) + NSFW(1)`
- `--batch_size` hiện đã được dùng thực sự cho CLIP extraction
- CLIP không còn bị load lặp đôi không cần thiết

**Điểm rất quan trọng về ML:**

- `quality_aug` chỉ được phép dùng khi có seed manifest với cột `split`
- nếu không có split-aware manifest, script tự tắt quality augmentation

Điều này có nghĩa:

- Cell 5 **an toàn** để sinh features sạch cho Cell 6-8
- nhưng Cell 5 chỉ **xử lý shortcut đầy đủ** khi bạn seed trước `video_path`, `label_violence`, `split`

**Kết luận Cell 5:**

- về engineering: **ổn**
- về nguyên tắc ML: **đúng trong safe mode**
- về tối ưu shortcut: **chưa đạt mức tốt nhất nếu không có split-aware seed manifest**

---

### 11.9 Kết luận riêng cho Cell 1 -> Cell 5

Nếu phải trả lời ngắn:

- **Cell 1 -> Cell 4.5 hiện đã đủ chuẩn để chạy Kaggle nghiêm túc**
- **Cell 5 đã sạch hơn rõ rệt**, nhưng để nói “đảm bảo toàn diện” thì vẫn cần seed manifest có `split` nếu muốn quality augmentation đúng train-only

Nói cách khác:

- về mặt **chạy được và đúng logic**: khá tốt
- về mặt **đúng chuẩn machine learning tuyệt đối**: còn 1 điểm điều kiện lớn ở Cell 5, và 1 điểm bất định khoa học ở dữ liệu SelfHarm

---

## 12. Ước lượng khả năng thành công

### 12.1 Nếu định nghĩa “thành công”

Mình tách làm 2 mức:

1. **Thành công kỹ thuật**:
   pipeline chạy được end-to-end trên Kaggle, không vỡ logic lớn, sinh được checkpoint và báo cáo test hợp lệ
2. **Thành công mô hình**:
   kết quả đủ thuyết phục để báo cáo, không chỉ chạy xong mà còn có giá trị kỹ thuật

### 12.2 Ước lượng hiện tại

- **Khả năng thành công kỹ thuật:** khoảng **80%**
- **Khả năng thành công mô hình tổng thể:** khoảng **65%**
- **Ước lượng chung nếu gộp cả hai:** khoảng **70%**

### 12.3 Vì sao không thấp hơn

Các yếu tố kéo xác suất lên:

- đa số lỗi logic nặng ở V6.1 đã được vá
- Cell 6 -> 8 đã có smoke test chạy được
- Cell 1 đã fail-fast, giảm nguy cơ hỏng dây chuyền từ dữ liệu rỗng
- Cell 4.5 đã có calibration thật cho cả 3 experts
- taxonomy bạo lực đã minh bạch và nhất quán hơn
- `probe_shortcut.py` và `build_features_v6.py` không còn ở trạng thái stale như trước

### 12.4 Vì sao không thể nói 85-90%

Các yếu tố kéo xác suất xuống:

- **SelfHarm teacher vẫn là điểm yếu dữ liệu lớn nhất**
  - positive đánh giá chỉ có 87 ảnh gốc
  - variance metric khá cao
- **S/N vẫn là weak supervision**
  - video dataset không có ground-truth thật cho self-harm và nsfw
  - mô hình vẫn phải dựa vào teacher frame-level
- **Cell 5 chỉ xử lý shortcut ở mức tốt nhất khi có split-aware manifest**
  - nếu không có seed split, code sẽ chọn safe mode và tắt quality augmentation
  - cách này đúng ML hơn, nhưng giảm phần “chủ động phá shortcut”
- **thời gian Kaggle và dependency risk vẫn có thật**
  - Cell 5 dài
  - session timeout / dependency / dataset path sai vẫn có thể làm mất một lượt chạy

### 12.5 Cách tăng xác suất thành công từ ~70% lên ~80%

1. Seed trước `features_manifest.csv` cho Cell 5 với cột `video_path`, `label_violence`, `split`
2. Train lại YOLO từ đầu bằng dataset đã qua Cell 1 mới
3. Không bỏ qua Cell 4.5; chỉ dùng đúng `best_T` mà script in ra
4. Sau Cell 5, chạy ngay `validate_features.py`
5. Dành một lượt Kaggle riêng chỉ để xác nhận lại metrics của 3 experts sau rerun

---

## 13. Kết luận bổ sung cho câu hỏi “đã đảm bảo hết chưa?”

Nếu hiểu “đảm bảo hết” theo nghĩa tuyệt đối 100% thì câu trả lời là:

**Chưa.**

Lý do:

- dữ liệu SelfHarm còn ít
- S/N vẫn không có video-level ground truth
- Cell 5 muốn chuẩn nhất vẫn cần split-aware seed manifest

Nếu hiểu “đủ chắc để tiếp tục Kaggle run thật, có kiểm soát rủi ro, và không còn lỗi logic nghiêm trọng đã biết” thì câu trả lời là:

**Có.**

Đó là lý do mình đánh giá dự án hiện ở mức khoảng **70% khả năng thành công tổng thể**.
