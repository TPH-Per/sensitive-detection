import os
import urllib.request
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
import time
import re

from app import process_video, process_image_vit

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
processed_avatars = {}

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
        return 0, "Lỗi tải file"

    try:
        if is_video:
            # Video: dùng V7 VideoMAE-LoRA (production default)
            res = process_video(
                video_path=temp_path,
                top_k=6,
                apply_guard=True,
                model_variant="V7 VideoMAE-LoRA",
                enabled_branches=["V", "S", "N"],
                enabled_modalities=["CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"]
            )
            score_md = res[1]
            os.remove(temp_path)

            # Parse video scores (V6 format)
            v_match = re.search(r'- Violence raw: \*\*([0-9.]+)\*\*', score_md)
            s_match = re.search(r'- Self-harm score: \*\*([0-9.]+)\*\*', score_md)
            n_match = re.search(r'- NSFW score: \*\*([0-9.]+)\*\*', score_md)

            v_score = float(v_match.group(1)) if v_match else 0.0
            s_score = float(s_match.group(1)) if s_match else 0.0
            n_score = float(n_match.group(1)) if n_match else 0.0

            level = 0
            reasons = []

            # Video thresholds: collect ALL violations, combine reasons
            if n_score > 0.85:
                level = 2
                reasons.append("khiêu dâm / khỏa thân")
            if v_score > 0.8:
                level = 2
                reasons.append("bạo lực / vũ khí")
            if s_score > 0.8:
                level = 2
                reasons.append("tự hại nghiêm trọng")
            if level < 2:
                if n_score > 0.45:
                    level = 1
                    reasons.append("nhạy cảm / hở hang")
                if v_score > 0.45:
                    level = 1
                    reasons.append("bạo lực nhẹ")
                if s_score > 0.45:
                    level = 1
                    reasons.append("tự hại")

            if level == 2:
                reason = "Phát hiện nội dung: " + ", ".join(reasons)
            elif level == 1:
                reason = "Nội dung có yếu tố: " + ", ".join(reasons)
            else:
                reason = ""

            return level, reason
        else:
            # Image: dùng ViT models (nhẹ + chính xác hơn cho ảnh)
            res = process_image_vit(image_path=temp_path)
            score_md = res[1]
            os.remove(temp_path)

            # Parse ViT image scores
            n_match = re.search(r'NSFW probability: ([0-9.]+)', score_md)
            v_match = re.search(r'Violence probability: ([0-9.]+)', score_md)

            n_score = float(n_match.group(1)) if n_match else 0.0
            v_score = float(v_match.group(1)) if v_match else 0.0

            level = 0
            reasons = []

            # Image thresholds (ViT-based, match app.py)
            # Collect ALL violations, combine reasons
            if n_score >= 0.90:
                level = 2
                reasons.append("khỏa thân / khiêu dâm")
            if v_score >= 0.80:
                level = 2
                reasons.append("bạo lực")
            if level < 2:
                if n_score >= 0.60:
                    level = 1
                    reasons.append("nhạy cảm / sexy / bikini")
                if v_score >= 0.60:
                    level = 1
                    reasons.append("bạo lực nhẹ")

            if level == 2:
                reason = "Phát hiện nội dung: " + ", ".join(reasons)
            elif level == 1:
                reason = "Nội dung có yếu tố: " + ", ".join(reasons)
            else:
                reason = ""

            return level, reason
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return 0, str(e)

def process_posts():
    docs = db.collection('posts').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(15).stream()
    for doc in docs:
        if doc.id in processed_posts:
            continue
            
        data = doc.to_dict()
        if data.get('status') != 'active':
            processed_posts.add(doc.id)
            continue
            
        media_list = data.get('media', [])
        
        highest_level = 0
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
                level, reason = moderate_url(url, is_video)
                
                if level > 0:
                    m['isSensitive'] = True
                    m['moderationReason'] = reason
                    if level > highest_level:
                        highest_level = level
                        violation_reason = reason
                    print(f"  -> Phát hiện: {reason} (Level {level})")
                else:
                    print("  -> An toàn")
            updated_media.append(m)
            
        if highest_level == 2:
            print(f"[POST] Xử lý Post {doc.id} -> BAN (policy_violation)")
            doc.reference.update({
                'status': 'policy_violation',
                'moderationReason': violation_reason,
                'media': updated_media
            })
        elif highest_level == 1:
            print(f"[POST] Xử lý Post {doc.id} -> BLUR (isSensitive)")
            doc.reference.update({
                'media': updated_media
            })
            
        processed_posts.add(doc.id)

def process_comments():
    docs = db.collection('comments').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(15).stream()
    for doc in docs:
        if doc.id in processed_comments:
            continue
            
        data = doc.to_dict()
        if data.get('status') != 'active':
            processed_comments.add(doc.id)
            continue
            
        image = data.get('image', None)
        if not image or image.get('isSensitive', False):
            processed_comments.add(doc.id)
            continue
            
        url = image.get('url', '')
        mimeType = image.get('mimeType', '')
        
        if mimeType.startswith('image/') or mimeType.startswith('video/'):
            print(f"[COMMENT] Quét media: {url}")
            is_video = mimeType.startswith('video/')
            level, reason = moderate_url(url, is_video)
            
            if level == 2:
                print(f"[COMMENT] Xử lý Comment {doc.id} -> BAN (policy_violation)")
                image['isSensitive'] = True
                image['moderationReason'] = reason
                doc.reference.update({
                    'status': 'policy_violation',
                    'moderationReason': reason,
                    'image': image
                })
            elif level == 1:
                print(f"[COMMENT] Xử lý Comment {doc.id} -> BLUR (isSensitive)")
                image['isSensitive'] = True
                image['moderationReason'] = reason
                doc.reference.update({
                    'image': image
                })
            else:
                print("  -> An toàn")
                
        processed_comments.add(doc.id)

def process_messages():
    # Lấy 20 tin nhắn mới nhất dựa theo key
    ref = rtdb.reference('messages')
    messages = ref.order_by_key().limit_to_last(20).get()
    
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
                level, reason = moderate_url(url, is_video)
                
                # Chat thì bất kể level 1 hay 2 đều chỉ che mờ (không ban)
                if level > 0:
                    has_violation = True
                    m['isSensitive'] = True
                    m['moderationReason'] = reason
                    print(f"  -> Phát hiện: {reason} (Level {level})")
                else:
                    print("  -> An toàn")
            updated_media.append(m)
            
        if has_violation:
            print(f"[CHAT] Xử lý Chat {msg_id} -> BLUR (isSensitive)")
            ref.child(msg_id).update({
                'media': updated_media
            })
            
        processed_messages.add(msg_id)

def process_users():
    docs = db.collection('users').stream()
    for doc in docs:
        data = doc.to_dict()
        user_id = doc.id
        avatar = data.get('avatar', {})
        avatar_url = avatar.get('url', '')
        
        if not avatar_url:
            continue
            
        if processed_avatars.get(user_id) == avatar_url:
            continue
            
        print(f"[USER] Quét Avatar của user {user_id}: {avatar_url}")
        level, reason = moderate_url(avatar_url, is_video=False)
        
        # Avatar nếu vi phạm (dù level 1 hay 2) thì xóa luôn (ban)
        if level > 0:
            print(f"  -> Phát hiện Avatar vi phạm: {reason}")
            doc.reference.update({
                'avatar': {
                    'url': '',
                    'fileName': '',
                    'mimeType': '',
                    'size': 0
                }
            })
            db.collection('notifications').add({
                'receiverId': user_id,
                'actorId': 'system',
                'type': 'system',
                'data': {
                    'contentSnippet': f"Ảnh đại diện của bạn đã bị gỡ do: {reason}",
                    'isReply': False
                },
                'isRead': False,
                'status': 'unseen',
                'createdAt': firestore.SERVER_TIMESTAMP,
                'actorName': 'Hệ thống Quản trị',
                'actorAvatar': ''
            })
        else:
            print("  -> Avatar An toàn")
            
        processed_avatars[user_id] = avatar_url

print("Bắt đầu Worker lắng nghe Firebase (Demo Mode - Phân cấp Vi Phạm)...")
while True:
    try:
        process_posts()
        process_comments()
        process_messages()
        process_users()
    except Exception as e:
        print(f"Lỗi vòng lặp: {e}")
    time.sleep(5)
