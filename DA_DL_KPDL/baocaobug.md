# Bao cao bug (run_kaggle01.md)

Bang nay tap trung vao cac loi co nguy co leak chia tap, sai pipeline ML, hoac loi chay do logic/su dung file.

| ID | Muc do | Mo ta | Bang chung (vi tri) | Anh huong | Khuyen nghi |
|---|---|---|---|---|---|
| 1 | Critical | Label violence duoc suy tuong tu ten file .npy, nhung build_features ghi ten file da bi hash va khong con thong tin tap nguon. Ket qua: gan het (hoac toan bo) label violence = 0, split + training sai. | [scripts/build_features_v6.py](scripts/build_features_v6.py)<br>[scripts/prepare_data_v6.py](scripts/prepare_data_v6.py) | Stratify sai, train/val/test bi sai nhan, model hoc sai muc tieu. | Da sua: build_features_v6.py ghi features_manifest.csv (feature_path + label_violence), prepare_data_v6.py doc file nay neu co va fallback infer tu video_path. |
| 2 | Critical | Feature va aux bi lech: build_features tao 1 file 775-dim, nhung ManifestFeatureDataset lay toan bo vao x va aux bi tao dang 0 (vi khong co aux_feature_path). Model nhan x 775-dim (khong khop clip_dim=768) va aux zeros. | [src/data/manifest_dataset.py](src/data/manifest_dataset.py) | Loi shape khi forward (clip_dim=768 vs 775) hoac training chay nhung aux signals = 0 → distillation vo nghia. | Da sua: ManifestFeatureDataset tu dong tach feature 775-dim thanh clip (0:768) va aux (768:). |
| 3 | High | calibrate_v6/evaluate_v6 import ManifestDataset khong ton tai va load checkpoint sai dinh dang (load_state_dict vao dict co nhieu key). | [scripts/calibrate_v6.py](scripts/calibrate_v6.py#L24-L45)<br>[scripts/evaluate_v6.py](scripts/evaluate_v6.py#L27-L51) | Calibrate/Evaluate se crash ngay khi chay. | Doi sang ManifestFeatureDataset (hoac dataset dung thuc te) va load model_state_dict tu checkpoint: state["model_state_dict"]. |
| 4 | High | calibrate_v6/evaluate_v6 van dung layout aux 6-dim (V6.0). V6.1 la 7-dim: bo qua selfharm va dung sai nsfw (selfharm bi coi nhu nsfw). | [scripts/calibrate_v6.py](scripts/calibrate_v6.py#L56)<br>[scripts/evaluate_v6.py](scripts/evaluate_v6.py#L62) | Bao cao sai cho S/N gate, threshold sai, ket qua test khong dung. | Cap nhat slicing: flow 0:3, yolo 3:4, gore 4:5, selfharm 5:6, nsfw 6:7; truyen selfharm vao model. |
| 5 | High | Gate 1 validation bi leak train data: Gore validation lay HOD/blood (duoc dung trong train), NSFW validation lay toan bo dataset khong tach split. SelfHarm gate now da them UCF-101 val/test hard negatives theo cung hash split 70/15/15 voi train, nhung positive set van nho nen metric can theo doi variance. | [scripts/validate_experts.py](scripts/validate_experts.py#L103-L117)<br>[scripts/train_gore_v6.py](scripts/train_gore_v6.py#L214-L242)<br>[scripts/validate_experts.py](scripts/validate_experts.py#L228-L245)<br>[scripts/train_nsfw_v6.py](scripts/train_nsfw_v6.py#L42-L46) | Gate 1 qua de dang (over-optimistic), co the cho qua teacher kem; SelfHarm van co the dao dong manh do positive it. | Dung cung split hash hoac test split doc lap; loai HOD/blood train khoi tap validation, ap dung get_split cho NSFW val/test, va giu UCF val/test hard negatives cho SelfHarm Gate 1 theo cung split ratio voi train. |
| 6 | Medium | Quality augmentation label suy tuong theo keyword rat han che (chi fight/violence/crimes). Nhieu video UCF-Crimes co the bi gan nham label, lam sai aug. | [scripts/build_features_v6.py](scripts/build_features_v6.py) | Augment sai phia → co the tai tao quality shortcut hoac lam giam hieu qua. | Da sua: build_features_v6.py doc `label_violence` tu features_manifest.csv; neu khong co thi default 0, bo keyword heuristic. |
| 7 | Medium | Da them ghi log metrics theo epoch cho Gore/NSFW/SelfHarm/E2E; YOLO can retrain neu checkpoint cu duoc train truoc khi sua split negative theo video-level. | [scripts/_common.py](scripts/_common.py)<br>[scripts/train_gore_v6.py](scripts/train_gore_v6.py)<br>[scripts/train_nsfw_v6.py](scripts/train_nsfw_v6.py)<br>[scripts/train_selfharm_v6.py](scripts/train_selfharm_v6.py)<br>[scripts/train_e2e_v6.py](scripts/train_e2e_v6.py)<br>[run_kaggle01.md](run_kaggle01.md) | Co them CSV metrics de plot/doi chieu; YOLO checkpoint cu co the gay test metric ao neu khong train lai. | Dung cac file `metrics/*.csv` de ve do thi train/val; neu `yolov8_weapon_v6_best.pt` la checkpoint cu, train lai YOLO tu dau truoc khi chay feature extraction moi. |

## Cap nhat 2026-05-03: Calibration trade-off (Gore + SelfHarm)

### Van de goc
- Log Gate 4.5 cho thay ca Gore va SelfHarm deu PASS Gate 1 (AUC/Recall cao) nhung FAIL Gate 2 vi ECE cao.
- Day la mau hinh over-confidence: model rank tot (AUC cao) nhung xac suat khong duoc hieu chuan tot.
- Nguyen nhan ky thuat chinh:
  - Train dang dung `double reweight` (vua `WeightedRandomSampler`, vua `BCEWithLogitsLoss(pos_weight=...)`).
  - Checkpoint chon theo AUC (ranking) chu khong uu tien calibration.
  - Gate calibration cu dung ECE kieu trung binh bin khong co trong so, nhay cam hon khi du lieu lech/phong mau nho.

### Quyet dinh danh doi
- Chap nhan danh doi nho o AUC/Recall de lay calibration tot hon la DANG LAM trong boi canh nay.
- Ly do:
  - Expert outputs duoc dung nhu teacher features cho Cell 5+ (distillation), nen xac suat "co y nghia" quan trong, khong chi ranking.
  - Over-confidence se day teacher signal qua "cung", de lam hoc sinh hoc lech.

### Da chinh sua gi
- `scripts/validate_experts.py`
  - Doi ECE sang weighted-ECE (co trong so theo kich thuoc tung bin).
  - Them Brier score de theo doi calibration cung ECE.
  - Mo rong luoi tim Temperature: tu bo cu `[0.5..4.0]` sang luoi rong hon den `12.0`.
  - Khi tie ECE thi chon T co Brier tot hon.
  - Log Gate 2 gio hien ECE + Brier truoc/sau scaling.

- `scripts/train_gore_v6.py`
  - Them `--reweight_mode {sampler,bce,both,none}`.
  - Mac dinh moi: `sampler` (chi dung sampler, tat `pos_weight` trong BCE) de giam over-confidence do double reweight.
  - Log ro mode dang dung: sampler ON/OFF, bce_pos_weight ON/OFF.

- `scripts/train_selfharm_v6.py`
  - Them `--reweight_mode {sampler,bce,both,none}`.
  - Mac dinh moi: `sampler` (chi dung sampler, tat `pos_weight` trong BCE).
  - `train_one_epoch` ho tro train voi/khong `pos_weight`.
  - Log ro mode dang dung va `pos_weight` tham chieu.

### Tac dong du kien
- Muc tieu: giam ECE (nhat la Gore/SelfHarm) va lam probability teacher on dinh hon cho Cell 5.
- Rui ro: AUC/Recall co the giam nhe so voi cau hinh cu, nhung thong thuong van dat Gate 1 neu data quality giu nguyen.

### Cach chay lai de xac nhan
- Retrain Gore + SelfHarm voi mac dinh moi (khong can them flag vi default da la `reweight_mode=sampler`).
- Chay lai Cell 4.5.
- Dieu kien GO:
  - Gate 1 van dat nguong AUC/Recall.
  - Gate 2 ECE < 0.10 sau temperature scaling.

### Neu van fail Gate 2
- Thu `--reweight_mode none` de test calibration thuần (khong sampler, khong pos_weight) tren 1 run ngan.
- Neu Gate 1 giam qua muc cho phep thi quay lai `sampler`, va bao cao ro trade-off thay vi ep pass gate bang cach "noi long nguong".
