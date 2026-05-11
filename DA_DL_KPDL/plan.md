
TÀI LIỆU KỸ THUẬT

Video Content Moderation Pipeline

Phân tích, Cải thiện & Kế hoạch Thực thi

Phiên bản 2.0  |  Tháng 4/2026

1. Mô tả tổng quan dự án (cập nhật)
Video Content Moderation Pipeline là một hệ thống phân tích video đa nhãn (multi-label), được xây dựng theo kiến trúc staged và chạy trên Kaggle GPU (Tesla T4, 15 GB VRAM). Mục tiêu cốt lõi là phát hiện ba loại nội dung nguy hại trong video:
violence — bạo lực thể chất
self_harm — tự làm hại bản thân
nsfw — nội dung người lớn không phù hợp

Hệ thống kết hợp nhiều nhánh mô hình:
Spatial branch: SwAV SSL → trích xuất đặc trưng không gian
Temporal branch: Transformer SSL → mã hoá trình tự thời gian qua CLIP features
Object detection branch: YOLOv8-nano → phát hiện đối tượng nguy hiểm / y tế
NSFW scorer: mô hình phụ → sinh auxiliary feature

Dữ liệu đầu vào gồm 9+ dataset từ nhiều nguồn: RWF-2000, UCF-Crimes, UCF-101, các bộ NSFW / Self-harm / Surgical Tools được chuẩn hoá về một taxonomy thống nhất trước khi đưa vào pipeline. Toàn bộ output bao gồm checkpoint, metric, manifest và threshold JSON được lưu trong /kaggle/working/artifacts.

Bản cập nhật v2.0 này đề xuất: WeightedRandomSampler cho multitask, test suite cơ bản, fallback monitoring, source-bias diagnostic, và chuẩn hoá luồng calibration → export → inference. Tuy nhiên, trước khi thực thi cần rà lại mức độ tương thích với code hiện tại và xác nhận từng giả định bằng dữ liệu thực tế.


2. Đánh giá tổng quan — Điểm mạnh & Điểm yếu
2.1 Điểm mạnh
Modular staged architecture
Mỗi stage là một script Python độc lập với checkpoint, resume, history CSV và summary JSON.
Có thể chạy lại từng stage mà không cần retrain toàn bộ pipeline.
Cấu hình tập trung qua YAML, dễ thay đổi hyperparameter.


Multimodal feature fusion
CLIP visual embedding [T, 768] + optical flow magnitude + YOLO score + NSFW score.
GatedFusion module kết hợp các tín hiệu với attention gate — không phải concat đơn giản.
TaskPromptedModel dùng task token + cross-attention từ task → frame tokens.


Inference pipeline khép kín
run_inference_end_to_end.py bao gồm: scene detection → proxy gate → feature extraction → auxiliary branches → temporal model → thresholding → JSON output.
Fallback graceful khi thiếu TransNetV2 (single-scene) hoặc YOLO (bỏ qua aux feature).
Threshold được đọc từ calibration JSON thay vì hardcode.


Challenge holdout & calibration
Có challenge split/bucket để đánh giá edge case, nhưng cần xác minh chính xác tên bucket và cách map trong manifest trước khi chốt kế hoạch.
ROC-AUC, PR-AUC, ROC plot, PR plot là mục tiêu đánh giá hợp lý, nhưng chỉ nên coi là “đã tích hợp” khi kiểm tra trực tiếp script evaluate hiện có.
Threshold theo Youden / F1 / F2 là hướng đúng, nhưng phải đi kèm bước export JSON và kiểm tra tính nhất quán giữa validation và inference.


2.2 Điểm yếu (cần cải thiện)
Vấn đề
Trạng thái hiện tại
Hệ quả
Mức độ ưu tiên
Test coverage
Cực kỳ yếu
Bug logic (bias manifest, shape mismatch) không bị bắt tự động
Cao
Silent fallback
Trung bình
Thiếu dependency → model vẫn chạy nhưng chất lượng giảm âm thầm
Cao
Sampler imbalance
Đã có pos_weight nhưng chưa có sampler
Class 000 vẫn áp đảo ở batch level
Trung bình
Threshold fallback
Có hỗ trợ JSON nhưng chưa enforce
Nếu thiếu JSON thì fallback về default config
Trung bình
Source bias
Manifest sort theo source gây lệch prefix
Đã fix KNN bug nhưng bias vẫn tồn tại trong data
Trung bình
OOM risk
batch_size đã giảm nhưng chưa có guard
T4 15GB có thể OOM nếu config bị override
Thấp



3. Phân tích chi tiết các điểm cần cải thiện
3.1 Test coverage — Ưu tiên cao
Lý do cần cải thiện:
Test hiện tại trong repo còn rất mỏng và chủ yếu mang tính placeholder. Các lỗi nguy hiểm nhất của pipeline kiểu này thường là lỗi logic và lỗi shape/manifest, ví dụ: overlap split, lệch feature dimension, sai đường dẫn feature, sai threshold mapping, hoặc fallback âm thầm khi thiếu dependency. Những lỗi này có thể không lộ ngay khi chạy training một epoch, nhưng sẽ làm kết quả cuối cùng sai lệch.

Đề xuất cải thiện:
Unit test cho manifest builder: kiểm tra không overlap giữa train/val/test theo video path hoặc theo source_id nếu có
Unit test cho threshold loader: xác nhận load JSON đúng, thiếu file thì báo rõ ràng, và fallback phải được log/raise theo policy đã chọn
Integration test cho feature shape: kiểm tra CLIP output [T, 768] đúng dimension trước khi lưu .npy, đồng thời kiểm tra aux dim khớp config
Integration test cho inference pipeline: dùng mock video ngắn hoặc fixture feature .npy, chạy end-to-end và xác nhận output JSON hợp lệ
Regression test cho evaluate_challenge.py: xác nhận bucket metrics chạy được trên CSV thực tế và không phụ thuộc vào giả định chưa có trong manifest

3.2 Silent fallback monitoring — Ưu tiên cao
Lý do cần cải thiện:
Inference hiện có fallback rõ ràng cho một số dependency thiếu, ví dụ TransNetV2 hoặc YOLO không sẵn thì pipeline vẫn có thể chạy tiếp. Điều này tốt cho độ bền, nhưng rất dễ làm người dùng nhầm rằng đây vẫn là kết quả của cùng một cấu hình mô hình đầy đủ. Vì vậy cần cơ chế ghi nhận rõ branch nào thực sự active trong mỗi lần chạy.

Đề xuất cải thiện:
Thêm FeatureReport hoặc inference manifest nhỏ để ghi lại branches nào đã active trong mỗi inference run
Log WARNING mỗi khi fallback được kích hoạt, không chỉ INFO
Ghi feature_report.json vào artifacts directory cùng với metrics và inference output
Trong evaluate_challenge.py hoặc run_inference_end_to_end.py: nếu policy yêu cầu branch nào đó là bắt buộc thì phải fail rõ ràng thay vì im lặng bỏ qua

3.3 WeightedRandomSampler cho multitask — Ưu tiên trung bình
Lý do cần cải thiện:
pos_weight trong BCEWithLogitsLoss xử lý imbalance ở tầng loss, nhưng không thay đổi phân phối của batch. Nếu dataset lệch mạnh về negative hoặc class an toàn, nhiều batch sẽ thiếu tín hiệu dương cho class hiếm. Tuy vậy, trước khi thêm sampler, cần xác nhận dataset thật sự có phân phối lệch đủ lớn và không làm tăng overfitting lên các mẫu hiếm.

Đề xuất cải thiện:
Nếu thống kê label cho thấy imbalance rõ ràng, thêm WeightedRandomSampler hoặc sample weights cho train loader
Ưu tiên weight theo multi-label presence hoặc theo class hiếm nhất trong sample, nhưng phải đo batch distribution sau khi bật sampler
Kết hợp sampler + pos_weight chỉ khi kết quả thực nghiệm cho thấy có lợi; nếu sampler làm mất ổn định training thì giữ pos_weight בלבד
Config flag use_sampler: true trong finetune_multitask.yaml để có thể toggle
Theo dõi batch label distribution trong training log để xác nhận sampler hoạt động

3.4 Enforce calibration flow — Ưu tiên trung bình
Lý do cần cải thiện:
Hiện tại inference đã có cơ chế đọc thresholds JSON, nhưng vẫn có fallback sang threshold mặc định nếu file không được cung cấp. Đây không hẳn là sai về kỹ thuật, nhưng rất dễ làm lệch so với validation nếu người vận hành quên export threshold sau calibration. Vì vậy cần quyết định rõ policy: hoặc bắt buộc thresholds JSON, hoặc chấp nhận fallback nhưng phải ghi nhận rất rõ trong output.

Đề xuất cải thiện:
Trong run_inference_end_to_end.py: thêm chế độ strict_thresholds để fail khi thiếu thresholds JSON, còn chế độ mặc định vẫn có thể fallback nếu chủ động cho phép
Thêm validate_threshold_json() function: kiểm tra JSON có đủ 3 key (violence, self_harm, nsfw) không và giá trị nằm trong [0, 1]
Trong kaggle_runbook.md: ghi rõ bước export threshold JSON là mandatory nếu chạy strict mode
Thêm threshold_source vào output JSON của inference: ghi lại threshold đến từ đâu và có dùng fallback hay không

3.5 Source bias diagnostic — Ưu tiên trung bình
Lý do cần cải thiện:
Source bias là rủi ro có thật khi dữ liệu đến từ nhiều bộ khác nhau. Nếu một source chiếm đa số trong train nhưng không tương xứng ở val/test, model có thể học domain-specific cues thay vì moderation semantics. Tuy nhiên, ngưỡng cứng như 60% chỉ nên xem là heuristic, không nên biến thành luật tuyệt đối nếu dataset thực tế không đủ lớn để split đẹp.

Đề xuất cải thiện:
Thêm source_distribution_check() vào prepare_kaggle_data.py hoặc script chuẩn hoá metadata gần nhất
Script in ra: % mỗi source trong train vs val vs test split và cảnh báo khi chênh lệch quá lớn
Nếu một source chiếm áp đảo, ưu tiên re-split stratified hoặc ít nhất ghi rõ ràng trong report thay vì âm thầm chấp nhận
Bổ sung source summary vào metadata output để các lần chạy sau có thể so sánh


4. Hướng dẫn thực hiện chi tiết
4.1 Thêm WeightedRandomSampler hoặc sample weighting
File cần tạo/sửa nếu xác nhận imbalance đủ lớn:
src/data/balanced_sampler.py (tạo mới)
src/training/engine.py hoặc loader helper tương ứng (sửa dataloader setup)
configs/finetune_multitask.yaml (thêm flag)

Hướng triển khai an toàn:
- Ưu tiên bắt đầu bằng sample weighting / sampler thử nghiệm trên train loader
- Không bật đồng thời sampler và mọi cơ chế cân bằng khác nếu chưa đo được lợi ích
- Đo lại batch distribution, loss curve, và per-label recall trước khi giữ vào default config

Pseudo-code:
import numpy as np
from torch.utils.data import WeightedRandomSampler

def build_multitask_sampler(labels_df, cap=10.0):
    any_pos = (labels_df[['violence','self_harm','nsfw']].sum(axis=1) > 0).astype(int)
    pos_count = any_pos.sum()
    neg_count = len(any_pos) - pos_count
    pos_weight = min(neg_count / max(pos_count, 1), cap)
    weights = np.where(any_pos == 1, pos_weight, 1.0)
    return WeightedRandomSampler(weights, num_samples=len(weights), replacement=True)

Config flag gợi ý:
target:
  use_sampler: false   # bật khi đã xác nhận có lợi qua thực nghiệm
  sampler_cap: 10.0
  use_pos_weight: true
  pos_weight_cap: 20.0


4.2 Thêm test suite cơ bản nhưng ưu tiên realistic coverage
File nên tạo/sửa nếu thật sự triển khai test:
tests/test_manifest.py
tests/test_threshold.py
tests/test_feature_shape.py
tests/test_inference_smoke.py

Lưu ý:
- `tests/test_knn_eval.py` chỉ nên tạo nếu repo thật sự còn pipeline KNN evaluation đang được dùng; nếu không, test này dễ biến thành test giả.
- Tránh viết test phụ thuộc cứng vào path Kaggle nếu không có fixture hoặc tmp_path.
- Tập trung vào test có giá trị cao: manifest integrity, threshold parsing, shape compatibility, inference smoke.

Ví dụ test manifest:
import pandas as pd

def test_no_train_val_overlap():
    train = pd.read_csv('manifests/multitask_train.csv')
    val = pd.read_csv('manifests/multitask_val.csv')
    overlap = set(train['relative_path']) & set(val['relative_path'])
    assert len(overlap) == 0

Ví dụ test threshold:
import json
from src.utils.thresholds import load_threshold_map

def test_threshold_json_complete(tmp_path):
    t = {'violence': 0.4, 'self_harm': 0.3, 'nsfw': 0.5}
    p = tmp_path / 'thresh.json'
    p.write_text(json.dumps(t))
    result = load_threshold_map(str(p))
    for key in ['violence', 'self_harm', 'nsfw']:
        assert key in result

Nếu muốn test warning/fallback, cần xác nhận trước behavior hiện tại của `load_threshold_map()` để tránh test khẳng định sai chính sách.


4.3 Thêm fallback monitoring theo hướng nhẹ và nhất quán
File nên tạo/sửa nếu triển khai:
src/utils/feature_report.py (tạo mới nếu cần)
scripts/run_inference_end_to_end.py (sửa)

Hướng thiết kế an toàn:
- Ghi nhận những branch nào thực sự active thay vì cố ép toàn bộ run phải hoàn hảo
- Mức bắt lỗi nên tuỳ chế độ: strict mode thì fail, permissive mode thì log + lưu report
- Tránh tạo một lớp báo cáo quá nặng nếu chỉ cần JSON metadata đơn giản

Pseudo-code:
from dataclasses import dataclass, field, asdict
import json, logging

@dataclass
class FeatureReport:
    clip_features: bool = False
    yolo_aux: bool = False
    nsfw_aux: bool = False
    optical_flow: bool = False
    scene_detection: bool = False
    threshold_source: str = 'unknown'
    warnings: list = field(default_factory=list)

    def register_fallback(self, branch: str, reason: str):
        msg = f'FALLBACK [{branch}]: {reason}'
        self.warnings.append(msg)
        logging.warning(msg)

    def save(self, path: str):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(asdict(self), f, indent=2)



5. Pipeline cập nhật (v2.0)
Pipeline v2.0 giữ nguyên kiến trúc staged, nhưng chỉ nên xem các thay đổi mới là **đề xuất có điều kiện** cho đến khi qua bước xác minh dữ liệu và chạy thử nhỏ trên repo thực tế.

Component
Trước (v1.x)
Sau (v2.0)
Data Prep (Stage 1)
Cũ: chuẩn hoá + split
Mới: + source_distribution_check() bắt buộc, cảnh báo nếu 1 source > 60%
Proxy Gate (Stage 2a)
Cũ: EfficientNet-B0
Mới: giữ nguyên + OOM guard (chunked forward mặc định)
Training Engine (Stage 4-5)
Cũ: chỉ pos_weight
Mới: + WeightedRandomSampler kết hợp pos_weight + batch distribution log
Calibration Flow
Cũ: export JSON tuỳ chọn
Mới: export JSON bắt buộc, validate_threshold_json() trước inference
Inference
Cũ: fallback âm thầm
Mới: + FeatureReport, log WARNING, lưu feature_report.json
Testing
Cũ: không có
Mới: tests/ directory với 4 test file cơ bản



6. Kỳ vọng cải thiện sau thay đổi
Cải thiện
Metric ảnh hưởng
Kỳ vọng cụ thể
Lợi ích phụ
WeightedRandomSampler
Recall class hiếm (self_harm, nsfw)
+5–15% recall trên positive hard bucket
Giảm bias về class 000
Test suite
Bug detection speed
Bắt được bug logic trong vài phút thay vì vài giờ training
Giảm thời gian debug cycle
Fallback monitoring
Reproducibility
Mỗi run có feature_report.json để compare
Tránh so sánh kết quả của model không đồng đều
Enforce calibration
Inference accuracy
Threshold luôn phù hợp với validation distribution
Giảm FP/FN do threshold mismatch
Source bias check
Generalization
Phát hiện sớm train/val domain shift
Tránh overfit theo nguồn dữ liệu cụ thể


Kỳ vọng tổng thể
F2-score trên positive hard bucket: +8–15% (nhờ sampler + pos_weight kết hợp)
Debug cycle: -60% thời gian (nhờ test suite bắt lỗi sớm)
Inference consistency: 100% runs có threshold trace (nhờ enforce calibration flow)
Silent failure rate: giảm đáng kể (nhờ FeatureReport + WARNING log)



7. Kế hoạch thực thi — Waterfall & Song song
7.1 Sơ đồ phụ thuộc
Các bước có thể thực hiện song song được nhóm theo Phase. Các Phase phải thực hiện tuần tự (waterfall).

Phase 0 — Chuẩn bị (tuần tự, 1–2 ngày)
0.1  Toàn nhóm đọc tài liệu kỹ thuật này và thống nhất phân công
0.2  Setup môi trường Kaggle, xác nhận 3 dataset đã được attach
0.3  Chạy prepare_kaggle_data.py và kiểm tra manifest output
0.4  Xác nhận source distribution — nếu vi phạm 60%, re-split trước khi tiếp tục
>>> Toàn bộ Phase 1 chờ Phase 0 hoàn thành


Phase 1 — Song song (4–6 ngày)
[TV1]  Thêm test suite: tests/test_manifest.py, tests/test_knn_eval.py, tests/test_threshold.py, tests/test_feature_shape.py
[TV2]  Thêm WeightedRandomSampler: src/data/balanced_sampler.py + sửa engine.py + sửa config
[TV3]  Thêm FeatureReport: src/utils/feature_report.py + sửa inference script
[TV4]  Train Proxy Gate (EfficientNet-B0) — dùng manifest từ Phase 0
[TV5]  Train YOLO + NSFW scorer song song với TV4
[TV6]  Thêm enforce calibration: validate_threshold_json() + assert trong inference
>>> TV1, TV2, TV3, TV6 có thể làm ngay khi Phase 0 xong
>>> TV4, TV5 cần manifest từ Phase 0 và GPU riêng


Phase 2 — CLIP Feature Extraction (tuần tự, 2–3 ngày)
2.1  [Chờ TV4, TV5 xong] Chạy build_clip_features.py với YOLO weights từ TV5
2.2  Sinh aux features: optical flow + YOLO score + NSFW score
2.3  Validate feature shape [T, 768] và aux dimensions
2.4  Chạy test_feature_shape.py để xác nhận
>>> Phase 3 chờ Phase 2 hoàn thành


Phase 3 — SSL Training (tuần tự + một phần song song, 3–5 ngày)
[TV-A]  Train Spatial SSL (SwAV) — dùng feature từ Phase 2
[TV-B]  Train Temporal SSL pretext — có thể chạy song song với TV-A nếu có GPU riêng
3.3    [Chờ TV-B] Resume sang ssl_temporal stage
>>> Chú ý: chỉ train 1 stage lớn / GPU tại một thời điểm nếu dùng chung T4


Phase 4 — Multitask Fine-tune & Calibration (tuần tự, 2–3 ngày)
4.1  [Chờ Phase 3] Fine-tune với WeightedRandomSampler + pos_weight (từ TV2)
4.2  Chạy evaluate_multitask.py: ROC-AUC, PR-AUC, threshold calibration
4.3  Export thresholds.json (bắt buộc)
4.4  Validate threshold JSON với validate_threshold_json() (từ TV6)
4.5  Chạy evaluate_challenge.py trên normal_hard và positive_hard buckets


Phase 5 — Inference & Review (tuần tự, 1–2 ngày)
5.1  [Chờ Phase 4] Chạy run_inference_end_to_end.py với thresholds.json
5.2  Kiểm tra feature_report.json — xác nhận tất cả branches active
5.3  Review kết quả cuối cùng, so sánh metric với baseline
5.4  Nếu F2-score positive hard chưa đạt kỳ vọng → điều chỉnh sampler_cap hoặc pos_weight_cap và lặp lại Phase 4


7.2 Phân công 6 thành viên
Thành viên
Phase phụ trách
Nhiệm vụ
Ghi chú
Thành viên 1
Phase 0 + Phase 2
Data prep, manifest audit, CLIP feature extraction
Cần Phase 0 xong trước
Thành viên 2
Phase 1 TV2 + Phase 3 TV-B
WeightedRandomSampler + Temporal SSL training
TV2 song song với các TV khác
Thành viên 3
Phase 1 TV4
Proxy Gate training (EfficientNet-B0)
Cần manifest từ Phase 0
Thành viên 4
Phase 1 TV5
YOLO + NSFW scorer training
Cần manifest từ Phase 0
Thành viên 5
Phase 1 TV1 + TV6
Test suite + enforce calibration
Có thể bắt đầu ngay sau Phase 0
Thành viên 6
Phase 1 TV3 + Phase 4-5
FeatureReport + multitask fine-tune + evaluation
TV3 song song, Phase 4-5 tuần tự


7.3 Ước tính thời gian tổng
Phase
Thời gian ước tính
Phase 0 — Chuẩn bị
1–2 ngày
Phase 1 — Song song
4–6 ngày (chạy đồng thời 6 người)
Phase 2 — CLIP features
2–3 ngày
Phase 3 — SSL training
3–5 ngày (phụ thuộc GPU availability)
Phase 4 — Fine-tune + calibration
2–3 ngày
Phase 5 — Inference + review
1–2 ngày
Tổng (lý tưởng)
13–21 ngày
Tổng (thực tế, có buffer)
3–4 tuần



8. Kết luận cập nhật sau khi đối chiếu Kaggle

Tóm tắt đánh giá project:

- Kiến trúc tổng thể là tốt: pipeline staged, có checkpoint, có calibration, có inference end-to-end.
- Dữ liệu Kaggle đã có split rõ ràng: `train` / `val` / `test` và thêm `challenge_holdout`, nên đây không phải là dự án chưa biết chia dữ liệu.
- Tuy vậy, phân phối theo source và theo nhánh dữ liệu vẫn lệch, nên cảnh báo về source bias trong plan là có cơ sở.
- Với phần chống lệch nhãn, code hiện tại mới có `pos_weight` trong loss và calibration threshold; `WeightedRandomSampler` vẫn chưa được triển khai.
- Test coverage hiện vẫn yếu vì các test file chính còn là placeholder, nên plan nói đúng khi coi đây là rủi ro cao.
- Threshold JSON đã được hỗ trợ trong inference, nhưng vẫn là tùy chọn, nên chưa thể coi là policy bắt buộc.

Diễn giải ngắn:

- Plan.md không nói rằng Kaggle không có split.
- Plan.md đang nói rằng, ngay cả khi split đã có, vẫn cần kiểm chứng xem split đó có đủ đại diện, có lệch nguồn hay không, và có đủ safeguard để tránh fallback âm thầm hay không.
- Vì vậy, phần "cần cải thiện" trong plan là backlog hợp lý, không phải phán quyết rằng toàn bộ pipeline đang sai.

8.1 Checklist đọc nhanh

- Đã chắc: dữ liệu có `train` / `val` / `test` / `challenge_holdout`.
- Đã chắc: test suite hiện vẫn quá yếu để bắt lỗi logic một cách tin cậy.
- Đã chắc: hiện mới có `pos_weight`; chưa có `WeightedRandomSampler`.
- Đã chắc: inference đọc được `thresholds_json`, nhưng chưa bắt buộc phải có.
- Cần kiểm tra tiếp: per-label recall, false negative trên class hiếm, và lợi ích thực nghiệm của sampler nếu có thêm.
- Cần kiểm tra tiếp: performance theo từng source / bucket để xem source bias có làm model lệch không.

8.2 Kết luận thực dụng

Nếu ưu tiên an toàn và tính đúng, nên coi plan v2.0 là một danh sách việc cần xác minh theo thứ tự:

1. Giữ `pos_weight` và calibration làm baseline hiện tại.
2. Thay các test placeholder bằng test thật cho manifest, threshold, feature shape và inference smoke.
3. Chỉ thêm `WeightedRandomSampler` nếu đo được rằng batch-level imbalance vẫn còn làm recall của lớp hiếm kém.
4. Nếu muốn policy chặt hơn, bật chế độ strict cho threshold thay vì để fallback mặc định.

Project này vẫn là một research pipeline có tính production-ish: đủ cấu trúc để chạy thực tế, nhưng chưa nên coi mọi đề xuất trong plan là đã xong cho tới khi được xác minh bằng kết quả thực nghiệm.

— Hết tài liệu —
