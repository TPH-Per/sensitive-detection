import gradio as gr
import cv2
import tempfile
import os
import numpy as np
from nudenet import NudeDetector

print("Loading NudeNet model...")
detector = NudeDetector()
print("Model loaded successfully!")

def process_image(image):
    if image is None:
        return None, "Vui lòng tải ảnh lên."
    
    # Tạo file tạm vì detector của nudenet yêu cầu path
    temp_path = os.path.join(tempfile.gettempdir(), "temp_nudenet.jpg")
    
    # Gradio cung cấp ảnh dạng RGB numpy array, OpenCV cần BGR để lưu
    img_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    cv2.imwrite(temp_path, img_bgr)
    
    try:
        results = detector.detect(temp_path)
    except Exception as e:
        return image, f"Lỗi trong quá trình quét: {e}"
        
    out_img = img_bgr.copy()
    text_out = "### Kết quả phân tích từ NudeNet:\n\n"
    
    if not results:
        text_out += "✅ **Hoàn toàn an toàn** - Không phát hiện yếu tố giải phẫu nhạy cảm nào."
    else:
        for result in results:
            box = result['box']
            x, y, w, h = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            score = result['score']
            label = result['class']
            
            text_out += f"- **{label}** (Độ tin cậy: {score:.2%})\n"
            
            # Chọn màu: Xanh lá nếu là "COVERED" (được che đậy) hoặc "FACE", Đỏ nếu là "EXPOSED" (phơi bày)
            color = (0, 255, 0) if "COVERED" in label or "FACE" in label else (0, 0, 255)
            
            # Vẽ hộp giới hạn và text
            cv2.rectangle(out_img, (x, y), (x + w, y + h), color, 2)
            cv2.putText(out_img, f"{label} ({score:.2f})", (x, max(15, y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            
    # Chuyển lại về RGB để trả về cho UI
    out_rgb = cv2.cvtColor(out_img, cv2.COLOR_BGR2RGB)
    return out_rgb, text_out

demo = gr.Interface(
    fn=process_image,
    inputs=gr.Image(label="Kéo thả hoặc tải ảnh lên đây"),
    outputs=[
        gr.Image(label="Ảnh sau khi quét (Có hộp giới hạn)"),
        gr.Markdown(label="Chi tiết nhãn nhận diện")
    ],
    title="🔍 NudeNet Web Demo (Object Detection)",
    description="""
    Hệ thống test thử NudeNet. Khác với ViT-NSFW (đưa ra 1 điểm số chung chung), NudeNet sẽ **khoanh vùng chính xác** các bộ phận cơ thể.
    
    👉 Thử tải lên một bức ảnh áo tắm, đồ bơi thể thao hoặc người mẫu nội y. 
    Bạn sẽ thấy NudeNet thông minh ở chỗ nó nhận diện được chữ **COVERED** (đã được che) thay vì **EXPOSED** (Lộ vùng kín).
    """
)

if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1", server_port=7860, share=False)
