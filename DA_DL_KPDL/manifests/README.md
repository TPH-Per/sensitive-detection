Manifest format for feature-based training.

Required columns:
- feature_path: path to .npy feature file (absolute or relative to data_root)
- violence: 0/1
- self_harm: 0/1
- nsfw: 0/1

Recommended optional columns:
- sample_id
- split
- source

Example row:
sample_0001,features/sample_0001.npy,1,0,0,train,ucf101

Tensor .npy convention

- Recommended shape: [T, 768]
- T is number of sampled frames (target T=64)
- 768 is CLIP ViT-B/32 CLS dimension
- Dtype: float32

Accepted variants in loader

- [768] -> auto-convert to [1, 768], then pad to [64, 768]
- [T, 768] -> truncate/pad to [64, 768]
- [T, ...] -> flattened from axis 1 onward to [T, D]
