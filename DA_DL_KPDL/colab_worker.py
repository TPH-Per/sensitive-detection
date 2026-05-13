import os
import hashlib
import urllib.request
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
import time
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from app import process_video, process_images_batch, load_vit_models, load_common_models, get_thresholds_for_variant

# ─── FIREBASE INIT ──────────────────────────────────────────────

cred = credentials.Certificate('firebase_credentials.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://smurfy-138c1-default-rtdb.asia-southeast1.firebasedatabase.app'
})

db = firestore.client()

# De-duplication sets
processed_posts = set()
processed_comments = set()
processed_messages = set()
processed_avatars = {}  # key: "{user_id}_{type}" -> url

executor = ThreadPoolExecutor(max_workers=4)


# ─── HELPERS ────────────────────────────────────────────────────

def download_file(url, temp_path):
    try:
        urllib.request.urlretrieve(url, temp_path)
        return True
    except Exception as e:
        print(f"Loi tai file {url}: {e}")
        return False


def parse_verdict(verdict_md):
    """Extract (level, reason) from a verdict markdown string."""
    if "FLAGGED" in verdict_md:
        reason_match = re.search(r'L[ýy] do:\s*(.*)', verdict_md)
        reason = reason_match.group(1).strip() if reason_match else "Vi pham noi dung"
        return 2, "Phat hien noi dung: " + reason
    return 0, ""


# ─── DATA MODEL ─────────────────────────────────────────────────

class MediaItem:
    __slots__ = ('url', 'is_video', 'source', 'doc_id', 'media_index',
                 'extra', 'temp_path', 'level', 'reason')

    def __init__(self, url, is_video, source, doc_id, media_index=None, extra=None):
        self.url = url
        self.is_video = is_video
        self.source = source  # 'post', 'comment', 'message', 'avatar'
        self.doc_id = doc_id
        self.media_index = media_index
        self.extra = extra or {}
        self.temp_path = None
        self.level = 0
        self.reason = ""


# ─── COLLECT PHASE ──────────────────────────────────────────────

def _collect_posts():
    items = []
    try:
        docs = db.collection('posts') \
            .order_by('createdAt', direction=firestore.Query.DESCENDING) \
            .limit(15).stream()
        for doc in docs:
            if doc.id in processed_posts:
                continue
            data = doc.to_dict()
            if data.get('status') != 'active':
                processed_posts.add(doc.id)
                continue
            for i, m in enumerate(data.get('media', [])):
                if m.get('isSensitive', False):
                    continue
                mime = m.get('mimeType', '')
                if mime.startswith(('image/', 'video/')):
                    items.append(MediaItem(
                        url=m.get('url', ''),
                        is_video=mime.startswith('video/'),
                        source='post', doc_id=doc.id, media_index=i,
                    ))
    except Exception as e:
        print(f"[POST] Loi collect: {e}")
    return items


def _collect_comments():
    items = []
    try:
        docs = db.collection('comments') \
            .order_by('createdAt', direction=firestore.Query.DESCENDING) \
            .limit(15).stream()
        for doc in docs:
            if doc.id in processed_comments:
                continue
            data = doc.to_dict()
            if data.get('status') != 'active':
                processed_comments.add(doc.id)
                continue
            image = data.get('image')
            if not image or image.get('isSensitive', False):
                processed_comments.add(doc.id)
                continue
            mime = image.get('mimeType', '')
            if mime.startswith(('image/', 'video/')):
                items.append(MediaItem(
                    url=image.get('url', ''),
                    is_video=mime.startswith('video/'),
                    source='comment', doc_id=doc.id,
                ))
    except Exception as e:
        print(f"[COMMENT] Loi collect: {e}")
    return items


def _collect_messages():
    items = []
    try:
        convs = rtdb.reference('messages').get()
        if not convs:
            return items
        for conv_id, msgs in convs.items():
            if not isinstance(msgs, dict):
                continue
            for msg_id, data in sorted(msgs.items(), key=lambda x: x[0], reverse=True)[:10]:
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
                    mime = m.get('mimeType', '')
                    if mime.startswith(('image/', 'video/')):
                        items.append(MediaItem(
                            url=m.get('url', ''),
                            is_video=mime.startswith('video/'),
                            source='message', doc_id=msg_id,
                            media_index=i, extra={'conv_id': conv_id},
                        ))
    except Exception as e:
        print(f"[CHAT] Loi collect: {e}")
    return items


def _collect_profile_media():
    """Scan avatar + cover photos for all users."""
    items = []
    try:
        docs = db.collection('users').stream()
        for doc in docs:
            data = doc.to_dict()
            uid = doc.id
            for media_type in ('avatar', 'cover'):
                url = (data.get(media_type) or {}).get('url', '')
                if not url:
                    continue
                cache_key = f"{uid}_{media_type}"
                if processed_avatars.get(cache_key) == url:
                    continue
                items.append(MediaItem(
                    url=url, is_video=False,
                    source='avatar', doc_id=doc.id,
                    extra={'user_id': uid, 'type': media_type},
                ))
    except Exception as e:
        print(f"[USER] Loi collect: {e}")
    return items


def collect_pending_media():
    """Collect all media items that need processing from all sources."""
    items = _collect_posts()
    items += _collect_comments()
    items += _collect_messages()
    items += _collect_profile_media()
    return items


# ─── DOWNLOAD PHASE ─────────────────────────────────────────────

def download_item(item):
    ext = ".mp4" if item.is_video else ".jpg"
    url_hash = hashlib.md5(item.url.encode()).hexdigest()[:8]
    item.temp_path = f"temp_{url_hash}_{int(time.time())}{ext}"
    return download_file(item.url, item.temp_path)


def download_all(items):
    futures = {executor.submit(download_item, item): item for item in items}
    for f in as_completed(futures):
        item = futures[f]
        try:
            if not f.result():
                item.temp_path = None
        except Exception:
            item.temp_path = None


# ─── INFERENCE PHASE ────────────────────────────────────────────

def _process_video_item(item):
    """Run V7 moderation on a single video file."""
    print(f"[VIDEO] Processing: {item.url[:80]}...")
    try:
        res = process_video(
            video_path=item.temp_path,
            top_k=6, apply_guard=True,
            model_variant="V7 VideoMAE-LoRA",
            enabled_branches=["V", "N"],
            enabled_modalities=["CLIP", "Flow", "Gore", "NSFW"],
        )
        verdict_md, score_md = res[0], res[1]

        # Debug logging
        for line in score_md.split("\n"):
            line = line.strip()
            if line and any(k in line for k in [
                "Calibration thresholds", "Violence raw", "NSFW score",
                "Self-harm score", "Guard fired", "Runtime",
            ]):
                print(f"  {line}")

        item.level, item.reason = parse_verdict(verdict_md)
        print(f"[VIDEO] {'FLAGGED: ' + item.reason if item.level else 'SAFE'}")
    except Exception as e:
        item.level = 0
        item.reason = str(e)
        print(f"[VIDEO] ERROR: {e}")


def process_all(items):
    """Process all media items. Images batched, videos sequential."""
    image_items = [it for it in items if not it.is_video and it.temp_path]
    video_items = [it for it in items if it.is_video and it.temp_path]

    # Batch images through ViT
    if image_items:
        print(f"[BATCH] Processing {len(image_items)} images through ViT...")
        try:
            results = process_images_batch(
                [it.temp_path for it in image_items], batch_size=8)
            for item, (level, reason) in zip(image_items, results):
                item.level = level
                item.reason = reason
        except Exception as e:
            print(f"[BATCH] Loi batch images: {e}")
            for item in image_items:
                item.reason = str(e)

    # Videos sequential
    for item in video_items:
        _process_video_item(item)

    # Cleanup
    for item in items:
        if item.temp_path and os.path.exists(item.temp_path):
            os.remove(item.temp_path)


# ─── APPLY RESULTS PHASE ────────────────────────────────────────

def _send_notification(receiver_id, post_id=None, comment_id=None, content=""):
    """Send a system notification to a user."""
    data = {'contentSnippet': content, 'isReply': False}
    if post_id:
        data['postId'] = post_id
    if comment_id:
        data['commentId'] = comment_id
    db.collection('notifications').add({
        'receiverId': receiver_id,
        'actorId': 'system',
        'type': 'system',
        'data': data,
        'isRead': False,
        'status': 'unseen',
        'createdAt': firestore.SERVER_TIMESTAMP,
        'actorName': 'He thong Quan tri',
        'actorAvatar': '',
    })


def _apply_posts(post_items):
    for doc_id, doc_items in post_items.items():
        try:
            doc = db.collection('posts').document(doc_id).get()
            if not doc.exists:
                continue
            data = doc.to_dict()
            media_list = data.get('media', [])
            highest_level = 0
            violation_reason = ""
            post_type = data.get('type', 'regular')

            for item in doc_items:
                idx = item.media_index
                if idx is None or idx >= len(media_list):
                    continue
                if item.level > 0:
                    media_list[idx]['isSensitive'] = True
                    media_list[idx]['moderationReason'] = item.reason
                    # Escalate Level 1 -> 2 for profile update posts
                    effective_level = item.level
                    if effective_level == 1 and post_type in ('avatar_update', 'cover_update'):
                        effective_level = 2
                    if effective_level > highest_level:
                        highest_level = effective_level
                        violation_reason = item.reason
                    print(f"[POST] {doc_id} media[{idx}]: {item.reason} (Level {item.level})"
                          + (f" -> escalated {effective_level}" if effective_level != item.level else ""))
                else:
                    print(f"[POST] {doc_id} media[{idx}]: An toan")

            if highest_level == 2:
                print(f"[POST] Post {doc_id} -> BAN")
                doc.reference.update({
                    'status': 'policy_violation',
                    'moderationReason': violation_reason,
                    'media': media_list,
                })
                # Notify author (skip for auto-generated profile updates)
                author_id = data.get('authorId')
                if author_id and post_type not in ('avatar_update', 'cover_update'):
                    _send_notification(
                        author_id, post_id=doc_id,
                        content=f"Bai viet cua ban da bi an do vi pham: {violation_reason}",
                    )
            elif highest_level == 1:
                print(f"[POST] Post {doc_id} -> BLUR")
                doc.reference.update({'media': media_list})

            processed_posts.add(doc_id)
        except Exception as e:
            print(f"[POST] Loi apply {doc_id}: {e}")


def _apply_comments(comment_items):
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
                    'image': image,
                })
                author_id = data.get('authorId')
                if author_id:
                    _send_notification(
                        author_id,
                        post_id=data.get('postId'),
                        comment_id=item.doc_id,
                        content=f"Binh luan cua ban da bi an do vi pham: {item.reason}",
                    )
            elif item.level == 1:
                print(f"[COMMENT] {item.doc_id} -> BLUR")
                image['isSensitive'] = True
                image['moderationReason'] = item.reason
                doc.reference.update({'image': image})
            else:
                print(f"[COMMENT] {item.doc_id}: An toan")

            processed_comments.add(item.doc_id)
        except Exception as e:
            print(f"[COMMENT] Loi apply {item.doc_id}: {e}")


def _apply_messages(message_items):
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
                if idx is None or idx >= len(media_list):
                    continue
                if item.level > 0:
                    has_violation = True
                    media_list[idx]['isSensitive'] = True
                    media_list[idx]['moderationReason'] = item.reason
                    print(f"[CHAT] {conv_id}/{msg_id} media[{idx}]: {item.reason}")
                else:
                    print(f"[CHAT] {conv_id}/{msg_id} media[{idx}]: An toan")

            if has_violation:
                print(f"[CHAT] {conv_id}/{msg_id} -> BLUR")
                msg_ref.update({'media': media_list})

            processed_messages.add(msg_id)
        except Exception as e:
            print(f"[CHAT] Loi apply {msg_id}: {e}")


def _apply_profile_media(avatar_items):
    for item in avatar_items:
        try:
            uid = item.extra['user_id']
            media_type = item.extra.get('type', 'avatar')
            label = "Anh dai dien" if media_type == 'avatar' else "Anh bia"
            cache_key = f"{uid}_{media_type}"

            if item.level > 0:
                print(f"[USER] {label} {uid} -> REMOVED: {item.reason}")
                db.collection('users').document(item.doc_id).update({
                    media_type: {'url': '', 'fileName': '', 'mimeType': '', 'size': 0}
                })
                _send_notification(
                    uid,
                    content=f"{label} cua ban da bi gỡ do: {item.reason}",
                )
            else:
                print(f"[USER] {label} {uid}: An toan")

            processed_avatars[cache_key] = item.url
        except Exception as e:
            print(f"[USER] Loi apply {media_type}: {e}")


def apply_results(items):
    """Write moderation results back to Firebase."""
    post_items = {}
    comment_items = []
    message_items = {}
    avatar_items = []

    for item in items:
        if item.source == 'post':
            post_items.setdefault(item.doc_id, []).append(item)
        elif item.source == 'comment':
            comment_items.append(item)
        elif item.source == 'message':
            key = (item.extra['conv_id'], item.doc_id)
            message_items.setdefault(key, []).append(item)
        elif item.source == 'avatar':
            avatar_items.append(item)

    _apply_posts(post_items)
    _apply_comments(comment_items)
    _apply_messages(message_items)
    _apply_profile_media(avatar_items)


# ─── MAIN LOOP ──────────────────────────────────────────────────

def mark_processed(items):
    for item in items:
        if item.source == 'post':
            processed_posts.add(item.doc_id)
        elif item.source == 'comment':
            processed_comments.add(item.doc_id)
        elif item.source == 'message':
            processed_messages.add(item.doc_id)


if __name__ == '__main__':
    print("Dang tai tat ca model...")
    load_common_models()
    load_vit_models()
    print("Tat ca model da san sang!")

    thresh, src = get_thresholds_for_variant("V7 VideoMAE-LoRA")
    print(f"V7 thresholds ({src}): V={thresh['thresh_v']:.4f} | S={thresh['thresh_s']:.4f} | N={thresh['thresh_n']:.4f}")

    print("Bat dau Worker lang nghe Firebase (Batch Mode)...")
    while True:
        try:
            t0 = time.time()

            items = collect_pending_media()
            if not items:
                time.sleep(5)
                continue

            print(f"[COLLECT] Found {len(items)} media items to process")

            download_all(items)
            downloaded = [it for it in items if it.temp_path]
            print(f"[DOWNLOAD] Downloaded {len(downloaded)}/{len(items)} files")

            process_all(downloaded)
            apply_results(downloaded)
            mark_processed(items)

            elapsed = time.time() - t0
            print(f"[DONE] Processed {len(downloaded)} items in {elapsed:.1f}s")

        except Exception as e:
            print(f"Loi vong lap: {e}")

        time.sleep(5)
