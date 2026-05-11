YOLO dataset format:
- images/train/*.jpg
- images/val/*.jpg
- labels/train/*.txt
- labels/val/*.txt

Each .txt label line:
<class_id> <x_center> <y_center> <width> <height>
All values normalized to [0, 1].
