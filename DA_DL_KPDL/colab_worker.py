import os
import urllib.request
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
import time
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from app import process_video, process_images_batch, load_vit_models, load_common_models

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

executor = ThreadPoolExecutor(max_workers=4)


def download_file(url, temp_path):
    try:
        urllib.request.urlretrieve(url, temp_path)
        return True
    except Exception as e:
        print(f"Loi tai file {url}: {e}")
        return False


def moderate_video(url):
    """Process a single video through V7 pipeline."""
    temp_path = f"temp_worker_{int(time.time())}.mp4"
    if not download_file(url, temp_path):
        return 0, "Loi tai file"
    try:
        res = process_video(
            video_path=temp_path,
            top_k=6,
            apply_guard=True,
            model_variant="V7 VideoMAE-LoRA",
            enabled_branches=["V", "N"],
            enabled_modalities=["CLIP", "Flow", "Gore", "NSFW"]
        )
        verdict_md = res[0]
        score_md = res[1]
        os.remove(temp_path)

        # Read the verdict directly from process_video (same as web GUI)
        if "FLAGGED" in verdict_md:
            # Parse the reason from verdict
            reason_match = re.search(r'Lý do:\s*(.*)', verdict_md)
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
            avatar = data.get('avatar', {})
            avatar_url = avatar.get('url', '')
            if not avatar_url:
                continue
            if processed_avatars.get(user_id) == avatar_url:
                continue
            items.append(MediaItem(
                url=avatar_url,
                is_video=False,
                source='avatar',
                doc_id=doc.id,
                extra={'user_id': user_id}
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

    # Process videos sequentially (V7 doesn't support batching)
    for item in video_items:
        print(f"[VIDEO] Processing: {item.url[:80]}...")
        try:
            res = process_video(
                video_path=item.temp_path,
                top_k=6,
                apply_guard=True,
                model_variant="V7 VideoMAE-LoRA",
                enabled_branches=["V", "N"],
                enabled_modalities=["CLIP", "Flow", "Gore", "NSFW"]
            )
            verdict_md = res[0]
            score_md = res[1]

            # Debug: print score details
            print(f"[VIDEO] Score details:")
            for line in score_md.split("\n"):
                line = line.strip()
                if line and any(k in line for k in [
                    "Calibration thresholds", "Violence raw", "NSFW score",
                    "Self-harm score", "Guard fired", "Runtime",
                    "Branch toggles", "Modality toggles"
                ]):
                    print(f"  {line}")

            # Read verdict directly (same as web GUI)
            if "FLAGGED" in verdict_md:
                reason_match = re.search(r'Lý do:\s*(.*)', verdict_md)
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
                        if item.level > highest_level:
                            highest_level = item.level
                            violation_reason = item.reason
                        print(f"[POST] {doc_id} media[{idx}]: {item.reason} (Level {item.level})")
                    else:
                        print(f"[POST] {doc_id} media[{idx}]: An toàn")

            if highest_level == 2:
                print(f"[POST] Post {doc_id} -> BAN")
                doc.reference.update({
                    'status': 'policy_violation',
                    'moderationReason': violation_reason,
                    'media': media_list
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
            if item.level > 0:
                print(f"[USER] Avatar {user_id} -> REMOVED: {item.reason}")
                db.collection('users').document(item.doc_id).update({
                    'avatar': {'url': '', 'fileName': '', 'mimeType': '', 'size': 0}
                })
                db.collection('notifications').add({
                    'receiverId': user_id,
                    'actorId': 'system',
                    'type': 'system',
                    'data': {
                        'contentSnippet': f"Ảnh đại diện của bạn đã bị gỡ do: {item.reason}",
                        'isReply': False
                    },
                    'isRead': False,
                    'status': 'unseen',
                    'createdAt': firestore.SERVER_TIMESTAMP,
                    'actorName': 'Hệ thống Quản trị',
                    'actorAvatar': ''
                })
            else:
                print(f"[USER] Avatar {user_id}: An toàn")
            processed_avatars[user_id] = item.url
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
print("Dang tai tat ca model...")
load_common_models()
load_vit_models()
print("Tat ca model da san sang!")

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
