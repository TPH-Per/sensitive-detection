# Bao cao tong hop luong train va split du lieu

Tai lieu nay tong hop lai cac bo phan train trong project hien tai, bao gom: du lieu nao duoc dung, train/val/test bao nhieu, muc dich cua tung branch la gi, co tron du lieu khong, va co van de nao can chu y hay khong.

## 1. Tong ket nhanh

- Project dang dung **pipeline staged**, khong phai mot model don le.
- Split du lieu hien tai da duoc chia theo **source** va **group_id**, khong phai cat ngau nhien tung dong.
- Kiem tra tren temporal va multitask cho thay **train / val / test khong overlap theo path**.
- Cac branch du lieu duoc tach ro:
  - **image-only**: spatial SSL, NSFW scorer
  - **video-only**: proxy gate, temporal SSL pretext, ssl_temporal supervised
  - **mixed image + video**: finetune multitask
- Diem can chu y chinh khong phai leak, ma la **source imbalance** va **dataset nam trong nhieu nho split khac nhau**.

## 2. Cach split hien tai

Trong `prepare_kaggle_data.py`, split du lieu duoc lam theo thu tu:

1. Scan tat ca source.
2. Gan nhan va group.
3. Chia theo `source`.
4. Chia tiep theo `group_id` de tranh leak cac clip / mau cung goc.
5. Chi stratify theo `label_signature` khi hop le.
6. Tao them `challenge_holdout` tu 2 bucket kho:
   - `normal_hard`
   - `positive_hard`

### Y nghia cua cac split

- `train`: dung de hoc.
- `val`: dung de early stopping va calibration.
- `test`: dung de danh gia sau train.
- `challenge`: tap kho de kiem tra do ben.

### Ket luan ve split

- Voi manifests hien co, **khong co dau hieu train/val/test overlap**.
- `challenge_holdout` chi lay ra tu mot phan nho cua image branch, khong phai tap train chinh.

## 3. Bao cao theo tung branch

### 3.1. SwAV spatial SSL

**Muc dich**

Hoc representation khong gian tu anh, de model hieu visual pattern tot hon truoc khi vao moderation.

**Du lieu dung**

Image sources:

- `adult_content_binary`
- `nsfw_dataset_v1`
- `self_harm_detection`
- `suicide_detection`
- `surgical_tools_negative`
- `wound_medical_negative`

**So luong**

- Train: **23,640**  (~54.29%)
- Val: **10,430**    (~23.95%)
- Test: **8,876**    (~20.38%)
- Challenge: **600** (~1.38%)

**Nhan xet**

- Day la branch image-only.
- Co tron nhieu source, nhung dung co chu y: adult_content_binary va nsfw_dataset_v1 chiem ty trong lon.
- Challenge chi co 600 mau, la tap nho va kho, dung de danh gia do ben.
- Ve mat pipeline, branch nay on.

---

### 3.2. NSFW scorer

**Muc dich**

Phan loai safe / nsfw o cap do anh/frame.

**Du lieu dung**

Cung mot tap image nhu spatial branch:

- `adult_content_binary`
- `nsfw_dataset_v1`
- `self_harm_detection`
- `suicide_detection`
- `surgical_tools_negative`
- `wound_medical_negative`

**So luong**

- Train: **23,640**  (~54.29%)
- Val: **10,430**    (~23.95%)
- Test: **8,876**    (~20.38%)
- Challenge: **600** (~1.38%)

**Nhan xet**

- NSFW scorer khong phai CLIP-head trong code hien tai.
- No dang dung EfficientNet-B0 train tu dau theo config `pretrained: false`.
- Branch nay hop ly ve mat bai toan, nhung khong dung voi mo ta CLIP-NSFW neu ban dang doc theo y tuong research ban dau.

---

### 3.3. Proxy gate

**Muc dich**

Model nho de loc scene / clip nguy co truoc khi dua vao temporal model nang hon.

**Du lieu dung**

Video sources:

- `rwf2000`
- `ucf_crimes`
- `ucf101`

**So luong**

- Train: **7,857** (~57.18%)
- Val: **1,407**   (~10.24%)
- Test: **4,476**  (~32.58%)
- Challenge: **0**

**Nhan xet**

- Day la branch video-only.
- Split co ve lech ve test nhieu hon val, nhung day la do source / group split va do du lieu video khong dong deu.
- Branch nay on ve kien truc, nhung test set khong phai can bang tuyet doi.

---

### 3.4. Temporal SSL pretext

**Muc dich**

Hoc chuyen dong va thu tu frame tu feature sequence, khong dung nhan moderation that.

**Du lieu dung**

Cung 3 video sources:

- `rwf2000`
- `ucf_crimes`
- `ucf101`

**So luong**

- Train: **7,857** (~57.18%)
- Val: **1,407**   (~10.24%)
- Test: **4,476**  (~32.58%)
- Challenge: **0**

**Nhan xet**

- Day la pretext task, nen khong phai moderation classifier.
- Cac nhan gia duoc tao bang dao nguoc chuoi frame va xao tron frame.
- Branch nay on, nhung ten co the gay nham voi `ssl_temporal`.

---

### 3.5. SSL temporal supervised

**Muc dich**

Hoc 3 nhan moderation:

- violence
- self_harm
- nsfw

**Du lieu dung**

Cung 3 video sources:

- `rwf2000`
- `ucf_crimes`
- `ucf101`

**So luong**

- Train: **7,857** (~57.18%)
- Val: **1,407**   (~10.24%)
- Test: **4,476**  (~32.58%)
- Challenge: **0**

**Nhan xet**

- Ten stage co chu `ssl_temporal` nhung ban chat code hien tai la **supervised multi-label training**.
- Co `pos_weight` de giam FN o class hiem.
- Branch nay on ve flow, nhung can doc dung ban chat ten goi.

---

### 3.6. Multitask fine-tune

**Muc dich**

Day la stage cuoi de du doan 3 nhan moderation trong mot lan chay.

**Du lieu dung**

Mix image + video sources:

- `adult_content_binary`
- `nsfw_dataset_v1`
- `self_harm_detection`
- `suicide_detection`
- `surgical_tools_negative`
- `wound_medical_negative`
- `rwf2000`
- `ucf_crimes`
- `ucf101`

**So luong**

- Train: **31,497** (~54.98%)
- Val: **11,837**   (~20.66%)
- Test: **13,352**   (~23.31%)
- Challenge: **600** (~1.05%)

**Nhan xet**

- Day la branch tron nhieu modality nhat.
- No la su tron co chu dich: image branch + video branch duoc dua vao cung bai toan moderation cuoi.
- Branch nay hop ly neu muc tieu la model moderation tong the.
- Tuy nhien, do tron nhieu source nen de bi **source bias** hon cac branch khac.
- Challenge chi lay tu 2 bucket image kho, nen khong dai dien cho toan bo du lieu.

---

### 3.7. YOLO detector

**Muc dich**

Object detection branch de sinh aux feature, khong phai classifier moderation chinh.

**Du lieu dung**

Cac source YOLO-style:

- `Self Harm Detection.v1i.yolov8`
- `Suicide Detection.v1i.yolov8(1)`
- `Surgical Tools Dataset.v2-labelled-set.yolov8`

**Nhan xet**

- Branch nay duoc build bang `prepare_yolo_dataset.py` va train bang `train_yolov8.py`.
- No co split rieng trong `yolo_merged/`.
- Trong bo summary duoc ban gui, branch nay khong co so train/val/test tong hop san nhu cac branch moderation, nen can doc them `yolo_merged/summary.json` neu muon so chinh xac.

## 4. Co tron du lieu khong?

### Co, nhung co chu dich

- **Spatial / NSFW**: tron cac image source vao cung feature space.
- **Proxy / Temporal**: tron cac video source vao cung feature space.
- **Multitask**: tron ca image va video source de hoc moderation cuoi cung.

### Co khong tron sai khong?

- Khong thay dau hieu train/val/test bi leak.
- Khong thay dau hieu model hoc chong cheo theo clip / group.
- Cac branch dung manifest rieng, nen mix la co so do, khong phai tron vo to chuc.

## 5. Van de / diem can chu y

### 5.1. Source imbalance

- `adult_content_binary` va `nsfw_dataset_v1` chiem ty trong lon trong image branch.
- Video branch tap trung vao 3 source chinh.
- Multitask branch bi lech nhieu nhat vi tron ca hai loai source.

### 5.2. Challenge holdout chi nho va chi lay tu mot so source

- `normal_hard`: 300 challenge items
- `positive_hard`: 300 challenge items
- Tong challenge: 600

Day la tap de danh gia do ben, khong phai tap train.

### 5.3. Ten file / ten stage co the gay nham

- `ssl_temporal` khong phai pretext SSL.
- NSFW scorer khong phai CLIP-head trong code hien tai.
- `mainfests/` va `manifests/` co the lam ban nham neu chua rerun day du.

### 5.4. Test metrics khong nam trong train log

- Cell train chi cho train/val.
- Test phai chay bang cac script evaluate rieng.

## 6. Ket luan

Neu danh gia thuc dung:

- **Kien truc on**.
- **Split on**.
- **Khong co leak ro rang giua train/val/test** trong cac manifest hien co.
- **Mix du lieu la co chu dich**, khong phai tron sai.
- **Van de chinh** la source imbalance va mot so ten branch co the gay nham ban chat.

### Do uu tien can chu y

1. Multitask fine-tune.
2. Spatial / NSFW.
3. Proxy / temporal.
4. YOLO aux branch.

### Cau ngan de nho

**Spatial = image SSL, Proxy/Temporal = video SSL, Multitask = mixed moderation, NSFW = image classifier rieng, YOLO = aux detector.**

## 7. Khuyen nghi xu ly source imbalance

### Co nen cat bot phan lon khong?

**Khong nen cat manh toan bo tap lon** neu muc tieu la giu do phu du lieu va tranh mat thong tin.

Ly do:

- Nhieu source lon trong project khong phai du lieu thua, ma la du lieu can de model hoc duoc cac pattern pho bien.
- Neu cat qua tay, model co the mat do da dang va noi suy kem hon o cac truong hop that.
- `val`, `test`, `challenge` **khong nen dong cham vao** de tranh lam sai danh gia.

### Cach lam hop ly hon

Nen ap dung theo thu tu uu tien:

1. **Gioi han du lieu o train, khong can giam val/test**.
2. **Cap theo source + label_signature** neu mot source qua lon.
3. **Giữ lai cac mau kho / mau hiem** cua source lon, chi bot cac mau qua trung lap.
4. **Dung `pos_weight` va/hoac sampler** de chong bat can bang khi train.

### Trong project hien tai da co gi?

- `prepare_kaggle_data.py` da co cap:
  - `max_per_source_signature: 6000`
- `assign_splits()` da chia theo `source` va `group_id`.
- `challenge_holdout` da tach rieng 600 mau kho.

### Khuyen nghi thuc te cho do an nay

Neu ban muon giam source imbalance, nen lam theo thu tu sau:

1. **Khong xoa toan bo source lon**.
2. **Neu can, chi cat tren train set** bang cap theo `source_signature`.
3. **Giữ val/test/challenge nguyen ven**.
4. **Them WeightedRandomSampler** neu batch train van bi lech qua nhieu.
5. **Danh gia lai per-source va per-label recall** sau khi can bang.

### Ket luan ngan

Voi do an hien tai, **cat bot mot chut source lon co the can thiet**, nhung:

- chi cat o train,
- cat co chu dich,
- khong cat manh,
- va khong dong vao tap danh gia.

Neu lam dung, ban se giam imbalance ma khong lam mat thong tin.
