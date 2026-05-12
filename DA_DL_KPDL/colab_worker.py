import os
import urllib.request
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
import time

from app import process_image, process_video

# Khởi tạo Firebase Admin
cred = credentials.Certificate('firebase_credentials.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://smurfy-138c1-default-rtdb.asia-southeast1.firebasedatabase.app'
})

db = firestore.client()

# Tránh check lại các bài đã check
processed_posts = set()
processed_comments = set()
processed_messages = set()

def download_file(url, temp_path):
    try:
        # Some URLs might need headers if they are signed, but Firebase Storage download URLs are public
        urllib.request.urlretrieve(url, temp_path)
        return True
    except Exception as e:
        print(f"Lỗi tải file {url}: {e}")
        return False

def moderate_url(url, is_video):
    ext = ".mp4" if is_video else ".jpg"
    temp_path = f"temp_worker_{int(time.time())}{ext}"
    
    if not download_file(url, temp_path):
        return False, "Lỗi tải file"
        
    try:
        if is_video:
            res = process_video(
                video_path=temp_path,
                top_k=6,
                apply_guard=True,
                model_variant="V6 Task-Gated", 
                enabled_branches=["V", "S", "N"],
                enabled_modalities=["CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"]
            )
        else:
            res = process_image(
                image_path=temp_path,
                apply_guard=True,
                model_variant="V6 Task-Gated",
                enabled_branches=["V", "S", "N"],
                enabled_modalities=["CLIP", "YOLO", "Gore", "SelfHarm", "NSFW"]
            )
        
        verdict_md = res[0]
        os.remove(temp_path)
        
        is_flagged = "FLAGGED" in verdict_md or "VI PHẠM" in verdict_md
        # Trích xuất một phần lý do từ verdict
        lines = verdict_md.split('\n')
        reason = "Vi phạm tiêu chuẩn cộng đồng"
        for line in lines:
            if "Phát hiện" in line or "Dấu hiệu" in line or "Score" in line:
                reason = line.replace("*", "").strip()
                break
                
        return is_flagged, reason
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False, str(e)

def process_posts():
    docs = db.collection('posts').where('status', '==', 'active').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(10).stream()
    for doc in docs:
        if doc.id in processed_posts:
            continue
            
        data = doc.to_dict()
        media_list = data.get('media', [])
        
        has_violation = False
        violation_reason = ""
        updated_media = []
        
        for m in media_list:
            if m.get('isSensitive', False):
                updated_media.append(m)
                continue
                
            mimeType = m.get('mimeType', '')
            url = m.get('url', '')
            if mimeType.startswith('image/') or mimeType.startswith('video/'):
                print(f"[POST] Quét media: {url}")
                is_video = mimeType.startswith('video/')
                is_flagged, reason = moderate_url(url, is_video)
                
                if is_flagged:
                    has_violation = True
                    violation_reason = reason
                    m['isSensitive'] = True
                    m['moderationReason'] = reason
                    print(f"  -> Phát hiện vi phạm: {reason}")
                else:
                    print("  -> An toàn")
            updated_media.append(m)
            
        if has_violation:
            print(f"[POST] Xử lý Post {doc.id} -> policy_violation")
            doc.reference.update({
                'status': 'policy_violation',
                'moderationReason': violation_reason,
                'media': updated_media
            })
            
        processed_posts.add(doc.id)

def process_messages():
    # Lấy 20 tin nhắn mới nhất
    ref = rtdb.reference('messages')
    messages = ref.order_by_child('createdAt').limit_to_last(20).get()
    
    if not messages:
        return
        
    for msg_id, data in messages.items():
        if msg_id in processed_messages:
            continue
            
        media_list = data.get('media', [])
        if not media_list:
            processed_messages.add(msg_id)
            continue
            
        has_violation = False
        updated_media = []
        
        for m in media_list:
            if m.get('isSensitive', False):
                updated_media.append(m)
                continue
                
            mimeType = m.get('mimeType', '')
            url = m.get('url', '')
            if mimeType.startswith('image/') or mimeType.startswith('video/'):
                print(f"[CHAT] Quét media: {url}")
                is_video = mimeType.startswith('video/')
                is_flagged, reason = moderate_url(url, is_video)
                
                if is_flagged:
                    has_violation = True
                    m['isSensitive'] = True
                    m['moderationReason'] = reason
                    print(f"  -> Phát hiện vi phạm: {reason}")
                else:
                    print("  -> An toàn")
            updated_media.append(m)
            
        if has_violation:
            print(f"[CHAT] Xử lý Chat {msg_id} -> isSensitive (che mờ)")
            ref.child(msg_id).update({
                'media': updated_media
            })
            
        processed_messages.add(msg_id)

print("Bắt đầu Worker lắng nghe Firebase (Demo Mode)...")
while True:
    try:
        process_posts()
        process_messages()
    except Exception as e:
        print(f"Lỗi vòng lặp: {e}")
    time.sleep(5)
