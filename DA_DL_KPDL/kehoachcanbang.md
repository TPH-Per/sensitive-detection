# Ke Hoach Can Bang Du Lieu

## 1. Muc dich cua tai lieu nay

Tai lieu nay ghi ro cach xu ly lech nhan trong pipeline hien tai, dac biet la truc tiep tra loi cau hoi:

- Co can can bang `temporal` khong?
- Co can can bang `multitask` khong?
- Co can can bang trong tung batch khong?
- Co can duoc phep sample lap lai khong?
- Co can rerun lai cell extract feature khong?

Ket luan ngan gon:

- `temporal` khong can can bang manh nhu `multitask`.
- `multitask` can can bang truoc tien.
- Khong nen rerun lai cac cell extract feature chi vi doi chien luoc can bang.
- Neu can can bang, nen lam o tang loader/sampler/loss khi train.

## 2. Hien trang du lieu dang co

Tu cac manifest hien tai, co the thay:

- Nhom `0,0,0` dang chiem uu the rat ro.
- `multitask` co 4 to hop nhan dang xuat hien nhieu nhat:
  - `0,0,0`
  - `0,0,1`
  - `1,0,0`
  - `0,1,0`
- `temporal` hien tai la bai toan dong vai tro representation/khai niem thoi gian, nen so luong mau am tinh rat lon la dieu de hieu.

Y nghia thuc te:

- `0,0,0` nhieu la hop ly neu no dai dien cho normal/khong bat thuong.
- Van de chi xay ra neu no ap dao qua muc lam model hoc duong tat: doan toan 0 de giam loss.

## 3. Phan biet ro temporal va multitask

### 3.1 Temporal

Muc tieu chinh cua `temporal` la giu cho model hoc duoc dac trung lien quan den:

- trinh tu thoi gian
- bien dong giua cac frame
- su khac nhau giua video binh thuong va video co tinh bao dong
- cai the nao la "hieu" ve thoi gian, khong chi la nhan dien tinh dung/sai

Vi vay, voi `temporal`:

- Khong can ep dung ti le nhan cho tung token qua gat gao.
- Quan trong hon la:
  - du nguon du lieu
  - du do da nhieu frame / do dai clip
  - khong de 1 nguon chiem het batch
  - khong de all-zero chen ap dao hoan toan

Neu `temporal` duoc xem la pretext/SSL-like stage:

- Noi dung can bang nay chi co tac dung giup representation khong bi nghienh ve 1 kieu mau.
- Khong nen coi no giong mot bai toan supervised multi-label hoan chinh.

### 3.2 Multitask

`multitask` la phan can bang can nghiem tuc hon, vi:

- model phai hoc tung token ro rang
- error cua tung token anh huong truc tiep den chinh xac tong the
- `0,0,0` qua nhieu se lam model ngieng ve du doan an toan qua muc

Vi vay, voi `multitask`:

- nen can bang giua mau thuong va mau bat thuong
- can bat canh cham giam cho `0,0,0` chiem ty le qua lon trong training
- nen co sampler hoac weighting
- nen can nhac pos_weight theo tung token

## 4. Cau tra loi cho cau hoi cua ban

### 4.1 Co can can bang temporal khong?

Co, nhung chi can can bang o muc vua phai.

Khong phai can bang theo kieu ep moi batch phai co dung 25% tung nhan. Thay vao do:

- giu diversity cua video
- giu canh giac voi source bias
- dam bao `0,0,0` khong ap dao qua muc

Neu temporal dang la stage representation/SSL-like:

- can bang qua manh co the lam giam suc hoc tu nhung mau am tinh pho bien
- va lam mat tinh tu nhien cua du lieu

### 4.2 Co can can bang multitask khong?

Co, day la cho can uu tien.

Ly do:

- multitask dung de hoc 3 token chinh
- neu `0,0,0` qua nhieu, model rat de hoc cach an toan la doan toan 0
- khi do recall cua cac token duong se xuong

### 4.3 Co can can bang trong tung batch khong?

Khong can phai can bang tuyet doi trong tung batch.

Ly do:

- batch size nho thi can bang tuyet doi khong on dinh
- an chot tung batch de manh co the lam training bi dao dong
- tot hon la can bang o muc tong the cua epoch hoac bang weighting

Muc tieu hop ly hon:

- moi batch co it nhat mot phan mau bat thuong
- `0,0,0` khong duoc chiem toan bo batch
- batch van du tinh da dang

## 5. Neu can bang thi can bang theo cach nao

### 5.1 Cach 1: Weight loss

Day la cach an toan nhat de bat dau.

Y tuong:

- khong doi batch
- khong lam duplicate sample
- chi lam token hiem duoc phat nang hon trong loss

Hop voi:

- `multitask`
- `temporal` neu muon dung nhe tay

Uu diem:

- don gian
- it rui ro
- giu nguyen du lieu goc

Nhuoc diem:

- neu `0,0,0` qua ap dao, chi loss weighting co the chua du

### 5.2 Cach 2: Sampler co trong so

Day la cach can can bang manh hon.

Y tuong:

- mau hiem duoc lay xuat hien nhieu hon
- mau pho bien nhu `0,0,0` bi giam xuong

Hop voi:

- `multitask`
- `temporal` neu do lech qua manh

Uu diem:

- thay doi duoc phan bo batch
- lam model nhin thay nhieu hon mau quan trong

Nhuoc diem:

- co the sinh duplicate
- co the lam giam diversity neu lam qua tay
- co the lam overfit mau hiem

### 5.3 Cach 3: Ket hop sampler + loss weighting

Day la phuong an manh nhat neu lech rat nang.

Y tuong:

- sampler dam bao mau duong tinh duoc nhin thay nhieu hon
- loss weighting dam bao token hiem khong bi chim

Hop voi:

- `multitask` truoc tien
- `temporal` neu sau khi do van thay model qua thich toan 0

## 6. Co sample bi lap lai khong?

Co the co, neu dung sampler co replacement.

### 6.1 Neu chi dung shuffle binh thuong

- sample khong bi lap trong cung epoch do sampler ngau nhien.
- moi sample xuat hien 1 lan trong 1 epoch.
- day la che do an toan nhat neu chua can can bang manh.

### 6.2 Neu dung sampler co replacement

- 1 sample co the xuat hien nhieu lan trong 1 epoch.
- thậm chi co the lap ngay trong cung batch.

Tac dong:

- Tot neu do la sample hiem, can duoc hoc them.
- Xau neu lap qua nhieu, vi model de ghi nho thay vi hoc tong quat.

Ket luan:

- Lap lai co xay ra, nhung chi nen xay ra co kiem soat.
- Khong nen de 1 sample bi rut len qua nhieu lan.

## 7. Trong batch co can giu ti le giua nhan thuong va 3 truong hop kia khong?

### 7.1 Doi voi multitask

Nen co, nhung khong can dung tuyet doi.

Muc tieu hop ly:

- batch co su xen ke giua mau thuong va mau bat thuong
- mau `0,0,0` khong duoc ap dao
- mau `0,0,1`, `1,0,0`, `0,1,0` duoc xuat hien deu hon

Neu batch size nho:

- khong nen co gang ep mot ti le qua chat
- nen can bang o muc epoch, khong o muc tung batch

### 7.2 Doi voi temporal

Can nhe tay hon.

Ly do:

- temporal co muc tieu hoc representation ve thoi gian
- neu ep batch qua can bang, co the lam mat phan bo tu nhien cua du lieu
- che do lech nhe van chap nhan duoc, mien la khong bi collapse ve all-zero

### 7.3 Doi voi SSL-like stage

Neu ban coi temporal nhu pretext/SSL:

- khong can ep ti le nhan giong supervised multi-label
- uu tien da dang clip, da dang source, da dang do dai, da dang complexity

## 8. De xuat cu the cho du lieu hien tai

### 8.1 Cho temporal

Khuyen nghi:

- khong can can bang manh
- chi can dam bao source khong bi lech qua dung ve 1 nhom
- neu thay model hay doan toan 0, bo sung sampler nhe hoac weighting nhe

### 8.2 Cho multitask

Khuyen nghi:

- can bang ro hon temporal
- co the:
  - giam ty le `0,0,0`
  - tang trong so cho mau co it nhat 1 token duong
  - tang trong so hon nua cho token hiem

### 8.3 Cho proxy neu con dung

Neu co proxy gate:

- can bang giua risky va safe
- day la bai toan 2 lop, don gian hon multitask
- co the dung weighted sampling nhe neu lech qua nang

## 9. Khong nen lam gi

- Khong nen rerun lai feature extraction chi vi doi can bang.
- Khong nen ep tung batch phai co ti le exact.
- Khong nen de replacement sampler trong batch size nho ma khong kiem soat, vi duplicate co the rat nhieu.
- Khong nen can bang temporal qua tay nhu multitask.

## 10. Thu tu uu tien thuc te

Neu ban muon chinh ngay:

1. Giu nguyen toan bo file feature va manifest.
2. Chinh loader/sampler/loss trong stage train.
3. Chay 1 batch test de kiem tra shape va ti le nhan.
4. Neu on, rerun lai chi cac cell train lien quan.
5. Chi evaluate lai sau cung, khong can trich xuat lai toan bo.

## 11. Khuyen nghi quyet dinh cuoi

Neu phai chon mot huong:

- `multitask` la noi can u tien can bang truoc.
- `temporal` chi can can bang vua phai, chu khong can don nanh nhu `multitask`.

Ly do:

- temporal can giu tinh tu nhien de hoc representation thoi gian
- multitask la noi lech nhan de gay lam model nhat
- 0,0,0 chiem uu the la van de chinh can xu ly

## 12. Tom tat 1 dong

- `temporal`: can bang nhe, uu tien diversity va source balance.
- `multitask`: can bang ro, uu tien giam `0,0,0` va tang mau duong tinh.
- `duplicate`: co the xay ra neu sampler co replacement, va chi nen xay ra co kiem soat.
- `batch balance`: khong can exact, chi can khong de all-zero ap dao toan bo batch.
