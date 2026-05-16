# Mo ta model - luong video va cach cac block ket hop

> File nay chi mo ta duong di cua mot video trong giai doan suy luan. Khong mo ta train, khong mo ta split du lieu, va khong mo ta tao manifest.

## 1. Muc tieu

He thong nhan vao mot video, tach video thanh tung scene, loc nhanh scene an toan, roi chi dua scene nghi ngo qua cac block nang hon de sinh ra 3 diem so doc lap:

- violence
- self_harm
- nsfw

Diem quan trong nhat cua luong nay la:

- video khong duoc dua thang vao mot model duy nhat
- video duoc xu ly theo tung scene
- moi scene co the dung som o proxy gate neu duoc xem la an toan
- scene con lai moi di qua CLIP, optical flow, YOLO va NSFW scorer
- cac signal nay duoc fusion trong mot temporal model co task tokens

## 2. So do tong the

```mermaid
flowchart TD
    V[Video input] --> SC[Scene cut / shot boundary]
    SC --> PG[Proxy gate - EfficientNet-B0\nsample toi da 8 frames / scene]

    PG -->|safe| SAFE[Scene an toan\nskip nhanh]
    PG -->|risky| FS[Frame sampler\nsample toi da 64 frames]

    FS --> CLIP[CLIP encoder\nfeature [T, 768]]
    FS --> FLOW[Optical flow\nfeature [T, 3]]
    FS --> YOLO[YOLO aux\nfeature [T, 2]]
    FS --> NSFW[NSFW scorer\nfeature [T, 1]]

    FLOW --> AUX[Concat aux\naux_array [T, 6]]
    YOLO --> AUX
    NSFW --> AUX

    CLIP --> TTM[TaskPromptedTemporalModel]
    AUX --> TTM

    TTM --> LOGITS[3 logits\nviolence / self_harm / nsfw]
    LOGITS --> SIG[sigmoid + thresholds]
    SIG --> OUT[Scene-level JSON]
```

Neu video co nhieu scene, cac buoc tren lap lai cho tung scene. Ket qua cuoi cung la mot JSON gom danh sach scene va score / flag tuong ung.

## 3. Cac block chinh trong duong di cua video

### 3.1. Scene cut

Video truoc tien duoc tach thanh cac scene bang shot boundary detection. Muc dich la de:

- tranh tron nhieu canh khac nhau vao cung mot doan xu ly
- giu ngu canh each scene ro rang hon
- cho proxy gate va temporal model lam viec tren don vi scene thay vi tren toan video thoi

Neu khong co detector scene, he thong co the fallback ve mot scene duy nhat.

### 3.2. Proxy gate

Moi scene lay mot so frame it, toi da 8 frame, roi di qua [src/models/proxy_efficientnet.py](src/models/proxy_efficientnet.py).

Proxy gate co nhiem vu:

- loc nhanh scene an toan
- giam so frame phai dua sang cac block nang hon
- giu do nhay cho scene co nguy co

Neu proxy tra ve score thap hon nguong, scene do dung o day. Neu vuot nguong, scene moi duoc dua sang cac block feature day du hon.

### 3.3. Frame sampler cho scene nguy co

Voi scene da pass proxy, he thong sample toi da 64 frame.

Neu so frame thuc te:

- lon hon 64: truncate ve 64
- nho hon 64: padding de dong bo

Muc tieu cua buoc nay la tao mot chuoi frame co do dai on dinh cho cac block sau.

### 3.4. CLIP branch

Tu cac frame da sample, he thong trich CLIP feature:

- dau ra: `[T, 768]`
- y nghia: embedding khong gian cua tung frame

Day la dong vao chinh cho temporal model. Model cuoi khong doc raw video truc tiep ma doc chuoi feature nay.

### 3.5. Aux branches

Ngoai CLIP, cung mot tap frame con duoc dua qua 3 nhom signal phu:

- optical flow: `[T, 3]`
- YOLO aux: `[T, 2]`
- NSFW aux: `[T, 1]`

Ba signal nay khong o cung muc vai tro:

- optical flow mo ta chuyen dong
- YOLO mo ta vat the / dau hieu nguy co
- NSFW mo ta do nhay cam theo frame

## 4. Chot lai diem de nham: aux_array va 2 nhanh trong model

Day la diem quan trong nhat can ghi ro:

- o buoc feature extraction, he thong chi tao mot `aux_array` duy nhat co dang `[T, 6]`
- `aux_array` duoc ghep theo thu tu:
  - 3 chieu dau: optical flow
  - 2 chieu tiep: YOLO
  - 1 chieu cuoi: NSFW
- vi vay `aux_array = [flow, yolo, nsfw]` chi la cach pack du lieu

Hai nhanh motion / semantic **khong duoc tao ra o buoc luu feature**. Chung duoc tach ben trong model:

- motion branch = 3 chieu dau cua aux
- semantic branch = 3 chieu con lai cua aux

Nghia la:

1. feature extraction tao mot aux vector duy nhat
2. TaskPromptedTemporalModel moi split aux vector do thanh 2 nhanh

## 5. So do ben trong TaskPromptedTemporalModel

```mermaid
flowchart TD
    X[CLIP features\n[B, T, 768]] --> CP[clip_proj]
    A[aux_array\n[B, T, 6]] --> SPLIT{Split theo channel}

    SPLIT --> M[Motion branch\nflow [B, T, 3]]
    SPLIT --> S[Semantic branch\nyolo + nsfw [B, T, 3]]

    CP --> FUS[GatedMotionAuxFusion]
    M --> FUS
    S --> FUS

    FUS --> POS[frame_pos_embed]
    POS --> ENC[frame_encoder]

    ENC --> TOK[task_tokens x 3]
    TOK --> CA[cross-attention blocks]
    CA --> HEADS[3 classification heads]

    HEADS --> OUTLOGITS[violence / self_harm / nsfw logits]
```

### 5.1. GatedMotionAuxFusion lam gi

Block fusion khong tron tat ca signal vao mot loi tinh chung. No dung hai gate rieng:

- motion gate cho flow
- aux gate cho semantic signal

Trinh tu nhan du lieu ben trong model la:

1. CLIP feature di qua `clip_proj`
2. flow di qua nhan motion
3. YOLO + NSFW di qua nhan semantic
4. moi nhan co mot gate rieng de quyet dinh muc do dua tin hieu phu vao latent chinh

Do do:

- motion khong bi nuot boi semantic
- semantic khong bi nuot boi motion
- model co the hoc frame nao can tin vao chuyen dong, frame nao can tin vao vat the / do nhay cam

### 5.2. frame_pos_embed

Sau fusion, model cong them positional embedding de giu thu tu frame trong scene. Buoc nay giup model hieu:

- frame nao den truoc
- frame nao den sau
- chuoi thay doi nhu the nao theo thoi gian

### 5.3. frame_encoder

`frame_encoder` xu ly toan bo chuoi frame sau khi da co positional embedding. Day la noi latent khong gian va thoi gian bat dau duoc bien doi thanh bieu dien co cau truc tot hon.

### 5.4. task_tokens va cross-attention

Model co 3 task tokens:

- token cho violence
- token cho self_harm
- token cho nsfw

Ba token nay khong lay trung binh thang tren frame. Chung dung cross-attention de truy van toan bo frame tokens va hoi thong tin lien quan den tung tac vu.

Noi cach khac:

- frame tokens giu thong tin video
- task tokens di hoi thong tin can dung cho tung nhan
- moi task token sinh ra mot output rieng

### 5.5. 3 classification heads

Sau cross-attention, model co 3 head doc lap:

- `v_head`
- `s_head`
- `n_head`

Moi head tra ve 1 logit. Ba logit nay sau do duoc dua qua sigmoid va so voi threshold de tao flag.

## 6. Kich thuoc du lieu trung gian

| Thanh phan | Kich thuoc | Y nghia |
|---|---|---|
| CLIP feature | `[T, 768]` | Embedding khong gian cua frame |
| Optical flow | `[T, 3]` | Chan do chuyen dong |
| YOLO aux | `[T, 2]` | Dau hieu vat the / nguy co |
| NSFW aux | `[T, 1]` | Dau hieu nhay cam |
| aux_array | `[T, 6]` | Signal phu da ghep thanh mot mang |
| Motion branch | `[T, 3]` | 3 chieu dau cua aux_array |
| Semantic branch | `[T, 3]` | 3 chieu con lai cua aux_array |
| Task tokens | `[B, 3, D]` | 3 token truy van cho 3 tac vu |
| Logits | `[B, 3]` | violence / self_harm / nsfw |

## 7. Dau ra cuoi cung

Sau khi co 3 logits, he thong:

1. ap sigmoid
2. so voi threshold cua tung nhan
3. tao flags cho tung scene
4. ghi ket qua vao JSON

Mot scene output thuong gom:

- scene_id
- start_frame / end_frame
- proxy_risky_prob
- scores
- flags
- backend scene cut

Neu can danh gia theo video thay vi theo scene, phan tong hop co the lay `max` tren cac scene hoac dung quy tac `any(scene flagged)` tuy policy cua he thong.

## 8. Ghi chu de tranh nham lan

- `aux_array` la du lieu ghep o buoc feature extraction, khong phai hai nhanh rieng tu ban dau
- hai nhanh motion / semantic chi xuat hien ben trong [src/models/task_prompted_model.py](src/models/task_prompted_model.py)
- Scene an toan co the dung o proxy gate, khong di qua cac block nang hon
- Model live khong doc raw video truc tiep ma doc chuoi feature da duoc chuan hoa ve do dai

## 9. Tom tat mot dong

Video -> scene cut -> proxy gate -> frame sampler -> CLIP + aux features -> aux_array [T, 6] -> split trong model thanh motion va semantic -> frame encoder -> task tokens -> 3 heads -> sigmoid / thresholds -> scene-level JSON.
