# Bao cao chi tiet project va plan cap nhat theo pipeline moi

Tai lieu nay la ban mo rong cua baocao01, tap trung vao 4 muc:

1. Mo ta chi tiet pipeline hien tai theo tung stage.
2. Giai thich ro source imbalance, cach da xu ly, va nhung diem chua on.
3. Ghi ro phan nao can rerun sau khi cap nhat optical flow va dual-branch fusion.
4. Dua ra checklist danh gia, test, va uu tien xu ly tiep theo.

## 1. Tong quan chung

Project khong phai mot model don le, ma la mot **pipeline staged**. Mot video / mot scene se di qua nhieu khoi rieng:

- data prep va split
- train proxy gate
- train NSFW scorer
- train SwAV spatial SSL
- train YOLOv8
- build CLIP temporal features + auxiliary features
- temporal SSL pretext
- temporal supervised
- finetune multitask
- inference + evaluation

Diem quan trong nhat cua ban cap nhat gan day la:

- optical flow khong con chi la mot scalar motion cue.
- optical flow duoc rut gon thanh 3 thong ke motion.
- temporal model khong con dung 1 gate chung cho toan bo aux.
- model da tach noi bo thanh 2 nhan:
  - motion branch: optical flow [T, 3]
  - semantic aux branch: YOLO + NSFW [T, 3]

Hau qua thuc te:

- feature cũ [T, 4] khong con la schema dung.
- file runtime config, feature cache, va checkpoint temporal phai xem lai.
- checkpoint cho proxy / NSFW / SwAV / YOLO van co gia tri.

## 2. So do du lieu va luong xu ly

### 2.1. Nguon du lieu

Project dang tron nhieu nhom du lieu khac nhau:

- image moderation sources
  - adult_content_binary
  - nsfw_dataset_v1
  - self_harm_detection
  - suicide_detection
  - surgical_tools_negative
  - wound_medical_negative
- video moderation sources
  - rwf2000
  - ucf_crimes
  - ucf101
- YOLO sources
  - Self Harm Detection.v1i.yolov8
  - Suicide Detection.v1i.yolov8(1)
  - Surgical Tools Dataset.v2-labelled-set.yolov8

### 2.2. Cach chia split

Trong `prepare_kaggle_data.py`, split du lieu duoc lam theo thu tu:

1. Scan tat ca source.
2. Gan label theo taxonomy.
3. Tao `group_id` de tranh leak theo clip / nhom.
4. Chia theo `source`.
5. Chia tiep theo `group_id`.
6. Chi stratify theo `label_signature` khi hop le.
7. Tao `challenge_holdout` tu 2 bucket kho:
   - `normal_hard`
   - `positive_hard`

### 2.3. Y nghia cua tung split

- `train`: hoc mo hinh.
- `val`: early stopping, calibration, threshold search.
- `test`: danh gia sau train.
- `challenge`: kiem tra do ben tren tap kho.

### 2.4. Kiem tra leakage

Kiem tra tren temporal va multitask cho thay:

- train / val / test khong overlap theo path.
- split duoc kiem soat theo source va group_id, khong phai cat ngau nhien tung dong.

## 3. Bao cao theo tung branch

### 3.1. Spatial SSL branch

**Muc dich**

Hoc representation khong gian tu anh, lam nen tang visual cho moderation.

**Du lieu**

- adult_content_binary
- nsfw_dataset_v1
- self_harm_detection
- suicide_detection
- surgical_tools_negative
- wound_medical_negative

**So luong hien co**

- Train: 23,640  (~54.29%)
- Val: 10,430    (~23.95%)
- Test: 8,876    (~20.38%)
- Challenge: 600 (~1.38%)

**Diem can chu y**

- Branch nay image-only.
- adult_content_binary va nsfw_dataset_v1 chiem trong so lon.
- Challenge nho, chi de stress test do ben.

**Trang thai**

- Checkpoint SwAV van co gia tri.
- Khong bi anh huong truc tiep boi optical flow.

### 3.2. NSFW scorer

**Muc dich**

Phan loai safe / nsfw o cap do anh / frame.

**Du lieu**

Cung mot tap image nhu spatial branch.

**So luong hien co**

- Train: 23,640  (~54.29%)
- Val: 10,430    (~23.95%)
- Test: 8,876    (~20.38%)
- Challenge: 600 (~1.38%)

**Diem can chu y**

- NSFW scorer khong phai CLIP-head.
- Code hien tai dung EfficientNet-B0 va `pretrained: false`.

**Trang thai**

- Checkpoint NSFW van co gia tri.
- Khong can train lai chi vi optical flow thay doi.

### 3.3. Proxy gate

**Muc dich**

Loc scene / clip nguy co truoc khi dua vao temporal model ton chi phi hon.

**Du lieu**

- rwf2000
- ucf_crimes
- ucf101

**So luong hien co**

- Train: 7,857 (~57.18%)
- Val: 1,407   (~10.24%)
- Test: 4,476  (~32.58%)
- Challenge: 0

**Diem can chu y**

- Test nhieu hon val, do split theo source/group va do video data khong dong deu.
- Khong co challenge cho proxy.

**Trang thai**

- Checkpoint proxy van co gia tri.
- Khong can train lai vi optical flow.

### 3.4. YOLO detector

**Muc dich**

Sinh aux feature object / scene, khong phai classifier moderation chinh.

**Du lieu**

- Self Harm Detection.v1i.yolov8
- Suicide Detection.v1i.yolov8(1)
- Surgical Tools Dataset.v2-labelled-set.yolov8

**Trang thai**

- Checkpoint YOLO van co gia tri.
- Chi can chay lai neu ban thay doi data / augmentation / class map.

### 3.5. Temporal SSL pretext

**Muc dich**

Hoc structure thoi gian cua clip, khong dung nhan moderation that.

**Du lieu**

- rwf2000
- ucf_crimes
- ucf101

**So luong hien co**

- Train: 7,857 (~57.18%)
- Val: 1,407   (~10.24%)
- Test: 4,476  (~32.58%)
- Challenge: 0

**Pretext tasks**

1. Arrow of Time
2. Frame Sorting

**Cap nhat moi**

Truoc do pretext chi hoc feature sequence [T, D].
Sau cap nhat moi:

- pretext co the nhan them aux [T, 6]
- motion branch optical flow duoc dua vao pretext neu manifest / loader co aux

**Trang thai**

- Temporal SSL cu khong con la checkpoint du cho model moi.
- Can rerun neu muon dung motion branch moi.

### 3.6. SSL temporal supervised

**Muc dich**

Hoc 3 nhan moderation:

- violence
- self_harm
- nsfw

**Du lieu**

- rwf2000
- ucf_crimes
- ucf101

**So luong hien co**

- Train: 7,857 (~57.18%)
- Val: 1,407   (~10.24%)
- Test: 4,476  (~32.58%)
- Challenge: 0

**Cap nhat moi**

Model nay hien khong con dung 1 gate chung cho aux.
No split noi bo thanh:

- motion branch: optical flow [T, 3]
- semantic aux branch: YOLO + NSFW [T, 3]

**Trang thai**

- Phai rerun neu muon mo hinh moi co loi ich cua optical flow.
- Checkpoint cu chi nen xem la warm start cho layer chung.

### 3.7. Multitask fine-tune

**Muc dich**

Day la stage cuoi de du doan 3 nhan moderation trong mot lan chay.

**Du lieu**

- adult_content_binary
- nsfw_dataset_v1
- self_harm_detection
- suicide_detection
- surgical_tools_negative
- wound_medical_negative
- rwf2000
- ucf_crimes
- ucf101

**So luong hien co**

- Train: 31,497 (~54.98%)
- Val: 11,837   (~20.66%)
- Test: 13,352  (~23.31%)
- Challenge: 600 (~1.05%)

**Diem can chu y**

- Day la branch tron nhieu modality nhat.
- De bi source bias hon cac branch khac.
- Challenge khong dai dien toan bo du lieu.

**Trang thai**

- Rerun bat buoc neu cap nhat optical flow / fusion.

## 4. Source imbalance: van de chinh cua project

### 4.1. Source imbalance xuat hien o dau

Van de khong chi la ratio positive/negative, ma con la:

- source lon ap dao source nho
- nhieu label co phan bo rat lech
- multitask manifest thieu co-positive examples
- branch image va branch video co do kho khac nhau

Diểm ban lo nhat la dung: neu mot nhan chiem da so qua manh, model co the hoc cach "du doan an toan" theo lop do va bo qua tin hieu that. Vi du, neu mau NSFW safe / negative ap dao, model co the bi lech sang mot ngưỡng quyet dinh khong tot va giong nhu "ao" khi gap video moi.

### 4.2. Hieu ung tren image branch

Image branch bi keo manh boi:

- adult_content_binary
- nsfw_dataset_v1

Hau qua:

- model co the quen pattern cua 2 source nay hon la hoc general moderation.
- threshold co the tot tren val nhung yeu hon tren source la.

### 4.3. Hieu ung tren video branch

Video branch tap trung vao 3 source chinh:

- rwf2000
- ucf_crimes
- ucf101

Hau qua:

- split test co the lech so luong so voi val.
- model co the learn mot so pattern que nhieu hon pattern hiem.

### 4.4. Hieu ung tren multitask branch

Day la branch de bi imbalance nhat vi tron ca image + video.

Quan sat da co:

- multitask manifests nang ve all-zero label signature.
- temporal manifests rat lech ve all-zero.
- multitask manifests chi co cac signature 000, 001, 010, 100.

Khong co co-positive examples la van de co that, nhung trong bai toan nay no khong phai uu tien so mot. Uu tien cao hon la tranh cho model hoc thuoc mot nhan chiem da so roi xuat ra cung mot dap an cho moi input.

Day la van de rat quan trong, vi no lam model kem hoc tac dong dong thoi giua cac nhan va de bi collapse ve lop chiem da so.

### 4.5. So lieu tong hop can nhin

- Spatial / NSFW: 54.29% train, 23.95% val, 20.38% test, 1.38% challenge.
- Proxy / Temporal: 57.18% train, 10.24% val, 32.58% test.
- Multitask: 54.98% train, 20.66% val, 23.31% test, 1.05% challenge.

### 4.6. Current mitigation da co

Hien tai project da co cac bien phap sau:

- split theo source + group_id de tranh leak
- cap `max_per_source_signature: 6000`
- `pos_weight` trong BCEWithLogitsLoss, cap toi da 20.0
- label smoothing trong supervised stages
- `WeightedRandomSampler` da duoc bat cho cac stage supervised de giam collapse ve lop chiem da so
- threshold calibration tren val
- challenge_holdout rieng de stress test

Neu imbalance van con manh sau khi train, buoc tiep theo la dieu chinh lai cuong do sampler / cap theo source, khong phai tiep tuc uong bot nhung mau co-positive rat hiem.

### 4.7. Cac bien phap chua co hoac moi chi la de xuat

- Per-source rebalancing tinh te hon chua duoc implement day du.
- Co-positive augmentation chua co.
- Hard negative mining chua ro rang.

Trong thuc te, weighted sampling da duoc bat, con per-source balancing tinh te hon la huong tiep theo neu sau nay can can chinh manh hon.

### 4.8. Lien he voi task tokens

Model cua ban dung 3 task tokens va 3 output heads rieng, nen y do ban dau la:

- moi token phu trach mot nhiem vu
- moi head hoc mot label rieng
- neu mot video co nhieu nhan, nhieu head co the cung bat dong thoi

Vi vay, bai toan khong phu thuoc vao viec phai co nhieu mau 110 / 101 / 011 ngay tu dau. Nhung co-positive examples van co gia tri de day model hoc duoc tuong quan giua cac nhan.

## 5. Optical flow: thay doi moi va tac dong

### 5.1. Truoc day

Optical flow chi la mot scalar motion intensity.

### 5.2. Hien tai

Optical flow da duoc nang cap thanh 3 thong ke motion:

- mean magnitude
- std magnitude
- percentile 90 magnitude

Sau do:

- duoc chuan hoa theo channel
- duoc ghép voi YOLO + NSFW thanh aux [T, 6]
- duoc split noi bo thanh motion branch + semantic aux branch

### 5.3. Tac dong thuc te

- feature cu [T, 4] khong con dung
- temporal checkpoints cu co the load mot phan, nhung khong phai final model
- feature extraction va training temporal phai rerun
- inference end-to-end phai dung checkpoint temporal moi

## 6. Cai gi con giu gia tri, cai gi phai lam lai

### 6.1. Co the giu lai

- Cell 10: proxy gate checkpoint
- Cell 11: NSFW scorer checkpoint
- Cell 12: SwAV spatial checkpoint
- Cell 13: YOLO checkpoint

### 6.2. Can rerun

- Cell 5: de regen runtime configs co `aux_dim: 6`
- Cell 14: build temporal features
- Cell 15: build multitask features
- Cell 15b: challenge features neu co dung
- Cell 16: temporal SSL pretext
- Cell 17: ssl_temporal supervised
- Cell 18: finetune multitask

### 6.3. Co the tai lai mot phan

- Temporal checkpoints cu co the lam warm start cho layer chung, nhung fusion block da doi.
- Neu muc tieu la quality final, nen xem nhu phai train lai.

## 7. Can danh gia lai nhu the nao

### 7.1. Test phai chay o dau

Test khong nam trong train log.

Can chay rieng:

- evaluate_multitask.py
- evaluate_challenge.py
- evaluate_proxy.py neu ban doi proxy
- evaluate_nsfw_scorer.py neu ban doi NSFW

### 7.2. Metric nen doc

Cho supervised multitask, nen doc:

- F1 macro
- F1 micro
- per-label precision / recall / F1
- confusion matrix
- ROC-AUC
- Average Precision
- threshold candidates (youden / f0.5 / f1 / f2)

### 7.3. Nghia cua calibration

Threshold khong nen lay cung 0.5 cho tat ca label neu val khong dong deu.
Nen chon threshold tu val roi luu thanh thresholds JSON.

Neu uu tien precision hon recall, nen promotion threshold theo `f0.5` thay vi `f2`.
Cach nay khong tang du lieu moi, nhung se dich quyet dinh ve phia it false positive hon.
Train loss co the khong con phan anh phan phoi goc sau khi sampler reweight, nhung do khong phai van de lon neu model selection van dua tren val metrics.

### 7.4. Challenge evaluation

Challenge holdout phai doc rieng theo bucket:

- normal_hard
- positive_hard

Day la noi de xem model co ben hon khong, khong phai noi train.

### 7.5. Per-source evaluation

Sau khi dua optical flow moi vao, nen xem them:

- recall theo source
- false positive theo source
- false negative theo source
- confusion matrix theo bucket

## 8. Checklist rerun theo thu tu thuc te

### Neu chi cap nhat optical flow + fusion

1. Rerun Cell 5 de tao runtime config moi.
2. Rerun Cell 14 va Cell 15 de build lai feature + aux.
3. Rerun Cell 15b neu co challenge.
4. Rerun Cell 16.
5. Rerun Cell 17.
6. Rerun Cell 18.
7. Rerun evaluate_multitask va evaluate_challenge.
8. Rerun inference end-to-end.

### Neu ban chi doi proxy / NSFW / SwAV / YOLO

- Chi can rerun stage tuong ung va cac evaluation stage lien quan.
- Temporal branch khong can lam lai neu khong doi feature / fusion.

## 9. Van de khac cua du an can theo doi

### 9.1. Ten stage co the gay nham

- `ssl_temporal` hien la supervised stage, khong con la pretext SSL.
- NSFW scorer khong phai CLIP-head.
- `mainfests/` va `manifests/` co the gay nham neu chua dong bo het file.
- Mot so output cu co the con nam trong `mainfests/`, trong khi runtime config moi dang tro vao `manifests/`, nen khi rerun phai kiem tra lai duong dan thuc te.

### 9.2. Checkpoint tracking

- Proxy, NSFW, SwAV, YOLO: co checkpoint rieng va on dinh hon.
- Temporal: chiu anh huong truc tiep tu aux schema.
- Inference: phu thuoc vao temporal checkpoint moi nhat.

### 9.3. Data coverage

- Challenge holdout chi 600 mau, khong dai dien toan bo du lieu.
- Multitask branch co nguy co bias source cao nhat.

## 10. Riske va huong xu ly tiep

### 10.1. Riske lon nhat hien tai

1. Source imbalance.
2. Thieu co-positive examples trong multitask manifests.
3. Temporal checkpoints cu khong con khop tot voi fusion moi.
4. Challenge holdout nho.
5. WeightedRandomSampler co the lam train lap lai qua nhieu mau hiem neu cap weight qua cao.
6. Neu sampler + pos_weight manh qua, model co the tang recall nhung giam precision.

### 10.2. Huong xu ly tiep theo

1. Rerun temporal features va retrain temporal branches.
2. Lam ablation no-flow vs 3D-flow vs richer-flow.
3. Xem lai per-source recall / F1.
4. Neu cap sampler chua hop ly, giam lai weight cap hoac chuyen sang per-source balancing tinh te hon.
5. Neu uu tien precision, dung threshold calibration theo `f0.5` va khong tang `pos_weight` / sampler qua manh.
6. Neu can, nang optical flow len richer stats hon nua.

## 11. Ket luan

Tom lai:

- Kien truc project on.
- Split on va khong co leakage ro rang.
- Source imbalance la van de chinh.
- Optical flow da duoc nang cap thanh motion branch dung nghia hon.
- Temporal feature va temporal checkpoint cu can rerun de dung loi ich cua motion branch moi.
- Checkpoint proxy / NSFW / SwAV / YOLO van giu gia tri.

### Cau ngan de nho

**Image branch + video branch + motion branch + semantic aux branch -> temporal moderation -> evaluation rieng theo val/test/challenge.**
