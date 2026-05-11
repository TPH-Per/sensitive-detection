2026-05-03 08:44:41,639 - INFO - Using device: cuda

=============================================
  Blood_Violence.v1 Dataset Distribution
=============================================
  negative_violent              :  4061  (29.1%)
  skip                          :  8540  (61.1%)
  positive_clean                :   709  (5.1%)
  negative_clean                :   663  (4.7%)
  total                         : 13973
=============================================

2026-05-03 08:46:07,271 - INFO - Scan complete. Positives (clean+contam): 709
2026-05-03 08:46:07,271 - INFO - Building dataset splits...
2026-05-03 08:46:15,499 - INFO -   train: total=10,079  pos=2,116  neg=7,963
2026-05-03 08:46:15,499 - INFO -   val  : total=653  pos=79  neg=574
2026-05-03 08:46:15,499 - INFO -   test : total=314  pos=62  neg=252
  [GoreDataset] total=10,079 (pos=2,116, neg=7,963)
  [GoreDataset] total=653 (pos=79, neg=574)
  [GoreDataset] total=314 (pos=62, neg=252)
2026-05-03 08:46:15,972 - INFO - pos_weight (auto): 3.76  (pos=2,116, neg=7,963)
2026-05-03 08:46:15,972 - INFO - reweight_mode=sampler | sampler=ON | bce_pos_weight=OFF
Epoch 1/25 [Train]: 100%|████████| 158/158 [00:56<00:00,  2.79it/s, loss=0.0430]
Epoch 1/25 [Val]: 100%|█████████████████████████| 11/11 [00:03<00:00,  3.50it/s]
2026-05-03 08:47:15,712 - INFO - Epoch   1 | Train Loss: 0.1407 Acc: 0.9458 Prec: 0.9273 Rec: 0.9047 F1: 0.9159 AUC: 0.9859 PR-AUC: 0.9733 | Val Loss: 0.0315 Acc: 0.9923 Prec: 0.9868 Rec: 0.9494 F1: 0.9677 AUC: 0.9977 PR-AUC: 0.9878
2026-05-03 08:47:15,778 - INFO -   ✅ Saved best model (AUC=0.9977) → /kaggle/working/trong_so/gore_detector_v6_best.pth
Epoch 2/25 [Train]: 100%|████████| 158/158 [00:53<00:00,  2.93it/s, loss=0.0352]
Epoch 2/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  4.87it/s]
2026-05-03 08:48:11,919 - INFO - Epoch   2 | Train Loss: 0.0584 Acc: 0.9800 Prec: 0.9724 Rec: 0.9665 F1: 0.9694 AUC: 0.9972 PR-AUC: 0.9952 | Val Loss: 0.0301 Acc: 0.9908 Prec: 1.0000 Rec: 0.9241 F1: 0.9605 AUC: 0.9997 PR-AUC: 0.9980
2026-05-03 08:48:12,015 - INFO -   ✅ Saved best model (AUC=0.9997) → /kaggle/working/trong_so/gore_detector_v6_best.pth
Epoch 3/25 [Train]: 100%|████████| 158/158 [00:52<00:00,  3.01it/s, loss=0.0967]
Epoch 3/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  4.65it/s]
2026-05-03 08:49:06,882 - INFO - Epoch   3 | Train Loss: 0.0499 Acc: 0.9824 Prec: 0.9727 Rec: 0.9736 F1: 0.9732 AUC: 0.9980 PR-AUC: 0.9961 | Val Loss: 0.0482 Acc: 0.9893 Prec: 1.0000 Rec: 0.9114 F1: 0.9536 AUC: 0.9994 PR-AUC: 0.9962
Epoch 4/25 [Train]: 100%|████████| 158/158 [00:52<00:00,  3.03it/s, loss=0.0008]
Epoch 4/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  5.04it/s]
2026-05-03 08:50:01,202 - INFO - Epoch   4 | Train Loss: 0.0260 Acc: 0.9920 Prec: 0.9898 Rec: 0.9859 F1: 0.9878 AUC: 0.9993 PR-AUC: 0.9986 | Val Loss: 0.0519 Acc: 0.9908 Prec: 1.0000 Rec: 0.9241 F1: 0.9605 AUC: 0.9996 PR-AUC: 0.9974
Epoch 5/25 [Train]: 100%|████████| 158/158 [00:52<00:00,  3.00it/s, loss=0.0055]
Epoch 5/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  4.92it/s]
2026-05-03 08:50:56,196 - INFO - Epoch   5 | Train Loss: 0.0221 Acc: 0.9931 Prec: 0.9899 Rec: 0.9887 F1: 0.9893 AUC: 0.9996 PR-AUC: 0.9992 | Val Loss: 0.0297 Acc: 0.9908 Prec: 0.9867 Rec: 0.9367 F1: 0.9610 AUC: 0.9994 PR-AUC: 0.9959
Epoch 6/25 [Train]: 100%|████████| 158/158 [00:51<00:00,  3.06it/s, loss=0.0301]
Epoch 6/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  4.90it/s]
2026-05-03 08:51:50,064 - INFO - Epoch   6 | Train Loss: 0.0187 Acc: 0.9941 Prec: 0.9904 Rec: 0.9918 F1: 0.9911 AUC: 0.9997 PR-AUC: 0.9994 | Val Loss: 0.0842 Acc: 0.9832 Prec: 1.0000 Rec: 0.8608 F1: 0.9252 AUC: 0.9990 PR-AUC: 0.9938
Epoch 7/25 [Train]: 100%|████████| 158/158 [00:51<00:00,  3.09it/s, loss=0.0019]
Epoch 7/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  4.84it/s]
2026-05-03 08:52:43,516 - INFO - Epoch   7 | Train Loss: 0.0144 Acc: 0.9946 Prec: 0.9923 Rec: 0.9911 F1: 0.9917 AUC: 0.9998 PR-AUC: 0.9996 | Val Loss: 0.0434 Acc: 0.9893 Prec: 1.0000 Rec: 0.9114 F1: 0.9536 AUC: 0.9997 PR-AUC: 0.9979
Epoch 8/25 [Train]: 100%|████████| 158/158 [00:51<00:00,  3.04it/s, loss=0.0002]
Epoch 8/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  4.85it/s]
2026-05-03 08:53:37,781 - INFO - Epoch   8 | Train Loss: 0.0139 Acc: 0.9952 Prec: 0.9919 Rec: 0.9937 F1: 0.9928 AUC: 0.9999 PR-AUC: 0.9997 | Val Loss: 0.0650 Acc: 0.9893 Prec: 1.0000 Rec: 0.9114 F1: 0.9536 AUC: 0.9985 PR-AUC: 0.9930
Epoch 9/25 [Train]: 100%|████████| 158/158 [00:52<00:00,  3.01it/s, loss=0.0045]
Epoch 9/25 [Val]: 100%|█████████████████████████| 11/11 [00:02<00:00,  4.90it/s]
2026-05-03 08:54:32,462 - INFO - Epoch   9 | Train Loss: 0.0133 Acc: 0.9957 Prec: 0.9925 Rec: 0.9946 F1: 0.9935 AUC: 0.9999 PR-AUC: 0.9997 | Val Loss: 0.1091 Acc: 0.9816 Prec: 1.0000 Rec: 0.8481 F1: 0.9178 AUC: 0.9993 PR-AUC: 0.9959
Epoch 10/25 [Train]: 100%|███████| 158/158 [00:51<00:00,  3.09it/s, loss=0.0042]
Epoch 10/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  5.00it/s]
2026-05-03 08:55:25,762 - INFO - Epoch  10 | Train Loss: 0.0100 Acc: 0.9972 Prec: 0.9961 Rec: 0.9955 F1: 0.9958 AUC: 0.9999 PR-AUC: 0.9999 | Val Loss: 0.0464 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9995 PR-AUC: 0.9972
Epoch 11/25 [Train]: 100%|███████| 158/158 [00:51<00:00,  3.06it/s, loss=0.0001]
Epoch 11/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.95it/s]
2026-05-03 08:56:19,633 - INFO - Epoch  11 | Train Loss: 0.0113 Acc: 0.9962 Prec: 0.9942 Rec: 0.9942 F1: 0.9942 AUC: 0.9999 PR-AUC: 0.9998 | Val Loss: 0.0549 Acc: 0.9908 Prec: 1.0000 Rec: 0.9241 F1: 0.9605 AUC: 0.9997 PR-AUC: 0.9983
2026-05-03 08:56:19,731 - INFO -   ✅ Saved best model (AUC=0.9997) → /kaggle/working/trong_so/gore_detector_v6_best.pth
Epoch 12/25 [Train]: 100%|███████| 158/158 [00:54<00:00,  2.90it/s, loss=0.0001]
Epoch 12/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.68it/s]
2026-05-03 08:57:16,503 - INFO - Epoch  12 | Train Loss: 0.0086 Acc: 0.9975 Prec: 0.9956 Rec: 0.9970 F1: 0.9963 AUC: 0.9999 PR-AUC: 0.9999 | Val Loss: 0.0579 Acc: 0.9877 Prec: 1.0000 Rec: 0.8987 F1: 0.9467 AUC: 0.9999 PR-AUC: 0.9991
2026-05-03 08:57:16,608 - INFO -   ✅ Saved best model (AUC=0.9999) → /kaggle/working/trong_so/gore_detector_v6_best.pth
Epoch 13/25 [Train]: 100%|███████| 158/158 [00:52<00:00,  2.99it/s, loss=0.0000]
Epoch 13/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.94it/s]
2026-05-03 08:58:11,667 - INFO - Epoch  13 | Train Loss: 0.0053 Acc: 0.9981 Prec: 0.9971 Rec: 0.9974 F1: 0.9972 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0524 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9997 PR-AUC: 0.9982
Epoch 14/25 [Train]: 100%|███████| 158/158 [00:53<00:00,  2.98it/s, loss=0.0003]
Epoch 14/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.81it/s]
2026-05-03 08:59:06,998 - INFO - Epoch  14 | Train Loss: 0.0055 Acc: 0.9987 Prec: 0.9985 Rec: 0.9975 F1: 0.9980 AUC: 1.0000 PR-AUC: 0.9999 | Val Loss: 0.0610 Acc: 0.9893 Prec: 1.0000 Rec: 0.9114 F1: 0.9536 AUC: 0.9994 PR-AUC: 0.9965
Epoch 15/25 [Train]: 100%|███████| 158/158 [00:52<00:00,  2.99it/s, loss=0.0001]
Epoch 15/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.79it/s]
2026-05-03 09:00:02,151 - INFO - Epoch  15 | Train Loss: 0.0037 Acc: 0.9988 Prec: 0.9976 Rec: 0.9988 F1: 0.9982 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0564 Acc: 0.9908 Prec: 1.0000 Rec: 0.9241 F1: 0.9605 AUC: 0.9996 PR-AUC: 0.9979
Epoch 16/25 [Train]: 100%|███████| 158/158 [00:54<00:00,  2.90it/s, loss=0.0001]
Epoch 16/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.64it/s]
2026-05-03 09:00:59,102 - INFO - Epoch  16 | Train Loss: 0.0055 Acc: 0.9987 Prec: 0.9982 Rec: 0.9979 F1: 0.9980 AUC: 1.0000 PR-AUC: 0.9999 | Val Loss: 0.0826 Acc: 0.9847 Prec: 1.0000 Rec: 0.8734 F1: 0.9324 AUC: 0.9995 PR-AUC: 0.9972
Epoch 17/25 [Train]: 100%|███████| 158/158 [00:52<00:00,  3.00it/s, loss=0.0000]
Epoch 17/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.87it/s]
2026-05-03 09:01:53,992 - INFO - Epoch  17 | Train Loss: 0.0045 Acc: 0.9983 Prec: 0.9970 Rec: 0.9979 F1: 0.9975 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0625 Acc: 0.9893 Prec: 1.0000 Rec: 0.9114 F1: 0.9536 AUC: 0.9994 PR-AUC: 0.9966
Epoch 18/25 [Train]: 100%|███████| 158/158 [00:51<00:00,  3.09it/s, loss=0.0045]
Epoch 18/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.77it/s]
2026-05-03 09:02:47,396 - INFO - Epoch  18 | Train Loss: 0.0023 Acc: 0.9992 Prec: 0.9985 Rec: 0.9991 F1: 0.9988 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0608 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9993 PR-AUC: 0.9964
Epoch 19/25 [Train]: 100%|███████| 158/158 [00:52<00:00,  3.03it/s, loss=0.0000]
Epoch 19/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.87it/s]
2026-05-03 09:03:41,784 - INFO - Epoch  19 | Train Loss: 0.0023 Acc: 0.9993 Prec: 0.9988 Rec: 0.9991 F1: 0.9989 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0579 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9993 PR-AUC: 0.9962
Epoch 20/25 [Train]: 100%|███████| 158/158 [00:51<00:00,  3.05it/s, loss=0.0002]
Epoch 20/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.77it/s]
2026-05-03 09:04:35,906 - INFO - Epoch  20 | Train Loss: 0.0018 Acc: 0.9995 Prec: 0.9991 Rec: 0.9994 F1: 0.9992 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0800 Acc: 0.9893 Prec: 1.0000 Rec: 0.9114 F1: 0.9536 AUC: 0.9991 PR-AUC: 0.9956
Epoch 21/25 [Train]: 100%|███████| 158/158 [00:52<00:00,  2.98it/s, loss=0.0000]
Epoch 21/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.86it/s]
2026-05-03 09:05:31,159 - INFO - Epoch  21 | Train Loss: 0.0017 Acc: 0.9992 Prec: 0.9985 Rec: 0.9991 F1: 0.9988 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0649 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9991 PR-AUC: 0.9955
Epoch 22/25 [Train]: 100%|███████| 158/158 [00:51<00:00,  3.08it/s, loss=0.0003]
Epoch 22/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.84it/s]
2026-05-03 09:06:24,826 - INFO - Epoch  22 | Train Loss: 0.0018 Acc: 0.9994 Prec: 0.9985 Rec: 0.9997 F1: 0.9991 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0575 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9993 PR-AUC: 0.9964
Epoch 23/25 [Train]: 100%|███████| 158/158 [00:51<00:00,  3.08it/s, loss=0.0000]
Epoch 23/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.92it/s]
2026-05-03 09:07:18,380 - INFO - Epoch  23 | Train Loss: 0.0008 Acc: 0.9998 Prec: 0.9997 Rec: 0.9997 F1: 0.9997 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0704 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9993 PR-AUC: 0.9964
Epoch 24/25 [Train]: 100%|███████| 158/158 [00:50<00:00,  3.14it/s, loss=0.0000]
Epoch 24/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.85it/s]
2026-05-03 09:08:11,046 - INFO - Epoch  24 | Train Loss: 0.0022 Acc: 0.9996 Prec: 1.0000 Rec: 0.9988 F1: 0.9994 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0685 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9994 PR-AUC: 0.9965
Epoch 25/25 [Train]: 100%|███████| 158/158 [00:49<00:00,  3.17it/s, loss=0.0978]
Epoch 25/25 [Val]: 100%|████████████████████████| 11/11 [00:02<00:00,  4.88it/s]
2026-05-03 09:09:03,204 - INFO - Epoch  25 | Train Loss: 0.0028 Acc: 0.9990 Prec: 0.9976 Rec: 0.9994 F1: 0.9985 AUC: 1.0000 PR-AUC: 1.0000 | Val Loss: 0.0589 Acc: 0.9923 Prec: 1.0000 Rec: 0.9367 F1: 0.9673 AUC: 0.9993 PR-AUC: 0.9964
2026-05-03 09:09:03,204 - INFO - 
Loading best checkpoint for Gate 1 evaluation...

=============================================
  GATE 1 — GoreDetector Test Evaluation
=============================================
  Test AUC:    0.9996   (threshold >= 0.88)
  Test Recall: 0.9355  (threshold >= 0.80)
  ✅ GATE 1 PASS — GoreDetector is ready as V_pool teacher
=============================================
2026-05-03 09:09:05,942 - INFO - 
FINAL RESULTS: best_val_AUC=0.9999 | test_AUC=0.9996 | test_Recall=0.9355