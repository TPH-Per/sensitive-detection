# TANG CUONG DU LIEU CHO PIPELINE V5.1

## 1. Muc tieu cua tai lieu

Tai lieu nay tong hop chien luoc tang cuong du lieu cho tung stage trong ke hoach V5.1, dua theo muc tieu metric cua moi mo hinh:

- Tram 1 `EfficientNet-B0`: uu tien `Recall`, giam `False Negative`.
- Tram 2c `YOLOv8-nano`: uu tien `mAP@0.5`, giu box on dinh va giam nham voi hard negative.
- Tram 3 `Temporal Transformer`: uu tien `F1-Score` va `Confusion Matrix`, giam nham cheo giua `violence`, `self_harm`, `nsfw`.
- `Temporal SSL`: hoc quy luat thoi gian ma khong hoc meo tat.
- `SwAV`: hoc bieu dien khong gian manh va ben vung, khong toi uu truc tiep cho metric supervised.

Tai lieu nay khong chi tra loi "nen dung augmentation nao", ma con tra loi "vi sao dung" va "khong nen lam gi".

## 2. Nguyen tac chung

### 2.1 Augmentation phai phuc vu metric

- Neu muc tieu la `Recall`, augmentation phai giup model van nhan ra duong tinh trong dieu kien xau.
- Neu muc tieu la `Precision`, augmentation phai lam model biet nhan ra hard negative va bo qua mau gay nham.
- Neu muc tieu la `F1`, augmentation phai can bang giua 2 viec:
  - giu duoc tin hieu cua mau duong
  - tang kha nang phan biet giua cac lop gan nhau

### 2.2 Khong duoc pha vo semantics

Augmentation duoc coi la tot neu:

- mau van con dung nhan sau khi bien doi
- ngu canh chinh van con ton tai
- mo hinh hoc tinh bat bien dung, khong hoc nhieu

Augmentation duoc coi la nguy hiem neu:

- cat mat vat the quan trong
- xoa bo vung ngu nghia chinh
- bien positive thanh gan nhu negative
- lam clip mat tinh lien tuc theo thoi gian

### 2.3 Uu tien hard cases thay vi tang cuong vo toi va

Voi bai toan kiem duyet, nen uu tien cac bien doi gan voi loi thuc te:

- mo, nhieu, nen toi, nguoc sang
- video bi nen, giam chat luong
- vat the nho, xa, bi che mot phan
- camera rung, motion blur
- frame bat dau khong nam o khoanh khac dep nhat

Khong nen day manh cac augmentation "dep ve ly thuyet" nhung it gap ngoai doi.

## 3. Tram 1 - EfficientNet-B0 uu tien Recall

### 3.1 Muc tieu

Tram 1 dong vai tro gate som, nen uu tien:

- bat duoc toi da mau nguy hiem
- chap nhan nham nhieu hon bo sot

Noi cach khac, augmentation cho Tram 1 phai giai quyet bai toan:

- "positive xau van phai bi bat ra"

### 3.2 Nen tang cuong nhu the nao

Nen tang cuong manh hon tren `positive samples` so voi negative samples. Ly do:

- positive trong bai toan kiem duyet thuong da dang hon
- mau duong tinh xau la nguon gay `False Negative`

Nhom augmentation nen uu tien:

#### A. Quality degradation

- `Gaussian blur` nhe
- `Motion blur`
- `JPEG compression`
- `Gaussian noise` nhe
- `Downscale -> upscale`

Tac dung:

- mo phong video xau, upload lai, chup man hinh, camera giam sat

#### B. Lighting robustness

- `Brightness/contrast jitter`
- `Gamma shift`
- `Color jitter` muc vua
- thay doi saturation nhe

Tac dung:

- giup model van nhan ra noi dung nguy hiem khi toi, chay sang, lech mau

#### C. Partial visibility

- `Random resized crop` muc nhe
- `Small occlusion`
- `Cutout` nho, tranh che trung tam semantics

Tac dung:

- vat the nguy hiem hoac tu the co the chi lo ra mot phan

#### D. Viewpoint / framing

- crop lech tam nhe
- zoom out nhe
- rotation nho
- horizontal flip khi khong pha semantics

Tac dung:

- tranh phu thuoc vao bo cuc dep

#### E. Proxy-video specific

Neu Tram 1 dung proxy clip da chuyen sang `.npy`, nen bo sung:

- `frame jitter`
- `frame dropout` nhe
- doi diem bat dau clip

Tac dung:

- tranh hoc mot frame "vang"
- bat duoc nguy hiem ke ca khi key frame khong dep

### 3.3 Muc manh goi y

Goi y cau hinh an toan:

- blur: nhe den vua
- crop scale: khoang `0.75 - 1.0`
- rotation: trong khoang `-10` den `10` do
- frame dropout: `5% - 15%`
- brightness/contrast jitter: muc vua, khong lam doi nhan

### 3.4 Khong nen lam

- crop qua manh den muc mat dao, tay, vung co the, hoac tu the chinh
- `Random erasing` lon che trung noi dung nguy hiem
- `Vertical flip`
- rotation qua manh
- color jitter qua muc khien mau da, mau, vat the bi bien dang bat thuong

### 3.5 Ngoai augmentation, can di kem

Neu muon day `Recall`, augmentation mot minh la chua du. Nen di kem:

- `oversample` nhom positive
- can nhac `class weighting` hoac `focal loss`
- threshold prediction thap hon `0.5`
- them hard positive khong dep

## 4. Tram 2c - YOLOv8-nano uu tien mAP@0.5

### 4.1 Muc tieu

YOLO can:

- thay dung vat the
- dat dung box
- khong nham dao mo, dung cu y khoa voi hung khi thuong

Voi detection, augmentation phai ton trong hinh hoc va bbox.

### 4.2 Nen tang cuong nhu the nao

#### A. Geometry-preserving transforms

- scale
- translate
- horizontal flip
- perspective nhe
- rotation nho

Tac dung:

- giup detector ben vung voi goc chup va vi tri vat the

#### B. Photometric transforms

- `HSV jitter`
- blur nhe
- noise nhe
- compression

Tac dung:

- YOLO van phat hien duoc object trong anh chat luong kem

#### C. Small-object robustness

Rat quan trong voi dao, luoi lam, dung cu nho:

- downscale toan anh roi resize len lai
- giu object nho xuat hien nhieu trong train
- copy-paste object nho len cac background khac nhau

#### D. Hard negative emphasis

Can tang cuong su da dang cua:

- dao mo
- keo phau thuat
- vet thuong y khoa
- blood-like textures an toan

Muc tieu:

- giam `False Positive` cho class nguy hiem

#### E. Mosaic / mix strategies

Co the dung:

- `Mosaic` muc vua
- `MixUp` rat nhe neu can

Nhung chi nen dung co kiem soat vi object cua ban co the nho.

### 4.3 Muc manh goi y

- `mosaic`: khong qua manh, co the chi bat xac suat thap den vua
- `scale`: quanh `0.8 - 1.2`
- `degrees`: nho
- `translate`: nho den vua
- `perspective`: rat nhe

### 4.4 Khong nen lam

- crop cat trung object qua nhieu
- mosaic qua muc voi object nho
- erase de len chinh object
- deformation qua manh lam bbox mat y nghia

## 5. Tram 3 - Temporal Transformer uu tien F1 va giam nham cheo

### 5.1 Muc tieu

Mo hinh nay can phan biet:

- `violence`
- `self_harm`
- `nsfw`

Nen augmentation phai giu du:

- ngu canh
- quan he giua nguoi-va-nguoi
- quan he giua nguoi-va-vat the
- tin hieu theo chuoi thoi gian

### 5.2 Nguyen tac quan trong

Voi model thoi gian, augmentation nen duoc ap dung `dong nhat theo clip`, khong nen moi frame mot kieu.

Vi du dung:

- cung mot crop cho ca clip
- cung mot color jitter cho ca clip
- cung mot blur/compression cho ca clip

Khong nen:

- moi frame crop mot kieu
- moi frame doi mau manh mot kieu

Neu lam vay, model se hoc nhieu thay vi hoc dong hoc.

### 5.3 Nen tang cuong nhu the nao

#### A. Temporal crop

- cat doan clip o cac diem bat dau khac nhau
- cat cua so con co do dai co dinh

Tac dung:

- tranh model chi hoc phan mo dau hoac giua clip

#### B. Speed jitter

- tang hoac giam toc nhe
- vi du `0.8x - 1.25x`

Tac dung:

- ben vung hon voi toc do hanh vi khac nhau

#### C. Frame dropout

- bo ngau nhien mot so frame

Tac dung:

- tranh phu thuoc vao frame cuc ky dac trung

#### D. Clip-consistent spatial transforms

- crop nhe, resize, flip ngang khi hop ly
- brightness/contrast jitter dong nhat tren ca clip
- blur/compression dong nhat tren ca clip

Tac dung:

- giu tinh lien tuc, nhung van tang do kho

#### E. Flow-aware augmentation

Vi pipeline co them `Optical Flow` va `YOLO score`, can luu y:

- augmentation khong nen lam flow tro nen vo nghia
- khong nen random shuffle frame trong giai doan supervised

### 5.4 Theo tung nhom nhan

#### Violence

Nen giu:

- tuong tac giua nhieu nguoi
- chuyen dong dot ngot
- xung dot vat ly

Khong nen crop qua chat vao mot patch nho.

#### Self-harm

Nen giu:

- vat sac
- bo phan co the lien quan
- thao tac huong vao ban than

Khong nen dung augmentation che mat vung tay, co tay, vat the chinh.

#### NSFW

Nen giu:

- ngu canh tong the
- tu the
- vung nhay cam o muc du thong tin

Khong nen crop thanh patch da mo ho de model hoc texture sai.

### 5.5 Khong nen lam

- color jitter qua manh tren tung frame rieng le
- temporal shuffle trong supervised fine-tuning
- crop qua manh lam mat ngu canh
- augmentation khien clip tu positive thanh khong con du thong tin nhan

## 6. Temporal SSL nen tang cuong nhu the nao

### 6.1 Muc tieu

Temporal SSL khong hoc nhan truc tiep, ma hoc:

- quy luat thoi gian
- huong thoi gian
- tinh nhat quan cua dien bien

Vi vay augmentation phai:

- giu du semantics cua clip
- nhung khong de den muc model hoc meo tat

### 6.2 Nen dung

#### A. Two-view temporal crops

Lay 2 view tu cung mot video:

- khac diem bat dau
- khac cua so nho
- van cung mot hanh vi

#### B. Speed perturbation nhe

- `0.8x - 1.2x`

#### C. Frame masking / frame dropout nhe

- bo mot ti frame
- giup model hoc tu ngu canh thoi gian con lai

#### D. Spatial transforms dong nhat theo clip

- crop nhe
- color jitter nhe
- blur nhe
- compression nhe

#### E. Reverse-order cho bai toan Arrow of Time

Neu bai toan la `Arrow of Time`, mot view co the la clip goc, mot view la clip dao thu tu.

Neu bai toan la `Frame Sorting`, co the tao cac muc do xao tron duoc kiem soat.

### 6.3 Khong nen lam

- xao tron qua manh den muc clip mat logic
- crop qua manh den muc frame nao cung giong frame nao
- dung nhieu clip tinh, it chuyen dong cho pretext task thoi gian

## 7. SwAV nen tang cuong nhu the nao

### 7.1 Ban chat cua SwAV

SwAV hoc representation bang cach:

- tao nhieu view cua cung mot anh
- ep cac view nay co gan prototype nhat quan

No khong toi uu truc tiep cho `Recall`, `Precision`, hay `F1`.
No toi uu cho:

- embedding co y nghia
- gom cum tot
- chuyen giao tot sang stage sau

### 7.2 Multi-crop la trung tam

SwAV thuong dung:

- `2 global crops`
- `nhieu local crops`

Y nghia:

- global crop giu ngu canh lon
- local crop buoc model hoc chi tiet cuc bo

### 7.3 Goi y cho bai toan cua du an

Voi bai toan kiem duyet, nen dung `multi-crop bao thu`:

- `2 global crops` lon
- `4 - 6 local crops` nho vua phai

Khong nen cho local crop qua nho, vi:

- de mat dao, tay, bo phan co the, vung nhay cam
- model hoc texture vuot muc can thiet

### 7.4 Augmentation phu hop cho SwAV

- `RandomResizedCrop`
- `ColorJitter`
- `GaussianBlur`
- `Solarization` nhe neu can thu nghiem
- `HorizontalFlip`
- `Grayscale` xac suat thap

### 7.5 Cach dat muc do

Nhom du lieu cua ban co nhieu semantics nhay cam, nen:

- global crop giu vung nhieu thong tin
- local crop khong qua nho
- blur va color jitter muc vua
- khong duoc de view bi "vo nghia" sau khi crop

### 7.6 Cach danh gia SwAV

Theo dung tinh than `kehoach.md`, khong danh gia SwAV chi bang loss.
Nen dung:

- `k-NN`
- `linear probing`
- `RankMe`

Neu cac chi so nay tang, embedding dang hoc dung huong.

## 8. Bang tom tat nhanh theo tung stage

| Stage | Metric uu tien | Augmentation nen uu tien | Dieu can tranh |
| --- | --- | --- | --- |
| EfficientNet-B0 | Recall | blur, compression, low-light, crop nhe, occlusion nho, frame jitter | crop qua manh, erase lon, vertical flip |
| YOLOv8-nano | mAP@0.5 | scale, translate, HSV, blur nhe, copy-paste, hard negative | mosaic qua manh, cat trung object, deformation qua muc |
| Temporal Transformer | F1, confusion matrix | temporal crop, speed jitter nhe, frame dropout, clip-consistent transforms | moi frame mot augmentation, temporal shuffle trong supervised |
| Temporal SSL | representation thoi gian | two-view clip, speed perturbation nhe, frame masking nhe | xao tron vo nghia, clip qua tinh |
| SwAV | semantic embedding | multi-crop, color jitter, blur, flip, crop bao thu | local crop qua nho, view mat semantics |

## 9. Goi y cau hinh thuc dung cho du an nay

### 9.1 Tram 1

- Tang cuong manh hon tren positive
- oversample positive
- threshold thap
- bo sung hard positive xau

### 9.2 Tram 2c

- tap trung object nho
- tang hard negative y khoa
- kiem soat mosaic

### 9.3 Tram 3

- dung augmentation dong nhat tren toan clip
- giu ngu canh day du cho 3 task
- uu tien giam nham cheo hon la lam du lieu qua kho

### 9.4 SSL

- SwAV: hoc khong gian
- Temporal SSL: hoc trinh tu, huong thoi gian, tinh nhat quan clip

## 10. Ket luan

Co 3 quy tac can ghi nho:

1. Khong chon augmentation theo thoi quen; phai chon theo metric can toi uu.
2. Bai toan kiem duyet can augmentation "thuc te", khong can qua nhieu bien doi dep ve hoc thuat nhung xa roi du lieu that.
3. Voi video, tinh nhat quan theo clip quan trong hon so luong augmentation.

Neu can mo rong tai lieu nay o buoc tiep theo, nen bo sung:

- bo tham so xac suat cu the cho tung transform
- goi y pipeline `albumentations` cho image
- goi y pipeline `torchvision` hoac `pytorchvideo` cho clip
- mapping augmentation theo tung dataset cu the trong Kaggle
