Creating new Ultralytics Settings v0.0.6 file ✅ 
View Ultralytics Settings with 'yolo settings' or at '/root/.config/Ultralytics/settings.json'
Update Settings with 'yolo settings key=value', i.e. 'yolo settings runs_dir=path/to/dir'. For help see https://docs.ultralytics.com/quickstart/#ultralytics-settings.
Downloading https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n.pt to 'yolov8n.pt': 100% ━━━━━━━━━━━━ 6.2MB 96.9MB/s 0.1s
Ultralytics 8.4.37 🚀 Python-3.12.12 torch-2.10.0+cu128 CUDA:0 (Tesla T4, 14913MiB)
engine/trainer: agnostic_nms=False, amp=True, angle=1.0, augment=False, auto_augment=randaugment, batch=16, bgr=0.0, box=7.5, cache=False, cfg=None, classes=None, close_mosaic=10, cls=0.5, cls_pw=0.0, compile=False, conf=None, copy_paste=0.0, copy_paste_mode=flip, cos_lr=False, cutmix=0.0, data=/kaggle/working/artifacts/yolo_merged/data.yaml, degrees=0.0, deterministic=True, device=None, dfl=1.5, dnn=False, dropout=0.0, dynamic=False, embed=None, end2end=None, epochs=80, erasing=0.4, exist_ok=False, fliplr=0.5, flipud=0.0, format=torchscript, fraction=1.0, freeze=None, half=False, hsv_h=0.015, hsv_s=0.7, hsv_v=0.4, imgsz=640, int8=False, iou=0.7, keras=False, kobj=1.0, line_width=None, lr0=0.01, lrf=0.01, mask_ratio=4, max_det=300, mixup=0.0, mode=train, model=yolov8n.pt, momentum=0.937, mosaic=1.0, multi_scale=0.0, name=yolov8n_weapons, nbs=64, nms=False, opset=None, optimize=False, optimizer=auto, overlap_mask=True, patience=100, perspective=0.0, plots=True, pose=12.0, pretrained=True, profile=False, project=/kaggle/working/artifacts/yolo_runs, rect=False, resume=False, retina_masks=False, rle=1.0, save=True, save_conf=False, save_crop=False, save_dir=/kaggle/working/artifacts/yolo_runs/yolov8n_weapons, save_frames=False, save_json=False, save_period=-1, save_txt=False, scale=0.5, seed=0, shear=0.0, show=False, show_boxes=True, show_conf=True, show_labels=True, simplify=True, single_cls=False, source=None, split=val, stream_buffer=False, task=detect, time=None, tracker=botsort.yaml, translate=0.1, val=True, verbose=True, vid_stride=1, visualize=False, warmup_bias_lr=0.1, warmup_epochs=3.0, warmup_momentum=0.8, weight_decay=0.0005, workers=8, workspace=None
Downloading https://ultralytics.com/assets/Arial.ttf to '/root/.config/Ultralytics/Arial.ttf': 100% ━━━━━━━━━━━━ 755.1KB 24.0MB/s 0.0s
Overriding model.yaml nc=80 with nc=2

                   from  n    params  module                                       arguments                     
  0                  -1  1       464  ultralytics.nn.modules.conv.Conv             [3, 16, 3, 2]                 
  1                  -1  1      4672  ultralytics.nn.modules.conv.Conv             [16, 32, 3, 2]                
  2                  -1  1      7360  ultralytics.nn.modules.block.C2f             [32, 32, 1, True]             
  3                  -1  1     18560  ultralytics.nn.modules.conv.Conv             [32, 64, 3, 2]                
  4                  -1  2     49664  ultralytics.nn.modules.block.C2f             [64, 64, 2, True]             
  5                  -1  1     73984  ultralytics.nn.modules.conv.Conv             [64, 128, 3, 2]               
  6                  -1  2    197632  ultralytics.nn.modules.block.C2f             [128, 128, 2, True]           
  7                  -1  1    295424  ultralytics.nn.modules.conv.Conv             [128, 256, 3, 2]              
  8                  -1  1    460288  ultralytics.nn.modules.block.C2f             [256, 256, 1, True]           
  9                  -1  1    164608  ultralytics.nn.modules.block.SPPF            [256, 256, 5]                 
 10                  -1  1         0  torch.nn.modules.upsampling.Upsample         [None, 2, 'nearest']          
 11             [-1, 6]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 12                  -1  1    148224  ultralytics.nn.modules.block.C2f             [384, 128, 1]                 
 13                  -1  1         0  torch.nn.modules.upsampling.Upsample         [None, 2, 'nearest']          
 14             [-1, 4]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 15                  -1  1     37248  ultralytics.nn.modules.block.C2f             [192, 64, 1]                  
 16                  -1  1     36992  ultralytics.nn.modules.conv.Conv             [64, 64, 3, 2]                
 17            [-1, 12]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 18                  -1  1    123648  ultralytics.nn.modules.block.C2f             [192, 128, 1]                 
 19                  -1  1    147712  ultralytics.nn.modules.conv.Conv             [128, 128, 3, 2]              
 20             [-1, 9]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 21                  -1  1    493056  ultralytics.nn.modules.block.C2f             [384, 256, 1]                 
 22        [15, 18, 21]  1    751702  ultralytics.nn.modules.head.Detect           [2, 16, None, [64, 128, 256]] 
Model summary: 130 layers, 3,011,238 parameters, 3,011,222 gradients, 8.2 GFLOPs

Transferred 319/355 items from pretrained weights
Freezing layer 'model.22.dfl.conv.weight'
AMP: running Automatic Mixed Precision (AMP) checks...
Downloading https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.pt to 'yolo26n.pt': 100% ━━━━━━━━━━━━ 5.3MB 123.3MB/s 0.0s
AMP: checks passed ✅
train: Fast image access ✅ (ping: 0.0±0.0 ms, read: 20.8±13.7 MB/s, size: 10.3 KB)
train: Scanning /kaggle/working/artifacts/yolo_merged/train/labels... 3557 images, 0 backgrounds, 0 corrupt: 67% ━━━━━━━━──── 3557/5291 1.4Kit/s 2.5s<1.3srequirements: Ultralytics requirement ['pi-heif'] not found, attempting AutoUpdate...
Using Python 3.12.12 environment at: /usr
Resolved 2 packages in 205ms
Prepared 1 package in 65ms
Installed 1 package in 4ms
 + pi-heif==1.3.0

requirements: AutoUpdate success ✅ 0.8s
WARNING ⚠️ requirements: Restart runtime or rerun command for updates to take effect

train: Scanning /kaggle/working/artifacts/yolo_merged/train/labels... 5290 images, 0 backgrounds, 1 corrupt: 100% ━━━━━━━━━━━━ 5291/5291 1.3Kit/s 3.9s0.0ss
train: /kaggle/working/artifacts/yolo_merged/train/images/surgical_tools_80ad6ead4cb1.jpg: 2 duplicate labels removed
train: /kaggle/working/artifacts/yolo_merged/train/images/surgical_tools_a0b8e07c2f4c.jpg: ignoring corrupt image/label: cannot identify image file '/kaggle/working/artifacts/yolo_merged/train/images/surgical_tools_a0b8e07c2f4c.jpg'
train: New cache created: /kaggle/working/artifacts/yolo_merged/train/labels.cache
albumentations: Blur(p=0.01, blur_limit=(3, 7)), MedianBlur(p=0.01, blur_limit=(3, 7)), ToGray(p=0.01, method='weighted_average', num_output_channels=3), CLAHE(p=0.01, clip_limit=(1.0, 4.0), tile_grid_size=(8, 8))
val: Fast image access ✅ (ping: 0.0±0.0 ms, read: 12.2±1.4 MB/s, size: 7.1 KB)
val: Scanning /kaggle/working/artifacts/yolo_merged/val/labels... 3074 images, 0 backgrounds, 0 corrupt: 100% ━━━━━━━━━━━━ 3074/3074 1.4Kit/s 2.2s0.1s
val: New cache created: /kaggle/working/artifacts/yolo_merged/val/labels.cache
optimizer: 'optimizer=auto' found, ignoring 'lr0=0.01' and 'momentum=0.937' and determining best 'optimizer', 'lr0' and 'momentum' automatically... 
optimizer: AdamW(lr=0.001667, momentum=0.9) with parameter groups 57 weight(decay=0.0), 64 weight(decay=0.0005), 63 bias(decay=0.0)
Plotting labels to /kaggle/working/artifacts/yolo_runs/yolov8n_weapons/labels.jpg... 
Image sizes 640 train, 640 val
Using 2 dataloader workers
Logging results to /kaggle/working/artifacts/yolo_runs/yolov8n_weapons
Starting training for 80 epochs...

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       1/80         2G      1.058      1.725      1.371         24        640: 100% ━━━━━━━━━━━━ 331/331 6.1it/s 54.4s<0.2s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.3it/s 18.2s0.2s
                   all       3074       3193      0.962      0.455      0.502      0.369

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       2/80      2.46G      1.109      1.301      1.399         20        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.7s0.2s
                   all       3074       3193      0.896      0.397      0.465      0.308

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       3/80      2.47G      1.109      1.168      1.389         27        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.7s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.7s0.2s
                   all       3074       3193       0.94      0.464      0.526      0.397

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       4/80      2.48G      1.049      1.059      1.343         14        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.8s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.528      0.606      0.553      0.429

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       5/80      2.48G      1.019      1.017      1.326         20        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.7s0.2s
                   all       3074       3193      0.328      0.285      0.277      0.124

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       6/80      2.48G     0.9843     0.9843      1.306         16        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.2s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.443      0.538      0.418        0.3

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       7/80      2.48G     0.9525     0.9305      1.287         25        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.1s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.7s0.2s
                   all       3074       3193      0.506      0.583      0.523      0.406

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       8/80      2.48G     0.9262     0.9083      1.273         18        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.589      0.601      0.552      0.443

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       9/80      2.48G     0.9131     0.8732      1.266         24        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.3s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.7s0.2s
                   all       3074       3193      0.408      0.391      0.373      0.258

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      10/80      2.48G     0.9061     0.8615       1.26         16        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.6s0.2s
                   all       3074       3193      0.627      0.593      0.559      0.464

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      11/80      2.48G     0.8836     0.8375      1.242         18        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.613      0.596      0.553      0.446

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      12/80      2.48G     0.8634     0.8073      1.223         23        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.7s0.2s
                   all       3074       3193      0.718      0.646       0.65      0.484

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      13/80      2.48G     0.8619     0.7919      1.223         16        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.8s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.648      0.651      0.596      0.476

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      14/80      2.48G     0.8413     0.7653      1.211         24        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.701      0.659      0.641      0.491

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      15/80      2.48G     0.8429     0.7728      1.217         25        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.6s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.664       0.66       0.63      0.488

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      16/80      2.48G     0.8359     0.7655      1.206         28        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.646       0.65      0.627      0.493

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      17/80      2.48G     0.8297     0.7538      1.203         30        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.7s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.3s0.2s
                   all       3074       3193      0.755      0.641      0.643        0.5

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      18/80      2.48G     0.8158     0.7226        1.2         18        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.3s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.6s0.2s
                   all       3074       3193        0.7      0.683      0.646      0.491

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      19/80      2.48G     0.8235     0.7386      1.202         31        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.3s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.694      0.671      0.658      0.515

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      20/80      2.48G     0.7919     0.7068       1.18         27        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.2s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.688      0.674      0.657      0.495

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      21/80      2.48G      0.795     0.7094       1.18         18        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.2s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.703      0.697      0.672      0.512

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      22/80      2.48G     0.7917     0.7028      1.185         27        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.733      0.621      0.626      0.501

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      23/80      2.48G     0.7918     0.6991      1.178         20        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.2s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193       0.72      0.673      0.674      0.506

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      24/80      2.48G     0.7904     0.6931       1.18         26        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.715      0.701      0.684       0.52

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      25/80      2.48G     0.7761     0.6799      1.172         25        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.726      0.707      0.685      0.526

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      26/80      2.48G     0.7718     0.6698      1.169         33        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.3s0.2s
                   all       3074       3193      0.766       0.71       0.71      0.539

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      27/80      2.48G     0.7645     0.6641      1.165         25        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.3s0.2s
                   all       3074       3193      0.757      0.683       0.69      0.531

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      28/80      2.48G     0.7739     0.6608      1.171         15        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193       0.77      0.679        0.7       0.53

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      29/80      2.48G     0.7559     0.6526      1.164         23        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.764      0.684      0.688      0.533

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      30/80      2.48G     0.7595     0.6662      1.157         21        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.767      0.708       0.71      0.539

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      31/80      2.48G     0.7552     0.6448      1.157         24        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 52.1s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.738      0.731      0.718      0.546

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      32/80      2.48G     0.7478      0.638      1.156         20        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.6s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.708      0.665      0.649      0.514

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      33/80      2.48G     0.7559     0.6379      1.157         25        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.709      0.723      0.685      0.529

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      34/80      2.48G     0.7382     0.6258      1.144         21        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.3s0.2s
                   all       3074       3193      0.731      0.701      0.682      0.529

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      35/80      2.48G     0.7276     0.6136      1.136         28        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.739       0.73      0.706      0.542

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      36/80      2.48G     0.7182     0.6175      1.139         18        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.6s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.785      0.725      0.717       0.55

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      37/80      2.48G     0.7341     0.6104      1.142         25        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.3s0.2s
                   all       3074       3193      0.796      0.713      0.723      0.555

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      38/80      2.48G     0.7249      0.603      1.134         24        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.7s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.3s0.2s
                   all       3074       3193      0.763      0.741      0.728       0.55

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      39/80      2.48G     0.7164      0.595      1.129         26        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 52.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.3s0.2s
                   all       3074       3193      0.773      0.727      0.733      0.556

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      40/80      2.48G     0.7242        0.6      1.136         18        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 52.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.3s0.2s
                   all       3074       3193      0.769      0.739      0.717      0.554

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      41/80      2.48G     0.7152     0.5955      1.139         22        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 52.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.6s0.2s
                   all       3074       3193      0.785      0.729      0.735      0.564

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      42/80      2.48G     0.7186     0.5981      1.135         22        640: 100% ━━━━━━━━━━━━ 331/331 6.3it/s 52.2s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.768      0.723      0.729       0.56

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      43/80      2.48G     0.7187     0.5914      1.131         24        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.805      0.741      0.732      0.561

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      44/80      2.48G      0.709      0.581      1.132         23        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.7s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.808      0.729      0.746      0.567

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      45/80      2.48G      0.709     0.5852       1.13         25        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 52.1s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.768      0.745      0.744      0.564

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      46/80      2.48G     0.6991     0.5766      1.122         24        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.3s0.2s
                   all       3074       3193       0.79      0.739      0.745       0.57

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      47/80      2.48G     0.6926     0.5677      1.117         16        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.7s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.3s0.2s
                   all       3074       3193      0.799      0.739      0.742      0.566

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      48/80      2.48G     0.7001     0.5687      1.123         22        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.2s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.801      0.741      0.751      0.572

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      49/80      2.48G     0.6897      0.556      1.111         18        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.8s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.3s0.2s
                   all       3074       3193       0.76      0.761      0.756      0.574

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      50/80      2.48G     0.6912     0.5534      1.113         19        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.6s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.811      0.739      0.749      0.572

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      51/80      2.48G     0.6826     0.5453      1.108         17        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.8s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.762      0.753      0.741      0.567

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      52/80      2.48G     0.6725      0.541      1.107         27        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.786      0.751      0.747      0.574

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      53/80      2.48G     0.6866     0.5473      1.114         19        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.6s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193       0.76      0.757      0.758      0.583

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      54/80      2.48G      0.686     0.5585      1.118         27        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.8s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.833      0.754      0.768      0.587

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      55/80      2.48G     0.6776     0.5437      1.105         20        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 52.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.792      0.762      0.756      0.578

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      56/80      2.48G     0.6632       0.53      1.096         22        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.802      0.765      0.772      0.587

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      57/80      2.48G     0.6619     0.5261      1.101         14        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.812      0.749      0.762      0.579

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      58/80      2.48G     0.6612      0.533      1.098         25        640: 100% ━━━━━━━━━━━━ 331/331 6.3it/s 52.9s<0.2s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.811      0.763       0.77      0.585

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      59/80      2.48G     0.6565     0.5278      1.098         26        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.1s0.2s
                   all       3074       3193      0.841      0.761      0.769      0.588

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      60/80      2.48G     0.6577       0.52      1.097         16        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.4s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.839      0.763      0.779       0.59

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      61/80      2.48G     0.6566     0.5107      1.093         23        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.7s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.3s0.2s
                   all       3074       3193      0.785      0.759      0.764      0.591

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      62/80      2.48G     0.6544     0.5187      1.093         23        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.5s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.817      0.737       0.77      0.595

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      63/80      2.48G     0.6348     0.4992      1.086         27        640: 100% ━━━━━━━━━━━━ 331/331 6.2it/s 53.3s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.847      0.761      0.781      0.596

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      64/80      2.48G      0.641     0.5099      1.093         20        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.7s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.3s0.2s
                   all       3074       3193      0.828      0.765      0.779        0.6

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      65/80      2.48G     0.6331     0.4967      1.083         24        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.1s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.813      0.792       0.79      0.601

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      66/80      2.48G     0.6338     0.4948      1.084         31        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.8s<0.2s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.824      0.789       0.79      0.604

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      67/80      2.48G     0.6259     0.4928       1.08         26        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.1it/s 19.0s0.2s
                   all       3074       3193      0.804      0.787      0.784      0.597

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      68/80      2.48G     0.6294      0.487      1.081         17        640: 100% ━━━━━━━━━━━━ 331/331 6.3it/s 52.1s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.838      0.755      0.783      0.597

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      69/80      2.48G     0.6328     0.5029      1.085         23        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193       0.88      0.753      0.789        0.6

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      70/80      2.48G     0.6256     0.4836      1.077         20        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 51.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.834      0.769      0.783      0.596
Closing dataloader mosaic
albumentations: Blur(p=0.01, blur_limit=(3, 7)), MedianBlur(p=0.01, blur_limit=(3, 7)), ToGray(p=0.01, method='weighted_average', num_output_channels=3), CLAHE(p=0.01, clip_limit=(1.0, 4.0), tile_grid_size=(8, 8))

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      71/80      2.48G     0.4848     0.3301      1.011         10        640: 100% ━━━━━━━━━━━━ 331/331 6.4it/s 52.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.8it/s 16.6s0.2s
                   all       3074       3193      0.836      0.763      0.777      0.598

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      72/80      2.48G     0.4758     0.3132      1.002         10        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.847      0.763      0.783      0.598

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      73/80      2.48G     0.4653     0.2988     0.9971         10        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.5s0.2s
                   all       3074       3193      0.829      0.781       0.78      0.601

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      74/80      2.48G      0.463        0.3      1.002         10        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.835      0.789      0.787      0.602

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      75/80      2.48G     0.4576     0.2933     0.9926         11        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.7s0.3ss
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193      0.838      0.785      0.785      0.603

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      76/80      2.48G     0.4528     0.2907     0.9918         10        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.1it/s 16.0s0.2s
                   all       3074       3193      0.876      0.763      0.787      0.606

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      77/80      2.48G     0.4529     0.2915      0.991         11        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.8s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.858      0.777      0.791      0.607

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      78/80      2.48G     0.4483      0.287     0.9873         10        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.853      0.781      0.793       0.61

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      79/80      2.48G     0.4483     0.2854     0.9863         10        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 51.0s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.9it/s 16.4s0.2s
                   all       3074       3193      0.842       0.79      0.793      0.609

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
      80/80      2.48G     0.4398     0.2831     0.9811         12        640: 100% ━━━━━━━━━━━━ 331/331 6.5it/s 50.9s<0.1s
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 6.0it/s 16.2s0.2s
                   all       3074       3193       0.85      0.775      0.788      0.608

80 epochs completed in 1.520 hours.
Optimizer stripped from /kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/last.pt, 6.2MB
Optimizer stripped from /kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/best.pt, 6.2MB

Validating /kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/best.pt...
Ultralytics 8.4.37 🚀 Python-3.12.12 torch-2.10.0+cu128 CUDA:0 (Tesla T4, 14913MiB)
Model summary (fused): 73 layers, 3,006,038 parameters, 0 gradients, 8.1 GFLOPs
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 97/97 5.3it/s 18.4s0.2s
                   all       3074       3193       0.84      0.792      0.793      0.609
          risky_object        211        251      0.682      0.586       0.59       0.28
          medical_tool       2863       2942      0.999      0.999      0.995      0.939
Speed: 0.2ms preprocess, 2.0ms inference, 0.0ms loss, 1.3ms postprocess per image
Results saved to /kaggle/working/artifacts/yolo_runs/yolov8n_weapons
💡 Learn more at https://docs.ultralytics.com/modes/train
Running: yolo detect train model=yolov8n.pt data=/kaggle/working/artifacts/yolo_merged/data.yaml imgsz=640 epochs=80 batch=16 project=/kaggle/working/artifacts/yolo_runs name=yolov8n_weapons