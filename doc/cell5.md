{
  "by_source": {
    "adult_content_binary": {
      "count": 18687,
      "train": 6252,
      "val": 6220,
      "test": 5915,
      "challenge": 300,
      "media_type": [
        "image"
      ]
    },
    "nsfw_dataset_v1": {
      "count": 12000,
      "train": 8399,
      "val": 1801,
      "test": 1800,
      "challenge": 0,
      "media_type": [
        "image"
      ]
    },
    "rwf2000": {
      "count": 2003,
      "train": 1345,
      "val": 257,
      "test": 401,
      "challenge": 0,
      "media_type": [
        "video"
      ]
    },
    "self_harm_detection": {
      "count": 706,
      "train": 619,
      "val": 58,
      "test": 29,
      "challenge": 0,
      "media_type": [
        "image"
      ]
    },
    "suicide_detection": {
      "count": 396,
      "train": 276,
      "val": 60,
      "test": 60,
      "challenge": 0,
      "media_type": [
        "image"
      ]
    },
    "surgical_tools_negative": {
      "count": 8817,
      "train": 6000,
      "val": 1881,
      "test": 636,
      "challenge": 300,
      "media_type": [
        "image"
      ]
    },
    "ucf101": {
      "count": 9784,
      "train": 5100,
      "val": 900,
      "test": 3784,
      "challenge": 0,
      "media_type": [
        "video"
      ]
    },
    "ucf_crimes": {
      "count": 1953,
      "train": 1412,
      "val": 250,
      "test": 291,
      "challenge": 0,
      "media_type": [
        "video"
      ]
    },
    "wound_medical_negative": {
      "count": 2940,
      "train": 2094,
      "val": 410,
      "test": 436,
      "challenge": 0,
      "media_type": [
        "image"
      ]
    }
  },
  "by_branch": {
    "proxy": {
      "count": 13740,
      "train": 7857,
      "val": 1407,
      "test": 4476,
      "challenge": 0
    },
    "temporal": {
      "count": 13740,
      "train": 7857,
      "val": 1407,
      "test": 4476,
      "challenge": 0
    },
    "spatial": {
      "count": 43546,
      "train": 23640,
      "val": 10430,
      "test": 8876,
      "challenge": 600
    },
    "multitask": {
      "count": 57286,
      "train": 31497,
      "val": 11837,
      "test": 13352,
      "challenge": 600
    }
  },
  "challenge_holdout": {
    "normal_hard": {
      "count": 12644,
      "challenge": 300,
      "train": 8562,
      "val": 2373,
      "test": 1409
    },
    "positive_hard": {
      "count": 11236,
      "challenge": 300,
      "train": 4635,
      "val": 3310,
      "test": 2991
    }
  },
  "warnings": [],
  "unmatched_roots": [
    "/kaggle/input/datasets"
  ],
  "master_csv": "/kaggle/working/artifacts/data_prep/metadata/classification_master.csv",
  "label_exports": {
    "temporal_train": "/kaggle/working/artifacts/data_prep/labels/labels_temporal_train.csv",
    "temporal_val": "/kaggle/working/artifacts/data_prep/labels/labels_temporal_val.csv",
    "temporal_test": "/kaggle/working/artifacts/data_prep/labels/labels_temporal_test.csv",
    "temporal_challenge": "/kaggle/working/artifacts/data_prep/labels/labels_temporal_challenge.csv",
    "multitask_train": "/kaggle/working/artifacts/data_prep/labels/labels_multitask_train.csv",
    "multitask_val": "/kaggle/working/artifacts/data_prep/labels/labels_multitask_val.csv",
    "multitask_test": "/kaggle/working/artifacts/data_prep/labels/labels_multitask_test.csv",
    "multitask_challenge": "/kaggle/working/artifacts/data_prep/labels/labels_multitask_challenge.csv",
    "spatial_train": "/kaggle/working/artifacts/data_prep/labels/labels_spatial_train.csv",
    "spatial_val": "/kaggle/working/artifacts/data_prep/labels/labels_spatial_val.csv",
    "spatial_test": "/kaggle/working/artifacts/data_prep/labels/labels_spatial_test.csv",
    "spatial_challenge": "/kaggle/working/artifacts/data_prep/labels/labels_spatial_challenge.csv",
    "nsfw_train": "/kaggle/working/artifacts/data_prep/labels/labels_nsfw_train.csv",
    "nsfw_val": "/kaggle/working/artifacts/data_prep/labels/labels_nsfw_val.csv",
    "nsfw_test": "/kaggle/working/artifacts/data_prep/labels/labels_nsfw_test.csv",
    "nsfw_challenge": "/kaggle/working/artifacts/data_prep/labels/labels_nsfw_challenge.csv",
    "proxy_train": "/kaggle/working/artifacts/data_prep/labels/proxy_video_train.csv",
    "proxy_val": "/kaggle/working/artifacts/data_prep/labels/proxy_video_val.csv",
    "proxy_test": "/kaggle/working/artifacts/data_prep/labels/proxy_video_test.csv",
    "proxy_challenge": "/kaggle/working/artifacts/data_prep/labels/proxy_video_challenge.csv"
  },
  "runtime_configs": {
    "proxy_efficientnet_kaggle.yaml": "/kaggle/working/artifacts/runtime_configs/proxy_efficientnet_kaggle.yaml",
    "nsfw_scorer_kaggle.yaml": "/kaggle/working/artifacts/runtime_configs/nsfw_scorer_kaggle.yaml",
    "ssl_spatial_kaggle.yaml": "/kaggle/working/artifacts/runtime_configs/ssl_spatial_kaggle.yaml",
    "temporal_ssl_pretext_kaggle.yaml": "/kaggle/working/artifacts/runtime_configs/temporal_ssl_pretext_kaggle.yaml",
    "ssl_temporal_kaggle.yaml": "/kaggle/working/artifacts/runtime_configs/ssl_temporal_kaggle.yaml",
    "finetune_multitask_kaggle.yaml": "/kaggle/working/artifacts/runtime_configs/finetune_multitask_kaggle.yaml",
    "yolov8_nano_kaggle.yaml": "/kaggle/working/artifacts/runtime_configs/yolov8_nano_kaggle.yaml"
  }
}