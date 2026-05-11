# PROMPT — CELL 5: BUILD FEATURES 775-DIM V6.1

## BỐI CẢNH

Pipeline V6.1 cần extract feature vector 775-dim cho mỗi video:
  [CLIP(768) | Flow(3) | YOLO(1) | Gore(1) | SelfHarm(1) | NSFW(1)]
  Index:  0:768  | 768:771 | 771:772 | 772:773 | 773:774  | 774:775

Expert weights đã train xong, temperature calibration đã có:
  gore_detector_v6_best.pth     → T=0.50
  selfharm_detector_v6_best.pth → T=1.50
  nsfw_classifier_v6_best.pth   → T=1.50
  yolov8_weapon_v6_best.pt      → không cần T

## VẤN ĐỀ HIỆN TẠI

build_features_v6.py hiện tại KHÔNG có --video_list_file argument.
UCF-101 có 13,320 videos → ước tính 14.8 giờ → KHÔNG đủ thời gian.
Còn lại trong Kaggle session: ~4 giờ.

## NHIỆM VỤ CẦN LÀM

### BƯỚC 1 — Thêm --ucf101_sample_n vào build_features_v6.py

Tìm phần argparse trong build_features_v6.py, thêm argument:

```python
parser.add_argument(
    "--ucf101_sample_n",
    type=int,
    default=1200,
    help="Sample N videos từ UCF-101 (mỗi class đều nhau). "
         "Default=1200 (~12/class). Dùng -1 để lấy tất cả."
)
```

Tìm phần load UCF-101 videos, thêm sampling logic:

```python
def sample_ucf101(ucf101_dir: str, n: int = 1200) -> list:
    """
    Sample n videos từ UCF-101, đều từng class.
    101 classes × (n//101) videos/class.
    """
    import glob, random
    from collections import defaultdict

    all_videos = glob.glob(
        f"{ucf101_dir}/**/*.avi", recursive=True
    )
    by_class = defaultdict(list)
    for p in all_videos:
        cls = os.path.basename(os.path.dirname(p))
        by_class[cls].append(p)

    per_class = max(1, n // len(by_class))
    sampled = []
    for cls, videos in by_class.items():
        random.shuffle(videos)
        sampled.extend(videos[:per_class])

    random.shuffle(sampled)
    print(f"UCF-101 sampled: {len(sampled)}/{len(all_videos)} videos "
          f"({len(by_class)} classes × {per_class}/class)")
    return sampled
```

Trong main(), thay:
```python
# CŨ (lấy hết 13,320 videos)
ucf101_videos = glob.glob(f"{ucf101_dir}/**/*.avi", recursive=True)

# MỚI (sample đều từng class)
if args.ucf101_sample_n > 0:
    ucf101_videos = sample_ucf101(ucf101_dir, args.ucf101_sample_n)
else:
    ucf101_videos = glob.glob(f"{ucf101_dir}/**/*.avi", recursive=True)
```

### BƯỚC 2 — Đảm bảo có checkpoint/resume logic

build_features_v6.py phải có logic skip video đã extract:

```python
def get_output_path(video_path: str, output_dir: str) -> str:
    """Tạo output .npy path từ video path."""
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    # Thêm parent folder để tránh collision giữa datasets
    parent = os.path.basename(os.path.dirname(video_path))
    return os.path.join(output_dir, f"{parent}_{video_name}.npy")

# Trong vòng lặp extract:
for video_path in tqdm(all_videos):
    out_path = get_output_path(video_path, args.output_dir)

    # SKIP nếu đã extract (--skip_existing)
    if args.skip_existing and os.path.exists(out_path):
        continue

    try:
        features = extract_video_features(video_path, ...)
        # features shape: [T, 775]
        np.save(out_path, features)
    except Exception as e:
        logger.warning(f"SKIP {video_path}: {e}")
        continue
```

### BƯỚC 3 — Đảm bảo output shape đúng [T, 775]

Sau khi extract mỗi video, assert shape:
```python
assert features.shape[1] == 775, \
    f"Expected 775-dim, got {features.shape[1]} — check FEAT_IDX"

# Log mỗi 100 videos để theo dõi progress
if video_idx % 100 == 0:
    logger.info(
        f"[{video_idx}/{total}] {os.path.basename(video_path)} "
        f"→ shape={features.shape} | "
        f"gore_mean={features[:,772].mean():.3f} | "
        f"nsfw_mean={features[:,774].mean():.3f}"
    )
```

### BƯỚC 4 — Validate output cuối cùng

Cuối script, chạy quick validation:
```python
def validate_features(output_dir: str):
    npy_files = glob.glob(f"{output_dir}/*.npy")
    print(f"\nTotal .npy files: {len(npy_files)}")

    sample_files = random.sample(npy_files, min(20, len(npy_files)))
    dims, has_nan, has_inf = [], 0, 0
    expert_stds = {k: [] for k in ["gore","selfharm","nsfw"]}

    for f in sample_files:
        arr = np.load(f)
        dims.append(arr.shape[1])
        if np.isnan(arr).any(): has_nan += 1
        if np.isinf(arr).any(): has_inf += 1
        expert_stds["gore"].append(arr[:,772].std())
        expert_stds["selfharm"].append(arr[:,773].std())
        expert_stds["nsfw"].append(arr[:,774].std())

    print(f"Dim check:   {set(dims)} (expected {{775}})")
    print(f"NaN files:   {has_nan}")
    print(f"Inf files:   {has_inf}")
    for k, v in expert_stds.items():
        mean_std = sum(v)/len(v)
        status = "OK" if mean_std > 0.01 else "WARN low variance"
        print(f"{k} std:   {mean_std:.4f} [{status}]")

validate_features(args.output_dir)
```

## COMMAND ĐỂ CHẠY SAU KHI SỬA XONG

```bash
!python scripts/build_features_v6.py \
  --video_dirs \
    /kaggle/input/datasets/vulamnguyen/rwf2000/RWF-2000 \
    /kaggle/input/datasets/bypktt/ucf-crimes \
    /kaggle/input/datasets/pevogam/ucf101/UCF101/UCF-101 \
  --output_dir /kaggle/working/features_v6 \
  --yolo_weight     /kaggle/working/trong_so/yolov8_weapon_v6_best.pt \
  --gore_weight     /kaggle/working/trong_so/gore_detector_v6_best.pth \
  --nsfw_weight     /kaggle/working/trong_so/nsfw_classifier_v6_best.pth \
  --selfharm_weight /kaggle/working/trong_so/selfharm_detector_v6_best.pth \
  --gore_T     0.50 \
  --nsfw_T     1.50 \
  --selfharm_T 1.50 \
  --ucf101_sample_n 1200 \
  --quality_aug --aug_prob 0.4 \
  --batch_size 32 --device cuda \
  --skip_existing
```

## THỜI GIAN ƯỚC TÍNH SAU KHI SỬA

```
RWF-2000:   2,000 videos × 4s = 2.2 giờ
UCF-Crimes: 1,950 videos × 4s = 2.2 giờ
UCF-101:    1,200 videos × 4s = 1.3 giờ
─────────────────────────────────────────
Tổng:       5,150 videos      ≈ 5.7 giờ
Margin:     ~15 phút (tight!)
```

⚠️ NẾU vẫn lo timeout → giảm xuống --ucf101_sample_n 800:
```
Tổng: ~4,750 videos ≈ 5.3 giờ (margin ~40 phút)
```

## FEAT_IDX MAPPING (KHÔNG ĐƯỢC THAY ĐỔI)

```python
FEAT_IDX = {
    "clip":     slice(0,   768),
    "flow":     slice(768, 771),
    "yolo":     slice(771, 772),
    "gore":     slice(772, 773),
    "selfharm": slice(773, 774),  # V6.1 — KHÔNG phải 772:773
    "nsfw":     slice(774, 775),
}
# Tổng: 768 + 3 + 1 + 1 + 1 + 1 = 775
```

## GATE 5 — ĐIỀU KIỆN PASS

```
✅ Tổng .npy files >= 4,500
✅ Tất cả files có shape [T, 775]
✅ Không có NaN hoặc Inf
✅ gore std > 0.01 (model fire khác nhau mỗi video)
✅ selfharm std > 0.01
✅ nsfw std > 0.01
```

## LƯU Ý QUAN TRỌNG

1. quality_aug (VideoQualityAugmentor) CHỈ apply cho train videos
   val/test videos KHÔNG aug — kiểm tra code có check split không

2. Nếu session timeout giữa chừng:
   Chạy lại với --skip_existing → tiếp tục từ video chưa extract

3. Sau khi Cell 5 xong, lưu ngay features_v6/ ra Kaggle Dataset
   để Session 2 không cần extract lại:
   kaggle datasets create -p /kaggle/working/features_v6

4. Temperature values phải khớp Cell 4.5 output:
   gore_T=0.50, selfharm_T=1.50, nsfw_T=1.50
