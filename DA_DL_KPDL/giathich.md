# Giai thich luong SwAV, SSL va Multitask

Tai lieu nay tong hop lai cach cac stage dang hoat dong trong project hien tai, va chinh lai mot so cho de nham lan.

## 1. Y nghia chung cua tung phan

### SwAV spatial SSL

SwAV la stage hoc dac trung khong gian tu **anh**. Muc tieu cua stage nay la cho model tu hoc visual representation tot hon, khong phai hoc truc tiep nhan moderation.

Trong code hien tai:

- du lieu lay tu [configs/ssl_spatial.yaml](configs/ssl_spatial.yaml)
- input la manifest anh: `labels_spatial_train.csv` va `labels_spatial_val.csv`
- dataset dung `SwAVMultiCropDataset` va `SwAVEvalDataset` trong [src/data/swav_dataset.py](src/data/swav_dataset.py)
- train dung multi-crop augmentation va SwAV loss trong [src/training/swav_trainer.py](src/training/swav_trainer.py)

Noi ngan gon: **SwAV = hoc feature cua anh**.

### Temporal SSL pretext

Temporal SSL pretext khong phai la moderate classifier. Day la stage hoc **chuyen dong / thu tu thoi gian** tu video features.

Trong code hien tai:

- config la [configs/temporal_ssl_pretext.yaml](configs/temporal_ssl_pretext.yaml)
- input la `temporal_train.csv` va `temporal_val.csv`
- dataset la [src/data/temporal_ssl_dataset.py](src/data/temporal_ssl_dataset.py)
- dataset nay doc feature sequence `[T, D]` va tao 2 nhiem vu gia:
  - `Arrow of Time`: dao nguoc sequence roi bat model nhan ra
  - `Frame Sorting`: xao tron frame roi bat model phan biet

Stage nay hoc temporal structure tu video clips da co, khong dung nhan that `violence / self_harm / nsfw`.

Noi ngan gon: **Temporal SSL pretext = hoc chuyen dong va thu tu frame tu video features**.

### SSL temporal supervised

File config co ten `ssl_temporal`, nhung ve ban chat code hien tai day la **supervised multi-label training** cho 3 nhan moderation.

Trong code hien tai:

- config la [configs/ssl_temporal.yaml](configs/ssl_temporal.yaml)
- train qua [src/training/engine.py](src/training/engine.py)
- du lieu doc tu `temporal_train.csv` va `temporal_val.csv` bang `ManifestFeatureDataset`
- label columns la `violence`, `self_harm`, `nsfw`
- loss la `BCEWithLogitsLoss` va co `pos_weight`

Noi ngan gon: **ssl_temporal = supervised 3-label training, khong phai SSL pretext**.

### Multitask fine-tune

Day la stage fine-tune cuoi, van la supervised 3 nhan nhu tren, nhung co cau hinh rieng cho fine-tuning.

Trong code hien tai:

- config la [configs/finetune_multitask.yaml](configs/finetune_multitask.yaml)
- van train qua [src/training/engine.py](src/training/engine.py)
- input la `multitask_train.csv` va `multitask_val.csv`
- output van la 3 logit cho `violence`, `self_harm`, `nsfw`

Noi ngan gon: **multitask = supervised multi-label fine-tune cho 3 nhan**.

## 2. Multitask co phai la 3 FFW cua 3 token khong?

Khong chinh xac theo cach noi nay.

Dung hon la:

- model co **3 task tokens hoc duoc** trong [src/models/task_prompted_model.py](src/models/task_prompted_model.py)
- moi token duoc cross-attention voi frame tokens chung
- sau do moi token di qua **1 linear head rieng**:
  - `v_head`
  - `s_head`
  - `n_head`

Cho nen day khong phai 3 FFW doc lap hoan toan. No la:

**shared backbone + 3 task tokens + cross-attention + 3 output heads**

Neu ban muon hieu don gian:

- 1 luong frame chung hoc dac trung video
- 3 task token hoi thong tin tu luong frame do
- moi task token sinh ra 1 dau ra cho 1 nhan

## 3. Lua chon du lieu hien tai co hop ly khong?

Co, ve mat y tuong thi hop ly.

### Vi sao SwAV dung anh?

Vi SwAV can hoc visual representation tong quat. Anh la dang du lieu de hoc feature khong gian tot nhat cho stage nay, va khong can phu thuoc vao label moderation.

### Vi sao temporal SSL dung video features?

Vi neu du lieu moderation co video chua du manh, ta van co the dung cac video clip san co de hoc motion pattern, temporal order, va temporal consistency.

Quan trong la:

- muc tieu cua temporal SSL khong phai la phan loai moderation
- muc tieu cua no la hoc structure cua video
- sau do stage supervised moi dua layer do vao bai toan moderation that su

### Vi sao multitask lai can supervised?

Vi moderation pipeline cuoi cung can 3 nhan ro rang:

- violence
- self_harm
- nsfw

Do do giai doan multitask phai hoc tu label that va dung loss co `pos_weight` de giam lech ve class 000.

## 4. Cho nao de nham lan nhat trong project

Day la 4 cho rat de nham:

1. **SwAV khong phai moderate classifier**
   - no chi hoc feature anh
   - KNN chi la proxy de kiem tra representation

2. **Temporal SSL pretext khong phai train moderation label**
   - no hoc arrow-of-time va frame sorting
   - no dung feature sequence cua video, khong dung nhan moderation

3. **`ssl_temporal` khong phai pretext SSL**
   - ten file co the gay nham
   - code hien tai la supervised 3-label training

4. **Multitask khong phai 3 model rieng**
   - day la 1 model chung
   - co 3 task token va 3 output head

## 5. Luong dung hien tai trong project

Luong co the hieu ngan gon nhu sau:

1. **SwAV spatial SSL**
   - hoc feature anh

2. **Temporal SSL pretext**
   - hoc chuyen dong va thu tu frame tu video features

3. **SSL temporal supervised**
   - hoc 3 nhan moderation

4. **Multitask fine-tune**
   - fine-tune cuoi cho 3 nhan moderation

Neu viet thanh so do:

```text
anh -> SwAV -> spatial feature
video features -> temporal SSL pretext -> temporal pattern feature
temporal features + aux features -> supervised ssl_temporal -> 3-label prediction
temporal features + aux features -> finetune_multitask -> 3-label prediction
```

## 6. Ket luan thuc dung

Y tuong hien tai co the thanh cong neu 3 stage nay bo tro tot cho nhau:

- SwAV giup bat duoc feature khong gian tot hon
- temporal SSL giup hoc motion / temporal order
- multitask supervised giup map ve 3 nhan moderation

Nhung can nho:

- day la **thiet ke hop ly**, khong phai bao dam thanh cong tu dong
- ket qua con phu thuoc vao chat luong feature, do lech nhan, va cach calibration threshold
- test coverage hien tai con yeu, nen can xac minh bang thuc nghiem va test that

Neu can mot cau de ghi nho:

**SwAV hoc anh, temporal SSL hoc chuyen dong, multitask hoc nhan moderation.**
