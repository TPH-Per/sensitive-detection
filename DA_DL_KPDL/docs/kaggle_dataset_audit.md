# Kaggle Dataset Audit Script

## Muc tieu

Tai lieu nay cung cap 1 cell Python de:

- Kiem tra 3 dataset duoc attach tren Kaggle.
- In ra 10 sample dau tien trong cau truc thu muc (dang cay, theo BFS).
- Dem so file trong moi folder con cap 1 (de quy).
- In tong so file cua toan bo dataset.

## Cach dung tren Kaggle

1. Mo Kaggle Notebook va attach 3 dataset:
   - /kaggle/input/datasets/vulamnguyen/rwf2000
   - /kaggle/input/datasets/bypktt/ucf-crimes
   - /kaggle/input/datasets/caoqucph/data-dl
2. Tao 1 code cell moi.
3. Copy toan bo code ben duoi vao cell.
4. Run cell.

~~~python
import os
from pathlib import Path

DATASETS = [
    "/kaggle/input/datasets/vulamnguyen/rwf2000",
    "/kaggle/input/datasets/bypktt/ucf-crimes",
    "/kaggle/input/datasets/caoqucph/data-dl",
]


def count_files_recursive(folder_path: Path) -> int:
    total = 0
    for _, _, files in os.walk(folder_path):
        total += len(files)
    return total


def first_10_tree_samples(root_path: str, limit: int = 10):
    samples = []
    root = Path(root_path)
    if not root.exists():
        return samples

    queue = [root]
    while queue and len(samples) < limit:
        current = queue.pop(0)
        try:
            children = sorted(current.iterdir(), key=lambda p: p.name.lower())
        except Exception:
            continue

        for child in children:
            rel = child.relative_to(root)
            samples.append(("DIR" if child.is_dir() else "FILE", str(rel)))
            if child.is_dir():
                queue.append(child)
            if len(samples) >= limit:
                break

    return samples


def print_dataset_report(ds_path: str):
    print("=" * 110)
    print(f"DATASET: {ds_path}")

    root = Path(ds_path)
    if not root.exists():
        print("  -> KHONG TON TAI hoac chua attach dataset vao notebook.")
        return

    # 1) 10 sample dau tien trong cau truc thu muc
    samples = first_10_tree_samples(ds_path, limit=10)
    print("\n[10 sample dau tien trong cau truc thu muc]")
    if not samples:
        print("  (rong)")
    else:
        for i, (typ, rel) in enumerate(samples, 1):
            print(f"  {i:02d}. [{typ}] {rel}")

    # 2) So file trong moi folder con cap 1
    print("\n[So luong file trong moi folder con cap 1 - de quy]")
    children = sorted(list(root.iterdir()), key=lambda p: p.name.lower())
    subdirs = [p for p in children if p.is_dir()]
    files_at_root = [p for p in children if p.is_file()]

    print(f"  Files o root: {len(files_at_root)}")
    if not subdirs:
        print("  (khong co folder con)")
    else:
        for d in subdirs:
            cnt = count_files_recursive(d)
            print(f"  - {d.name}: {cnt} files")

    # 3) Tong so file toan dataset
    total_files = count_files_recursive(root)
    print(f"\n[Tong so file trong dataset]: {total_files}")


for ds in DATASETS:
    print_dataset_report(ds)
~~~

## Ghi chu

- Neu du lieu qua lon, qua trinh dem file de quy co the mat nhieu thoi gian.
- Neu can tang toc, co the dem song song theo folder cap 1 bang multiprocessing.
