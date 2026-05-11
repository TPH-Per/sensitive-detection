2026-05-03 06:24:59,778 INFO Building dataset splits...
2026-05-03 06:26:46,291 INFO 
Dataset: 1014 pos / 3365 neg
  [SelfHarmDataset] total=4,379 (pos=1,014, neg=3,365) | pos_weight≈3.32
  [SelfHarmDataset] total=178 (pos=58, neg=120) | pos_weight≈2.07
2026-05-03 06:26:46,757 INFO Trainable params: 32,897
2026-05-03 06:26:46,757 INFO 
============================================================
2026-05-03 06:26:46,757 INFO   TRAINING SELFHARM DETECTOR V6.1
2026-05-03 06:26:46,757 INFO ============================================================
2026-05-03 06:27:38,190 INFO Epoch  1/20 | train_loss=0.6901 train_acc=0.7573 train_prec=0.6775 train_rec=0.9519 train_F1=0.7916 train_AUC=0.9075 train_PR_AUC=0.9092 | val_loss=0.2900 val_acc=0.8652 val_prec=0.7073 val_rec=1.0000 val_F1=0.8286 val_AUC=0.9924 val_PR_AUC=0.9865
2026-05-03 06:27:38,190 INFO   ✅ GATE 1 PASS: AUC=0.9924, Recall=1.0000
2026-05-03 06:27:38,255 INFO   💾 Saved best → /kaggle/working/trong_so/selfharm_detector_v6_best.pth
2026-05-03 06:28:20,947 INFO Epoch  2/20 | train_loss=0.3685 train_acc=0.9002 train_prec=0.8612 train_rec=0.9583 train_F1=0.9072 train_AUC=0.9750 train_PR_AUC=0.9772 | val_loss=0.2532 val_acc=0.8708 val_prec=0.7160 val_rec=1.0000 val_F1=0.8345 val_AUC=0.9987 val_PR_AUC=0.9975
2026-05-03 06:28:20,947 INFO   ✅ GATE 1 PASS: AUC=0.9987, Recall=1.0000
2026-05-03 06:28:21,076 INFO   💾 Saved best → /kaggle/working/trong_so/selfharm_detector_v6_best.pth
2026-05-03 06:29:00,506 INFO Epoch  3/20 | train_loss=0.3259 train_acc=0.9157 train_prec=0.8780 train_rec=0.9607 train_F1=0.9175 train_AUC=0.9795 train_PR_AUC=0.9786 | val_loss=0.0994 val_acc=0.9775 val_prec=0.9821 val_rec=0.9483 val_F1=0.9649 val_AUC=0.9993 val_PR_AUC=0.9985
2026-05-03 06:29:00,507 INFO   ✅ GATE 1 PASS: AUC=0.9993, Recall=0.9483
2026-05-03 06:29:00,618 INFO   💾 Saved best → /kaggle/working/trong_so/selfharm_detector_v6_best.pth
2026-05-03 06:29:37,510 INFO Epoch  4/20 | train_loss=0.3004 train_acc=0.9224 train_prec=0.8911 train_rec=0.9643 train_F1=0.9262 train_AUC=0.9830 train_PR_AUC=0.9847 | val_loss=0.1468 val_acc=0.9551 val_prec=0.8788 val_rec=1.0000 val_F1=0.9355 val_AUC=0.9986 val_PR_AUC=0.9970
2026-05-03 06:29:37,510 INFO   ✅ GATE 1 PASS: AUC=0.9986, Recall=1.0000
2026-05-03 06:30:16,752 INFO Epoch  5/20 | train_loss=0.2930 train_acc=0.9290 train_prec=0.9043 train_rec=0.9593 train_F1=0.9310 train_AUC=0.9839 train_PR_AUC=0.9844 | val_loss=0.1287 val_acc=0.9663 val_prec=0.9194 val_rec=0.9828 val_F1=0.9500 val_AUC=0.9981 val_PR_AUC=0.9963
2026-05-03 06:30:16,753 INFO   ✅ GATE 1 PASS: AUC=0.9981, Recall=0.9828
2026-05-03 06:30:54,523 INFO Epoch  6/20 | train_loss=0.2732 train_acc=0.9315 train_prec=0.9004 train_rec=0.9709 train_F1=0.9343 train_AUC=0.9857 train_PR_AUC=0.9864 | val_loss=0.1481 val_acc=0.9438 val_prec=0.8636 val_rec=0.9828 val_F1=0.9194 val_AUC=0.9961 val_PR_AUC=0.9928
2026-05-03 06:30:54,524 INFO   ✅ GATE 1 PASS: AUC=0.9961, Recall=0.9828
2026-05-03 06:31:32,257 INFO Epoch  7/20 | train_loss=0.2846 train_acc=0.9301 train_prec=0.9046 train_rec=0.9616 train_F1=0.9322 train_AUC=0.9849 train_PR_AUC=0.9858 | val_loss=0.1447 val_acc=0.9551 val_prec=0.8906 val_rec=0.9828 val_F1=0.9344 val_AUC=0.9968 val_PR_AUC=0.9942
2026-05-03 06:31:32,258 INFO   ✅ GATE 1 PASS: AUC=0.9968, Recall=0.9828
2026-05-03 06:32:12,048 INFO Epoch  8/20 | train_loss=0.2425 train_acc=0.9411 train_prec=0.9173 train_rec=0.9699 train_F1=0.9429 train_AUC=0.9887 train_PR_AUC=0.9890 | val_loss=0.1544 val_acc=0.9494 val_prec=0.8769 val_rec=0.9828 val_F1=0.9268 val_AUC=0.9963 val_PR_AUC=0.9933
2026-05-03 06:32:12,048 INFO   ✅ GATE 1 PASS: AUC=0.9963, Recall=0.9828
2026-05-03 06:32:53,321 INFO Epoch  9/20 | train_loss=0.2204 train_acc=0.9445 train_prec=0.9176 train_rec=0.9738 train_F1=0.9449 train_AUC=0.9904 train_PR_AUC=0.9899 | val_loss=0.0912 val_acc=0.9775 val_prec=0.9500 val_rec=0.9828 val_F1=0.9661 val_AUC=0.9980 val_PR_AUC=0.9960
2026-05-03 06:32:53,322 INFO   ✅ GATE 1 PASS: AUC=0.9980, Recall=0.9828
2026-05-03 06:33:31,796 INFO Epoch 10/20 | train_loss=0.2429 train_acc=0.9420 train_prec=0.9166 train_rec=0.9743 train_F1=0.9446 train_AUC=0.9881 train_PR_AUC=0.9881 | val_loss=0.1012 val_acc=0.9663 val_prec=0.9333 val_rec=0.9655 val_F1=0.9492 val_AUC=0.9970 val_PR_AUC=0.9944
2026-05-03 06:33:31,796 INFO   ✅ GATE 1 PASS: AUC=0.9970, Recall=0.9655
2026-05-03 06:34:08,406 INFO Epoch 11/20 | train_loss=0.2304 train_acc=0.9370 train_prec=0.9063 train_rec=0.9743 train_F1=0.9391 train_AUC=0.9899 train_PR_AUC=0.9904 | val_loss=0.1189 val_acc=0.9551 val_prec=0.8906 val_rec=0.9828 val_F1=0.9344 val_AUC=0.9971 val_PR_AUC=0.9945
2026-05-03 06:34:08,407 INFO   ✅ GATE 1 PASS: AUC=0.9971, Recall=0.9828
2026-05-03 06:34:46,316 INFO Epoch 12/20 | train_loss=0.2293 train_acc=0.9488 train_prec=0.9263 train_rec=0.9759 train_F1=0.9505 train_AUC=0.9900 train_PR_AUC=0.9909 | val_loss=0.1591 val_acc=0.9382 val_prec=0.8507 val_rec=0.9828 val_F1=0.9120 val_AUC=0.9960 val_PR_AUC=0.9926
2026-05-03 06:34:46,317 INFO   ✅ GATE 1 PASS: AUC=0.9960, Recall=0.9828
2026-05-03 06:35:27,415 INFO Epoch 13/20 | train_loss=0.2286 train_acc=0.9425 train_prec=0.9195 train_rec=0.9711 train_F1=0.9446 train_AUC=0.9904 train_PR_AUC=0.9916 | val_loss=0.1269 val_acc=0.9494 val_prec=0.8769 val_rec=0.9828 val_F1=0.9268 val_AUC=0.9978 val_PR_AUC=0.9958
2026-05-03 06:35:27,415 INFO   ✅ GATE 1 PASS: AUC=0.9978, Recall=0.9828
2026-05-03 06:36:02,693 INFO Epoch 14/20 | train_loss=0.2351 train_acc=0.9411 train_prec=0.9177 train_rec=0.9701 train_F1=0.9431 train_AUC=0.9894 train_PR_AUC=0.9898 | val_loss=0.1135 val_acc=0.9551 val_prec=0.9032 val_rec=0.9655 val_F1=0.9333 val_AUC=0.9961 val_PR_AUC=0.9929
2026-05-03 06:36:02,694 INFO   ✅ GATE 1 PASS: AUC=0.9961, Recall=0.9655
2026-05-03 06:36:38,193 INFO Epoch 15/20 | train_loss=0.1974 train_acc=0.9557 train_prec=0.9346 train_rec=0.9793 train_F1=0.9564 train_AUC=0.9922 train_PR_AUC=0.9921 | val_loss=0.1163 val_acc=0.9494 val_prec=0.8889 val_rec=0.9655 val_F1=0.9256 val_AUC=0.9960 val_PR_AUC=0.9926
2026-05-03 06:36:38,194 INFO   ✅ GATE 1 PASS: AUC=0.9960, Recall=0.9655
2026-05-03 06:37:13,149 INFO Epoch 16/20 | train_loss=0.2049 train_acc=0.9475 train_prec=0.9245 train_rec=0.9744 train_F1=0.9488 train_AUC=0.9920 train_PR_AUC=0.9920 | val_loss=0.1213 val_acc=0.9551 val_prec=0.8906 val_rec=0.9828 val_F1=0.9344 val_AUC=0.9978 val_PR_AUC=0.9958
2026-05-03 06:37:13,150 INFO   ✅ GATE 1 PASS: AUC=0.9978, Recall=0.9828
2026-05-03 06:37:50,024 INFO Epoch 17/20 | train_loss=0.1886 train_acc=0.9518 train_prec=0.9312 train_rec=0.9758 train_F1=0.9530 train_AUC=0.9932 train_PR_AUC=0.9934 | val_loss=0.1453 val_acc=0.9382 val_prec=0.8507 val_rec=0.9828 val_F1=0.9120 val_AUC=0.9967 val_PR_AUC=0.9939
2026-05-03 06:37:50,025 INFO   ✅ GATE 1 PASS: AUC=0.9967, Recall=0.9828
2026-05-03 06:38:25,945 INFO Epoch 18/20 | train_loss=0.1843 train_acc=0.9504 train_prec=0.9269 train_rec=0.9814 train_F1=0.9534 train_AUC=0.9933 train_PR_AUC=0.9934 | val_loss=0.1240 val_acc=0.9494 val_prec=0.8769 val_rec=0.9828 val_F1=0.9268 val_AUC=0.9973 val_PR_AUC=0.9949
2026-05-03 06:38:25,946 INFO   ✅ GATE 1 PASS: AUC=0.9973, Recall=0.9828
2026-05-03 06:39:01,631 INFO Epoch 19/20 | train_loss=0.1797 train_acc=0.9573 train_prec=0.9379 train_rec=0.9806 train_F1=0.9588 train_AUC=0.9940 train_PR_AUC=0.9944 | val_loss=0.1314 val_acc=0.9438 val_prec=0.8636 val_rec=0.9828 val_F1=0.9194 val_AUC=0.9971 val_PR_AUC=0.9946
2026-05-03 06:39:01,632 INFO   ✅ GATE 1 PASS: AUC=0.9971, Recall=0.9828
2026-05-03 06:39:36,338 INFO Epoch 20/20 | train_loss=0.2018 train_acc=0.9418 train_prec=0.9046 train_rec=0.9830 train_F1=0.9421 train_AUC=0.9924 train_PR_AUC=0.9920 | val_loss=0.1369 val_acc=0.9326 val_prec=0.8382 val_rec=0.9828 val_F1=0.9048 val_AUC=0.9974 val_PR_AUC=0.9951
2026-05-03 06:39:36,339 INFO   ✅ GATE 1 PASS: AUC=0.9974, Recall=0.9828
2026-05-03 06:39:36,339 INFO 
============================================================
2026-05-03 06:39:36,339 INFO   DONE — Best AUC=0.9993, Recall=0.9483
2026-05-03 06:39:36,339 INFO   ✅ GATE 1 PASS — SelfHarmDetector sẵn sàng làm Teacher cho S_Gate!
2026-05-03 06:39:36,339 INFO ============================================================