# Bao cao 05 - Toan bo thanh phan va luong mot video trong du an

> Pham vi cua bao cao nay la luong xu ly khi **mot video duoc dua vao he thong**.  
> Khong mo ta quy trinh train chi tiet; chi nhac den cac stage hoc representation de giai thich vi sao he thong hoc duoc khong gian, thoi gian va cach fusion cac nhanh.

## 1. Muc tieu cua du an

Du an nay la mot he thong **moderation video da tang** cho 3 nhan doc lap:

- violence
- self_harm
- nsfw

Muc tieu khong phai chi la phan loai nhan, ma la:

- loc nhanh cac scene an toan de tiet kiem GPU
- chuyen cac tam diem cua noi dung nguy co sang cac nhanh nang hon
- tron thong tin khong gian, chuyen dong va ngu canh thoi gian trong mot model cuoi cung
- tra ra score, flag va threshold ro rang cho tung nhan

## 2. Cac thanh phan chinh cua du an

| Nhom | File / thu muc | Vai tro |
|---|---|---|
| Entrypoint inference | [scripts/run_inference_end_to_end.py](scripts/run_inference_end_to_end.py) | Chay mot video tu dau den cuoi, gom scene, proxy, trich feature, fusion va ghi JSON |
| Orchestrator Kaggle | [scripts/run_kaggle_end_to_end.py](scripts/run_kaggle_end_to_end.py) | Chay ca pipeline Kaggle, gom data prep, proxy, NSFW, YOLO, feature extraction, temporal va evaluation |
| Data prep | [scripts/prepare_kaggle_data.py](scripts/prepare_kaggle_data.py) | Quet nguon du lieu, tao split, group_id, label_signature va labels CSV |
| Feature extraction | [scripts/build_clip_features.py](scripts/build_clip_features.py) | Trich CLIP feature, optical flow, YOLO aux, NSFW aux va luu .npy |
| Proxy gate | [src/models/proxy_efficientnet.py](src/models/proxy_efficientnet.py), [src/training/proxy_trainer.py](src/training/proxy_trainer.py) | Loc scene nguy co nhanh bang EfficientNet-B0 |
| NSFW scorer | [src/training/nsfw_trainer.py](src/training/nsfw_trainer.py) | Nhan biet safe / nsfw o cap do frame |
| Spatial SSL | [src/models/swav_model.py](src/models/swav_model.py), [src/training/swav_trainer.py](src/training/swav_trainer.py) | Hoc representation khong gian bang SwAV |
| Temporal SSL pretext | [src/training/temporal_ssl_trainer.py](src/training/temporal_ssl_trainer.py), [src/data/temporal_ssl_dataset.py](src/data/temporal_ssl_dataset.py) | Hoc thu tu thoi gian bang nhieu nhiem vu gia |
| Final temporal model | [src/models/task_prompted_model.py](src/models/task_prompted_model.py) | Nhan xau CLIP + aux, fusion, task token va classification heads |
| Shared fusion block | [src/models/gated_fusion.py](src/models/gated_fusion.py) | Gate rieng cho motion va semantic aux |
| Generic trainer | [src/training/engine.py](src/training/engine.py) | Train/validate checkpoint cho fine-tune va SSL supervised |
| Evaluation | [scripts/evaluate_multitask.py](scripts/evaluate_multitask.py), [scripts/evaluate_challenge.py](scripts/evaluate_challenge.py), [scripts/evaluate_proxy.py](scripts/evaluate_proxy.py), [scripts/evaluate_nsfw_scorer.py](scripts/evaluate_nsfw_scorer.py) | Danh gia theo tung stage va theo challenge bucket |
| Configs | [configs/](configs/) | Khai bao moi stage, threshold, optimizer, data path |
| Runtime artifacts | [artifacts/](artifacts/) | Checkpoint, logs, metrics, runtime_configs, output tmp |
| Manifests | [manifests/](manifests/) | CSV feature manifests cho spatial, temporal, multitask va proxy |
| Docs | [doc/](doc/) va [docs/](docs/) | Mo ta kien truc, runbook, audit va so do dataset |
| Tests | [tests/](tests/) | Hien tai chu yeu la placeholder |
| YOLO | [yolo/](yolo/) | Data yaml va tai lieu cho detector |

Ghi chu: trong repo con co thu muc [mainfests/](mainfests/) voi mot so CSV trung lap lich su, nhung config hien tai dang dung [manifests/](manifests/).

## 3. Luong start-to-end khi mot video duoc dua vao he thong

```mermaid
flowchart TD
    V[Video input] --> S[Scene cut: TransNetV2 hoac fallback 1 scene]
    S --> P[Proxy gate: EfficientNet-B0
sample 8 frames / scene]
    P -->|safe| O[Skip nhanh, ghi scene an toan]
    P -->|risky| F[Sample toi da 64 frames]
    F --> C[CLIP ViT-B/32
feature [T, 768]]
    F --> M[Optical flow
feature [T, 3]]
    F --> Y[YOLOv8
feature [T, 2]]
    F --> N[NSFW scorer
feature [T, 1]]
    M --> A[Aux concat
[T, 6]]
    Y --> A
    N --> A
    C --> T[TaskPromptedTemporalModel]
    A --> T
    T --> H[3 logits
violence / self_harm / nsfw]
    H --> G[sigmoid + thresholds]
    G --> J[scene-level JSON]
```

### Buoc 1: Nhan video va phan tach scene

[run_inference_end_to_end.py](scripts/run_inference_end_to_end.py) doc video, lay:

- so frame
- FPS
- do dai video

Sau do no goi `detect_scenes()`:

- neu co `TransNetV2` thi tach scene theo shot boundary
- neu khong co thi fallback ve mot scene duy nhat

Day la buoc quan trong de khong tron nhieu canh khac nhau vao cung mot lan du doan.

### Buoc 2: Proxy gate loc scene

Moi scene se lay ngau nhien toi da 8 frame roi dua vao [src/models/proxy_efficientnet.py](src/models/proxy_efficientnet.py).

Proxy gate co 2 vai tro:

- cam nhanh cac scene co ve an toan
- dam bao cac scene nghi ngo moi duoc dua sang nhanh nang hon

Neu `proxy_risky_prob < proxy_threshold` thi scene do duoc danh dau safe va dung o day.
Neu vuot nguong, scene se di tiep sang cac nhanh feature nang.

### Buoc 3: Trich feature cho scene nguy co

Voi scene da pass proxy, he thong sample toi da 64 frame va trich 4 nhom feature:

- CLIP feature: `[T, 768]`
- optical flow feature: `[T, 3]`
- YOLO aux feature: `[T, 2]`
- NSFW aux feature: `[T, 1]`

Sau do:

- padding / truncate ve cung chieu thoi gian `T`
- concat 3 nhom aux thanh mot `aux_array` duy nhat co dang `[T, 6]`
- luu `aux_array = [flow, yolo, nsfw]`
- khi vao `TaskPromptedTemporalModel`, `aux_array` moi duoc tach noi bo thanh 2 nhanh:
    - motion branch: `flow` `[T, 3]`
    - semantic branch: `yolo + nsfw` `[T, 3]`

### Buoc 4: Dua vao temporal model

`TaskPromptedTemporalModel` nhan:

- `x`: CLIP feature `[B, T, 768]`
- `aux`: aux feature `[B, T, 6]`

Model khong xet tung frame rieng le ma hoc ngu canh theo chuoi frame.

### Buoc 5: Sinh score va flag

Model tra ve 3 logits:

- violence
- self_harm
- nsfw

Sau do:

- ap `sigmoid`
- so voi threshold cua tung nhan
- tao `flags`
- ghi ket qua vao file `*_inference.json`

Dau ra cuoi cung la mot JSON co:

- `scene_count`
- `warnings`
- danh sach `scenes`
- score va flag cho tung scene

Luu y: script nay hien tra ve **scene-level output**. Neu can video-level moderation, downstream co the lay quy tac tong hop nhu `max` hoac `any(scene flagged)` tuy policy.

## 4. Model hoc khong gian va thoi gian nhu the nao

Phan nay chi giai thich co che hoc representation, khong phai quy trinh train tung buoc.

### 4.1. Hoc khong gian bang SwAV

Spatial SSL dung [src/models/swav_model.py](src/models/swav_model.py) va [src/training/swav_trainer.py](src/training/swav_trainer.py).

Cau truc chinh:

- backbone ResNet18 hoac ResNet50
- projector MLP
- prototype layer

Train multi-crop tao nhieu view cua cung mot anh, roi dung Sinkhorn de tao assignment. Model hoc duoc:

- tinh bat bien voi crop / augmentation
- nhan dang embedding co cau truc tot hon
- clusterization cua visual space

Noi ngan gon: SwAV khong day model hoc nhan moderation truc tiep, ma day no hoc **bieu dien khong gian ben vung**.

Luu y quan trong:

- SwAV la mot stage hoc representation rieng
- no khong nam trong duong chay inference live cua mot video
- nhung no cho biet cach du an dac biet coi trong embedding khong gian

### 4.2. Hoc thoi gian bang nhiem vu gia temporal

Temporal SSL pretext dung [src/data/temporal_ssl_dataset.py](src/data/temporal_ssl_dataset.py) va [src/training/temporal_ssl_trainer.py](src/training/temporal_ssl_trainer.py).

Moi sample tao ra 2 nhiem vu gia:

- Arrow of Time: dao chuoi frame thi nhan 1
- Frame Sorting: tron frame thi nhan 1

Nguoc lai, neu chuoi giu nguyen thi nhan 0.

Cach nay bat model phai hoc:

- thu tu frame
- tinh huong xuat hien theo thoi gian
- nhan biet chuoi co bi dao / xao tron hay khong

Do do temporal backbone khong chi hoc "mot frame co gi", ma hoc "cac frame lien tiep hop lai thanh mot chuyen dong nhu the nao".

### 4.3. Fusion cac nhanh trong final model

Trong [src/models/task_prompted_model.py](src/models/task_prompted_model.py), fusion duoc lam theo thu tu sau:

1. `CLIP [T, 768]` di qua `clip_proj`.
2. `aux [T, 6]` duoc tach thanh:
   - motion branch: 3 chieu dau `flow`
   - semantic branch: 3 chieu con lai `YOLO + NSFW`
3. `GatedMotionAuxFusion` tron theo hai gate rieng:
   - `motion_gate`
   - `aux_gate`
4. Ket qua duoc cong them `frame_pos_embed` de giu thong tin vi tri thoi gian.
5. `frame_encoder` xu ly toan bo chuoi frame.
6. `task_tokens` cua 3 nhan duoc prepend vao latent space.
7. `cross_blocks` cho cac task token truy van toan bo frame tokens.
8. Ba head rieng tra ve 3 logits.

Mo ta ngan gon co the hieu nhu sau:

```text
clip -> clip_proj -> fused_0
fused_0 + gate_1(motion) * motion_h -> fused_1
fused_1 + gate_2(semantic) * semantic_h -> fused_2
fused_2 + frame_pos_embed -> frame_encoder
frame_encoder -> task_tokens -> cross-attention -> 3 heads
```

Y nghia cua cach fusion nay:

- optical flow khong bi nuot boi semantic signal
- YOLO va NSFW khong bi tron vao motion signal
- model tu hoc khi nao can tin vao chuyen dong, khi nao can tin vao object / explicit signal

Luu y ve NSFW aux:

- day khong phai leakage theo nghia strict, vi NSFW aux duoc sinh tu frame/video dau vao boi mot scorer rieng, khong lay tu ground-truth label
- tuy nhien day la mot shortcut risk co that, vi cung mot thong tin NSFW lai xuat hien ca o input aux [T, 1] va o output can du doan
- code hien tai khong co co che nao chan viec n_head su dung manh NSFW aux; muon biet no co dang copy signal hay khong can lam ablation, vi du zero NSFW aux hoac bo semantic branch roi so metric

### 4.4. Cac thanh phan dac biet cua model

| Thanh phan | Vai tro |
|---|---|
| `frame_pos_embed` | Giu thu tu frame trong clip |
| `task_tokens` | 3 token hoc duoc, dai dien cho violence / self_harm / nsfw |
| `cross_blocks` | Cho task token hoi thong tin tu frame tokens |
| `v_head`, `s_head`, `n_head` | 3 head doc lap cho tung nhan |
| `GatedMotionAuxFusion` | Tron clip + motion + semantic aux theo gate rieng |
| `aux_dim=6` | Tong aux = flow 3 + YOLO 2 + NSFW 1 |

## 5. Danh gia model o tung giai doan

| Giai doan | Script / file | Metric trong tam | Dai dien cho dieu gi |
|---|---|---|---|
| Proxy gate | [src/training/proxy_trainer.py](src/training/proxy_trainer.py), [scripts/evaluate_proxy.py](scripts/evaluate_proxy.py) | `val_recall_risky`, `val_precision_risky`, confusion matrix | Khong bo sot clip nguy co |
| NSFW scorer | [src/training/nsfw_trainer.py](src/training/nsfw_trainer.py), [scripts/evaluate_nsfw_scorer.py](scripts/evaluate_nsfw_scorer.py) | `f1_nsfw`, `recall_nsfw`, `precision_nsfw`, accuracy | Phat hien anh / frame nhay cam |
| Spatial SSL | [src/training/swav_trainer.py](src/training/swav_trainer.py) | `val_knn` | Chat luong embedding khong gian |
| Temporal SSL pretext | [src/training/temporal_ssl_trainer.py](src/training/temporal_ssl_trainer.py) | `val_loss`, `val_aot_acc`, `val_sort_acc` | Hieu thu tu va cau truc thoi gian |
| SSL temporal supervised | [src/training/engine.py](src/training/engine.py) | `val_loss`, `val_f1_macro`, confusion matrix | Hoc 3 nhan moderation tren feature chuoi |
| Multitask final eval | [scripts/evaluate_multitask.py](scripts/evaluate_multitask.py) | ROC-AUC, AP, thresholds, PR/ROC curves, confusion matrix | Chon threshold tot nhat cho tung nhan |
| Challenge eval | [scripts/evaluate_challenge.py](scripts/evaluate_challenge.py) | `overall`, `per_bucket` | Kiem tra do ben tren tap kho |

### Nguyen tac danh gia

- Proxy gate uu tien **recall**: hon bo sot clip nguy co con hon bat nham nhieu mot chut.
- NSFW scorer can can bang precision/recall, nhung trong log va checkpoint no thuong duoc theo doi bang F1 cho class duong tinh.
- SwAV khong danh gia bang classification accuracy; no dung `val_knn` nhu proxy cua representation quality.
- Temporal SSL pretext khong danh gia bang nhan moderation that; no danh gia qua 2 nhiem vu gia.
- Final multitask stage khong chi nhiin F1 macro ma con can xem ROC-AUC, AP, PR curve va threshold calibration.

### Threshold va calibration

[configs/inference.yaml](configs/inference.yaml) dat nguong mac dinh:

- violence: 0.5
- self_harm: 0.45
- nsfw: 0.6

Script [scripts/evaluate_multitask.py](scripts/evaluate_multitask.py) co the tao thresholds duoc de xuat tu:

- Youden
- F1
- F2
- F-beta

Neu co file thresholds JSON thi [scripts/run_inference_end_to_end.py](scripts/run_inference_end_to_end.py) se doc no de dung nguong da calibration.

## 6. Log train da ghi lai

Trong workspace hien tai, toi khong thay raw log cua cac stage khac trong `artifacts/`, nen phan nay chu yeu ghi lai **log SwAV ban da gui** va giai thich y nghia cua no.  
Day la log quan trong nhat vi no cho thay representation khong gian co dang hoc tot len ro rang.

### 6.1. Tom tat log SwAV Spatial SSL

| Epoch | Train loss | Val KNN | Trang thai |
|---|---:|---:|---|
| 1 | 5.1239 | 0.6999 | New best |
| 2 | 5.0566 | 0.7013 | New best |
| 3 | 4.9989 | 0.7039 | New best |
| 4 | 4.9509 | 0.6993 | Khong improve |
| 5 | 4.8843 | 0.6918 | Khong improve |
| 6 | 4.8605 | 0.7022 | Khong improve |
| 7 | 4.8385 | 0.7070 | New best |
| 8 | 4.8010 | 0.7028 | Khong improve |
| 9 | 4.7821 | 0.6987 | Khong improve |
| 10 | 4.7184 | 0.6872 | Khong improve |
| 11 | 4.7125 | 0.7626 | New best, co nhay lon |
| 12 | 4.6713 | 0.7159 | Khong improve |
| 13 | 4.6416 | 0.7567 | Khong improve |
| 14 | 4.5779 | 0.7306 | Khong improve |
| 15 | 4.5547 | 0.7544 | Khong improve |
| 16 | 4.5073 | 0.7718 | New best |
| 17 | 4.4822 | 0.7733 | New best |
| 18 | 4.4715 | 0.7824 | New best, tot nhat |
| 19 | 4.4648 | 0.7802 | Khong improve |
| 20 | 4.4568 | 0.7822 | Gan bang best |

### 6.2. Nhan xet tu log

- Train loss giam deu tu `5.1239` xuong `4.4568`.
- Val KNN tang tu `0.6999` len dinh `0.7824`.
- Best checkpoint nam o epoch 18 voi `best_val_knn = 0.7823585810162992`.
- Tong thoi gian chay log nay la `28712.741s`, xap xi 8 gio.
- Log cho thay SwAV khong chi fit loss, ma embedding khong gian thuc su tot len theo chi so KNN.

### 6.3. Dien giai theo y nghia project

Log nay cho thay:

- model hoc duoc visual invariance tot hon qua cac epoch
- representation khong gian da duoc cai thien ro rang truoc khi vao cac stage thoi gian
- cac epoch cuoi khong con nhay lon ve KNN nua, tuc la model bat dau hoi tu

## 7. Ket luan

Neu nhin theo mot video duoc dua vao he thong, luong chinh la:

1. video vao he thong
2. tach scene
3. proxy gate loc scene an toan
4. scene nguy co moi di qua CLIP + optical flow + YOLO + NSFW
5. cac nhanh duoc fusion co gate
6. task tokens truy van frame tokens
7. 3 logits cuoi cung tra ve score cho violence / self_harm / nsfw
8. thresholds chuyen score thanh flag
9. output duoc ghi thanh JSON theo scene

Co che hoc representation cua du an cung ro:

- SwAV day model hoc khong gian
- temporal pretext day model hoc thu tu thoi gian
- final task-prompted model tron cac nhanh va dua ra 3 nhan moderation doc lap

Bao cao nay co the dung nhu ban tom tat tong quan cho toan bo project, dac biet khi can giai thich pipeline cho nguoi khac doc nhanh.
