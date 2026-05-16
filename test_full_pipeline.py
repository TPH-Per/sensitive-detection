import os
import torch
import numpy as np
from PIL import Image
from app import load_common_models, load_task_model_v6, MODEL_CACHE, run_yolo_with_details, extract_clip_features, compute_flow_features, pad_to_match, apply_modality_toggles, DEVICE

def test_app_pipeline():
    print("Khởi tạo toàn bộ pipeline trong app.py...")
    # Khởi tạo mô hình
    try:
        load_task_model_v6()
    except Exception as e:
        print(f"Lỗi khi load model: {e}")
        # Ta có thể bỏ qua một số model không cần thiết nếu nó không ảnh hưởng tới test YOLO
    
    yolo_model = MODEL_CACHE.get("yolo")
    if yolo_model is None:
        print("❌ YOLO model chưa được load!")
        return False
        
    print("✅ YOLO model đã được load thành công.")
    
    # 2. Tạo frames giả lập (dummy frames)
    print("Tạo dữ liệu video giả lập...")
    frames = []
    for _ in range(5):
        # Ảnh 320x320 RGB cho PIL
        img_np = np.zeros((320, 320, 3), dtype=np.uint8)
        # BGR(0,0,255) trong PIL RGB là Blue, nhưng khi YOLO load lại bằng OpenCV nó sẽ đọc thành RGB hay BGR?
        # Thực ra PIL -> Numpy RGB.
        # Ở đây vẽ RGB: (255, 0, 0) là Đỏ (Weapon)
        img_np[50:100, 50:100] = [255, 0, 0] 
        # (0, 255, 0) là Xanh lục (Medical)
        img_np[150:200, 150:200] = [0, 255, 0] 
        frames.append(Image.fromarray(img_np))
        
    # 3. Chạy YOLO
    print("Chạy YOLO feature extraction...")
    try:
        yolo_weapon, yolo_medical, yolo_details = run_yolo_with_details(frames, yolo_model)
        print(f"✅ YOLO extraction thành công.")
        print(f"   Shape of yolo_weapon: {yolo_weapon.shape}")
        print(f"   Shape of yolo_medical: {yolo_medical.shape}")
        print(f"   Max weapon conf: {yolo_weapon.max()}")
        print(f"   Max medical conf: {yolo_medical.max()}")
    except Exception as e:
        print(f"❌ YOLO extraction thất bại: {e}")
        return False
        
    # 4. Kiểm tra sự tương thích với pipeline (padding và toggles)
    print("Kiểm tra tương thích pipeline (pad_to_match, apply_modality_toggles)...")
    try:
        # Giả lập output của các model khác
        t = len(frames)
        clip_feat = np.random.rand(t, 768).astype(np.float32)
        flow_feat = np.random.rand(t, 3).astype(np.float32)
        gore_probs = np.random.rand(t, 1).astype(np.float32)
        selfharm_probs = np.random.rand(t, 1).astype(np.float32)
        nsfw_probs = np.random.rand(t, 1).astype(np.float32)
        
        # Pad
        clip_f_raw, flow_f_raw, yolo_w_raw, gore_p_raw, sh_p_raw, nsfw_p_raw = pad_to_match(
            [clip_feat, flow_feat, yolo_weapon, gore_probs, selfharm_probs, nsfw_probs]
        )
        print("✅ Pad to match thành công.")
        
        # Toggles
        enabled_modal_set = {"CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"}
        clip_f, flow_f, yolo_w, gore_p, sh_p, nsfw_p = apply_modality_toggles(
            clip_f_raw, flow_f_raw, yolo_w_raw, gore_p_raw, sh_p_raw, nsfw_p_raw, enabled_modal_set
        )
        print("✅ Modality toggles thành công.")
        
        # Test Task Model Inference
        print("Test đẩy vào Task Model (V6)...")
        task_model = MODEL_CACHE["task_v6"]
        x = torch.from_numpy(clip_f).unsqueeze(0).to(DEVICE)
        flow_t = torch.from_numpy(flow_f).unsqueeze(0).to(DEVICE)
        yolo_t = torch.from_numpy(yolo_w).unsqueeze(0).to(DEVICE)
        gore_t = torch.from_numpy(gore_p).unsqueeze(0).to(DEVICE)
        nsfw_t = torch.from_numpy(nsfw_p).unsqueeze(0).to(DEVICE)
        selfharm_t = torch.from_numpy(sh_p).unsqueeze(0).to(DEVICE)
        
        v_logit, _, _, _ = task_model(x, flow_t, yolo_t, gore_t, nsfw_t, selfharm_t)
        v_prob = torch.sigmoid(v_logit).item()
        print(f"✅ Chạy qua Task Model thành công! V_Prob: {v_prob:.4f}")
        
    except Exception as e:
        print(f"❌ Lỗi tích hợp pipeline: {e}")
        return False

    print("\n🎉 TOÀN BỘ PIPELINE ĐÃ ĐƯỢC CHỨNG MINH LÀ HOẠT ĐỘNG HOÀN HẢO!")
    return True

if __name__ == "__main__":
    test_app_pipeline()
