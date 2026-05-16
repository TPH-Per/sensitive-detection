import os
import urllib.request
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
import time
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from app import run_v2_inference, process_images_batch, load_vit_models, load_v2_models

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

executor = ThreadPoolExecutor(max_workers=36)


def download_file(url, temp_path):
    try:
        urllib.request.urlretrieve(url, temp_path)
        return True
    except Exception as e:
        print(f"Loi tai file {url}: {e}")
        return False


def moderate_video(url):
    """Process a single video through V2 MHCM-MIL pipeline."""
    temp_path = f"temp_worker_{int(time.time())}.mp4"
    if not download_file(url, temp_path):
        return 0, "Loi tai file"
    try:
        thresholds = {"violence": 0.5, "nsfw": 0.5}
        verdict_md, score_md, _, _, _ = run_v2_inference(
            video_path=temp_path,
            thresholds=thresholds,
            top_k=6,
        )
        os.remove(temp_path)

        if "FLAGGED" in verdict_md:
            reason_match = re.search(r'Reason:\s*(.*)', verdict_md)
            reason = reason_match.group(1).strip() if reason_match else "Vi phạm nội dung"
            return 2, "Phát hiện nội dung: " + reason
        else:
            return 0, ""
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return 0, str(e)


# ─── COLLECT PHASE ───────────────────────────────────────────────
# Gather all pending media items with their context (source, doc_id, etc.)

class MediaItem:
    def __init__(self, url, is_video, source, doc_id, media_index=None, extra=None):
        self.url = url
        self.is_video = is_video
        self.source = source  # 'post', 'comment', 'message', 'avatar'
        self.doc_id = doc_id
        self.media_index = media_index  # index in media list (for posts/messages)
        self.extra = extra or {}  # conv_id for messages, user_id for avatars
        self.temp_path = None
        self.level = 0
        self.reason = ""


def collect_pending_media():
    """Collect all media items that need processing from all sources."""
    items = []

    # Posts
    try:
        docs = db.collection('posts').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(15).stream()
        for doc in docs:
            if doc.id in processed_posts:
                continue
            data = doc.to_dict()
            if data.get('status') != 'active':
                processed_posts.add(doc.id)
                continue
            media_list = data.get('media', [])
            for i, m in enumerate(media_list):
                if m.get('isSensitive', False):
                    continue
                mimeType = m.get('mimeType', '')
                url = m.get('url', '')
                if mimeType.startswith('image/') or mimeType.startswith('video/'):
                    items.append(MediaItem(
                        url=url,
                        is_video=mimeType.startswith('video/'),
                        source='post',
                        doc_id=doc.id,
                        media_index=i
                    ))
    except Exception as e:
        print(f"[POST] Loi collect: {e}")

    # Comments
    try:
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
                items.append(MediaItem(
                    url=url,
                    is_video=mimeType.startswith('video/'),
                    source='comment',
                    doc_id=doc.id
                ))
    except Exception as e:
        print(f"[COMMENT] Loi collect: {e}")

    # Messages (RTDB: messages/{convId}/{msgId})
    try:
        convs = rtdb.reference('messages').get()
        if convs:
            for conv_id, msgs in convs.items():
                if not isinstance(msgs, dict):
                    continue
                sorted_msgs = sorted(msgs.items(), key=lambda x: x[0], reverse=True)[:10]
                for msg_id, data in sorted_msgs:
                    if msg_id in processed_messages:
                        continue
                    if not isinstance(data, dict):
                        processed_messages.add(msg_id)
                        continue
                    media_list = data.get('media', [])
                    if not media_list:
                        processed_messages.add(msg_id)
                        continue
                    for i, m in enumerate(media_list):
                        if m.get('isSensitive', False):
                            continue
                        mimeType = m.get('mimeType', '')
                        url = m.get('url', '')
                        if mimeType.startswith('image/') or mimeType.startswith('video/'):
                            items.append(MediaItem(
                                url=url,
                                is_video=mimeType.startswith('video/'),
                                source='message',
                                doc_id=msg_id,
                                media_index=i,
                                extra={'conv_id': conv_id}
                            ))
    except Exception as e:
        print(f"[CHAT] Loi collect: {e}")

    # Avatars
    try:
        docs = db.collection('users').stream()
        for doc in docs:
            data = doc.to_dict()
            user_id = doc.id
            # Quét Avatar
            avatar = data.get('avatar', {})
            avatar_url = avatar.get('url', '')
            if avatar_url and processed_avatars.get(user_id + "_avatar") != avatar_url:
                items.append(MediaItem(
                    url=avatar_url,
                    is_video=False,
                    source='avatar',
                    doc_id=doc.id,
                    extra={'user_id': user_id, 'type': 'avatar'}
                ))
            
            # Quét Cover
            cover = data.get('cover', {})
            cover_url = cover.get('url', '')
            if cover_url and processed_avatars.get(user_id + "_cover") != cover_url:
                items.append(MediaItem(
                    url=cover_url,
                    is_video=False,
                    source='avatar', # Dùng chung logic xử lý profile media
                    doc_id=doc.id,
                    extra={'user_id': user_id, 'type': 'cover'}
                ))
    except Exception as e:
        print(f"[USER] Loi collect: {e}")

    return items


# ─── DOWNLOAD PHASE ──────────────────────────────────────────────

def download_item(item):
    """Download a single media item to a temp file."""
    ext = ".mp4" if item.is_video else ".jpg"
    # Use URL hash + timestamp to avoid filename collisions
    import hashlib
    url_hash = hashlib.md5(item.url.encode()).hexdigest()[:8]
    item.temp_path = f"temp_{url_hash}_{int(time.time())}{ext}"
    return download_file(item.url, item.temp_path)


def download_all(items):
    """Download all media items in parallel."""
    futures = {executor.submit(download_item, item): item for item in items}
    for f in as_completed(futures):
        item = futures[f]
        try:
            if not f.result():
                item.temp_path = None
        except Exception:
            item.temp_path = None


# ─── INFERENCE PHASE ─────────────────────────────────────────────

def process_all(items):
    """Process all media items. Images batched, videos sequential."""
    # Split into images and videos
    image_items = [item for item in items if not item.is_video and item.temp_path]
    video_items = [item for item in items if item.is_video and item.temp_path]

    # Batch process images through ViT
    if image_items:
        print(f"[BATCH] Processing {len(image_items)} images through ViT...")
        image_paths = [item.temp_path for item in image_items]
        try:
            results = process_images_batch(image_paths, batch_size=8)
            for item, (level, reason) in zip(image_items, results):
                item.level = level
                item.reason = reason
        except Exception as e:
            print(f"[BATCH] Loi batch images: {e}")
            for item in image_items:
                item.level = 0
                item.reason = str(e)

    # Process videos in parallel through V2 pipeline
    def _process_video(item):
        print(f"[VIDEO] Processing: {item.url[:80]}...")
        try:
            thresholds = {"violence": 0.5, "nsfw": 0.5}
            verdict_md, score_md, _, _, _ = run_v2_inference(
                video_path=item.temp_path,
                thresholds=thresholds,
                top_k=6,
            )
            if "FLAGGED" in verdict_md:
                reason_match = re.search(r'Reason:\s*(.*)', verdict_md)
                reason = reason_match.group(1).strip() if reason_match else "Vi phạm nội dung"
                item.level = 2
                item.reason = "Phát hiện nội dung: " + reason
                print(f"[VIDEO] FLAGGED: {item.reason}")
            else:
                item.level = 0
                item.reason = ""
                print(f"[VIDEO] SAFE")
        except Exception as e:
            item.level = 0
            item.reason = str(e)
            print(f"[VIDEO] ERROR: {e}")

    if video_items:
        print(f"[VIDEO] Processing {len(video_items)} videos in parallel (15 workers)...")
        video_futures = {executor.submit(_process_video, item): item for item in video_items}
        for f in as_completed(video_futures):
            try:
                f.result()
            except Exception as e:
                item = video_futures[f]
                item.level = 0
                item.reason = str(e)

    # Cleanup temp files
    for item in items:
        if item.temp_path and os.path.exists(item.temp_path):
            os.remove(item.temp_path)


# ─── APPLY RESULTS PHASE ─────────────────────────────────────────

def apply_results(items):
    """Write moderation results back to Firebase."""
    # Group by source and doc_id for posts (need to update all media at once)
    post_items = {}
    comment_items = []
    message_items = {}
    avatar_items = []

    for item in items:
        if item.source == 'post':
            if item.doc_id not in post_items:
                post_items[item.doc_id] = []
            post_items[item.doc_id].append(item)
        elif item.source == 'comment':
            comment_items.append(item)
        elif item.source == 'message':
            key = (item.extra['conv_id'], item.doc_id)
            if key not in message_items:
                message_items[key] = []
            message_items[key].append(item)
        elif item.source == 'avatar':
            avatar_items.append(item)

    # Apply post results
    for doc_id, doc_items in post_items.items():
        try:
            doc = db.collection('posts').document(doc_id).get()
            if not doc.exists:
                continue
            data = doc.to_dict()
            media_list = data.get('media', [])
            highest_level = 0
            violation_reason = ""

            for item in doc_items:
                idx = item.media_index
                if idx is not None and idx < len(media_list):
                    if item.level > 0:
                        media_list[idx]['isSensitive'] = True
                        media_list[idx]['moderationReason'] = item.reason
                        
                        # Nâng cấp Level 1 thành Level 2 cho các bài viết cập nhật Profile
                        current_level = item.level
                        post_type = data.get('type', 'regular')
                        if current_level == 1 and post_type in ['avatar_update', 'cover_update']:
                            current_level = 2
                            
                        if current_level > highest_level:
                            highest_level = current_level
                            violation_reason = item.reason
                        print(f"[POST] {doc_id} media[{idx}]: {item.reason} (Level {item.level} -> {current_level if current_level != item.level else ''})")
                    else:
                        print(f"[POST] {doc_id} media[{idx}]: An toàn")

            if highest_level == 2:
                print(f"[POST] Post {doc_id} -> BAN")
                doc.reference.update({
                    'status': 'policy_violation',
                    'moderationReason': violation_reason,
                    'media': media_list
                })
                # Gửi thông báo cho chủ bài viết (Chỉ gửi nếu không phải là bài viết cập nhật Avatar/Cover)
                author_id = data.get('authorId')
                post_type = data.get('type', 'regular')
                if author_id and post_type not in ['avatar_update', 'cover_update']:
                    db.collection('notifications').add({
                        'receiverId': author_id,
                        'actorId': 'system',
                        'type': 'system',
                        'data': {
                            'postId': doc_id,
                            'contentSnippet': f"Bài viết của bạn đã bị ẩn do vi phạm: {violation_reason}",
                            'isReply': False
                        },
                        'isRead': False,
                        'status': 'unseen',
                        'createdAt': firestore.SERVER_TIMESTAMP,
                        'actorName': 'Hệ thống Quản trị',
                        'actorAvatar': ''
                    })
            elif highest_level == 1:
                print(f"[POST] Post {doc_id} -> BLUR")
                doc.reference.update({'media': media_list})

            processed_posts.add(doc_id)
        except Exception as e:
            print(f"[POST] Loi apply {doc_id}: {e}")

    # Apply comment results
    for item in comment_items:
        try:
            doc = db.collection('comments').document(item.doc_id).get()
            if not doc.exists:
                continue
            data = doc.to_dict()
            image = data.get('image', {})

            if item.level == 2:
                print(f"[COMMENT] {item.doc_id} -> BAN")
                image['isSensitive'] = True
                image['moderationReason'] = item.reason
                doc.reference.update({
                    'status': 'policy_violation',
                    'moderationReason': item.reason,
                    'image': image
                })
                # Gửi thông báo cho chủ bình luận
                author_id = data.get('authorId')
                if author_id:
                    db.collection('notifications').add({
                        'receiverId': author_id,
                        'actorId': 'system',
                        'type': 'system',
                        'data': {
                            'postId': data.get('postId'),
                            'commentId': item.doc_id,
                            'contentSnippet': f"Bình luận của bạn đã bị ẩn do vi phạm: {item.reason}",
                            'isReply': False
                        },
                        'isRead': False,
                        'status': 'unseen',
                        'createdAt': firestore.SERVER_TIMESTAMP,
                        'actorName': 'Hệ thống Quản trị',
                        'actorAvatar': ''
                    })
            elif item.level == 1:
                print(f"[COMMENT] {item.doc_id} -> BLUR")
                image['isSensitive'] = True
                image['moderationReason'] = item.reason
                doc.reference.update({'image': image})
            else:
                print(f"[COMMENT] {item.doc_id}: An toàn")

            processed_comments.add(item.doc_id)
        except Exception as e:
            print(f"[COMMENT] Loi apply {item.doc_id}: {e}")

    # Apply message results
    for (conv_id, msg_id), msg_items in message_items.items():
        try:
            msg_ref = rtdb.reference(f'messages/{conv_id}/{msg_id}')
            msg_data = msg_ref.get()
            if not msg_data:
                continue
            media_list = msg_data.get('media', [])
            has_violation = False

            for item in msg_items:
                idx = item.media_index
                if idx is not None and idx < len(media_list):
                    if item.level > 0:
                        has_violation = True
                        media_list[idx]['isSensitive'] = True
                        media_list[idx]['moderationReason'] = item.reason
                        print(f"[CHAT] {conv_id}/{msg_id} media[{idx}]: {item.reason}")
                    else:
                        print(f"[CHAT] {conv_id}/{msg_id} media[{idx}]: An toàn")

            if has_violation:
                print(f"[CHAT] {conv_id}/{msg_id} -> BLUR")
                msg_ref.update({'media': media_list})

            processed_messages.add(msg_id)
        except Exception as e:
            print(f"[CHAT] Loi apply {msg_id}: {e}")

    # Apply avatar results
    for item in avatar_items:
        try:
            user_id = item.extra['user_id']
            media_type = item.extra.get('type', 'avatar')
            type_label = "Ảnh đại diện" if media_type == 'avatar' else "Ảnh bìa"
            
            if item.level > 0:
                print(f"[USER] {type_label} {user_id} -> REMOVED: {item.reason}")
                # Cập nhật xóa ảnh vi phạm (avatar hoặc cover)
                db.collection('users').document(item.doc_id).update({
                    media_type: {'url': '', 'fileName': '', 'mimeType': '', 'size': 0}
                })
                # Gửi thông báo
                db.collection('notifications').add({
                    'receiverId': user_id,
                    'actorId': 'system',
                    'type': 'system',
                    'data': {
                        'contentSnippet': f"{type_label} của bạn đã bị gỡ do: {item.reason}",
                        'isReply': False
                    },
                    'isRead': False,
                    'status': 'unseen',
                    'createdAt': firestore.SERVER_TIMESTAMP,
                    'actorName': 'Hệ thống Quản trị',
                    'actorAvatar': ''
                })
            else:
                print(f"[USER] {type_label} {user_id}: An toàn")
            processed_avatars[user_id + "_" + media_type] = item.url
        except Exception as e:
            print(f"[USER] Loi apply avatar: {e}")


# ─── MARK UNPROCESSED ────────────────────────────────────────────

def mark_processed(items):
    """Mark all items as processed (even if not flagged) to avoid re-checking."""
    for item in items:
        if item.source == 'post':
            processed_posts.add(item.doc_id)
        elif item.source == 'comment':
            processed_comments.add(item.doc_id)
        elif item.source == 'message':
            processed_messages.add(item.doc_id)


# ─── MAIN LOOP ───────────────────────────────────────────────────

# Pre-load all models at startup
print("Dang tai tat ca model (V2 pipeline)...")
load_v2_models()
load_vit_models()
print("Tat ca model da san sang!")
print(f"V2 thresholds: V=0.5 | N=0.5")

print("Bat dau Worker lang nghe Firebase (Batch Mode - GPU Optimized)...")
while True:
    try:
        t0 = time.time()

        # 1. Collect all pending media
        items = collect_pending_media()
        if not items:
            time.sleep(5)
            continue

        print(f"[COLLECT] Found {len(items)} media items to process")

        # 2. Download all in parallel
        download_all(items)
        downloaded = [item for item in items if item.temp_path]
        print(f"[DOWNLOAD] Downloaded {len(downloaded)}/{len(items)} files")

        # 3. Process all (images batched, videos sequential)
        process_all(downloaded)

        # 4. Apply results to Firebase
        apply_results(downloaded)

        # 5. Mark unprocessed items as checked
        mark_processed(items)

        elapsed = time.time() - t0
        print(f"[DONE] Processed {len(downloaded)} items in {elapsed:.1f}s")

    except Exception as e:
        print(f"Loi vong lap: {e}")

    time.sleep(5)
