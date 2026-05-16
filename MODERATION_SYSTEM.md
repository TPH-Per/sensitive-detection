# Smurfy Content Moderation System — Technical Spec

## Overview

Three-layer moderation system:
1. **AI Worker** (Python/Colab) — automatic detection via ML models
2. **Firebase Cloud Functions** — report handling, admin actions
3. **Frontend UI** — blur overlays, admin dashboard, reporting

---

## 1. Moderation Flow

```
User upload media → Firebase Storage → Firestore/RTDB (isSensitive=false)
                                              ↓
                              Colab Worker polls every 5 seconds
                                              ↓
                          ┌──────────────────────────────────────────┐
                          │ Images → ViT batch (violence + NSFW)     │
                          │ Videos → V7 VideoMAE-LoRA (V + N heads)  │
                          └──────────────────────────────────────────┘
                                              ↓
                              Level 0: Safe → no action
                              Level 1: BLUR → set isSensitive=true on media
                              Level 2: BAN → set status=policy_violation + isSensitive=true
                              Avatar: any level > 0 → delete avatar + send notification
                                              ↓
                          Frontend reads isSensitive → shows blur overlay
                          Frontend reads status → hides post (policy_violation) or shows normally (active)
```

---

## 2. Moderation Levels

### Level 0 — Safe
- No fields modified
- Media displays normally

### Level 1 — Blur (low-confidence violation)
- `media[idx].isSensitive = true`
- `media[idx].moderationReason = "Phát hiện nội dung: ..."`
- Post/comment/message `status` stays `"active"`
- Frontend shows blur overlay with "Xem nội dung" button

### Level 2 — Ban (high-confidence violation)
- `media[idx].isSensitive = true`
- `media[idx].moderationReason = "Phát hiện nội dung: ..."`
- **Post/Comment**: `status = "policy_violation"`, `moderationReason` set on document
- **Chat messages**: ONLY blur (`isSensitive=true`), NEVER delete or change status
- **Avatar**: deleted entirely (`url = ""`), notification sent to user

---

## 3. Database Fields

### Firestore — Posts

| Field | Type | Values | Set By |
|---|---|---|---|
| `status` | string | `"active"` / `"deleted"` / `"policy_violation"` | Worker (policy_violation), Cloud Functions (deleted) |
| `moderationReason` | string | `"Phát hiện nội dung: ..."` | Worker |
| `media[].isSensitive` | boolean | `true` / `false` | Worker |
| `media[].moderationReason` | string | reason per media item | Worker |
| `media[].url` | string | Firebase Storage URL | Frontend (upload) |
| `media[].mimeType` | string | `"image/jpeg"`, `"video/mp4"`, etc. | Frontend (upload) |

### Firestore — Comments

| Field | Type | Values | Set By |
|---|---|---|---|
| `status` | string | `"active"` / `"deleted"` / `"policy_violation"` | Worker |
| `moderationReason` | string | reason | Worker |
| `image.isSensitive` | boolean | `true` / `false` | Worker |
| `image.moderationReason` | string | reason | Worker |

### RTDB — Chat Messages (`messages/{convId}/{msgId}`)

| Field | Type | Values | Set By |
|---|---|---|---|
| `media[].isSensitive` | boolean | `true` / `false` | Worker |
| `media[].moderationReason` | string | reason | Worker |

> **IMPORTANT**: Chat messages are ONLY blurred, NEVER deleted or status-changed.
> The worker sets `isSensitive=true` on individual media items but does NOT
> modify the message status or remove messages.

### Firestore — Users (Avatar)

| Field | Type | Values | Set By |
|---|---|---|---|
| `avatar.url` | string | `""` (deleted on violation) | Worker |
| `avatar.fileName` | string | `""` | Worker |
| `avatar.mimeType` | string | `""` | Worker |
| `avatar.size` | number | `0` | Worker |

---

## 4. AI Models

### Image Moderation (ViT)
- **Violence**: `jaranohaal/vit-base-violence-detection` (ViT-B/16, key remapping required)
- **NSFW**: `AdamCodd/vit-base-nsfw-detector` (ViT-B/16, HuggingFace pipeline)
- Processing: batch inference (batch_size=8)
- Thresholds: NSFW ban=0.90, Violence ban=0.80, blur=0.60

### Video Moderation (V7 VideoMAE-LoRA)
- **Backbone**: `MCG-NJU/videomae-small-finetuned-ssv2` + LoRA adapters
- **Branches**: Violence (V), NSFW (N) — Self-harm (S) DISABLED (always 0)
- **Modalities**: CLIP, Flow, Gore, NSFW — YOLO DISABLED (always 0), SelfHarm DISABLED
- **Thresholds** (from `calibration_v7.json`):
  - Violence: 0.9136
  - Self-harm: 0.995 (disabled, never triggers)
  - NSFW: 0.999

### Disabled Components
- **YOLO**: `run_yolo_with_details()` returns zeros
- **Self-harm**: `s_prob = 0.0`, `s_attn = zeros` in both V6 and V7 paths

---

## 5. Worker Architecture (colab_worker.py)

### 5 Phases
1. **Collect**: Scan last 15 posts, 15 comments, 10 msgs/conv, all avatars
2. **Download**: Parallel downloads via ThreadPoolExecutor (4 workers)
3. **Inference**: Images batched (ViT), videos sequential (V7 VideoMAE-LoRA)
4. **Apply Results**: Write moderation fields back to Firebase
5. **Mark Processed**: Track processed items to avoid re-checking

### Processing Logic

**Posts:**
```
For each media in post:
    if image → ViT batch inference
    if video → V7 VideoMAE-LoRA

    Level 1 → media.isSensitive = true
    Level 2 → post.status = "policy_violation" + media.isSensitive = true
```

**Comments:**
```
if image → ViT batch inference (single image)
if video → V7 VideoMAE-LoRA

Level 1 → comment.image.isSensitive = true
Level 2 → comment.status = "policy_violation" + comment.image.isSensitive = true
```

**Chat Messages:**
```
For each media in message:
    if image → ViT batch inference
    if video → V7 VideoMAE-LoRA

Any violation → media.isSensitive = true (BLUR ONLY, NO DELETE)
```

**Avatars:**
```
if image → ViT batch inference

Any violation → delete avatar (url="") + send notification
```

---

## 6. Frontend Display

### Web (React) — SensitiveMediaGuard
- Wraps media content
- When `isSensitive=true`: blur-2xl + dark overlay + "Nội dung nhạy cảm" warning
- User can click "Xem nội dung" to reveal, "Ẩn" to re-blur
- Used in: PostMediaGrid, PostViewModal, CommentItem, PhotosTab, ProfileMediaPreview, MediaViewer
- **NOT used in**: ImageMessage.tsx (chat images — gap)

### Mobile (Flutter) — SensitiveImageWrapper
- Pixelated frosted overlay (20x20 pixel resize + dark overlay)
- Shows `moderationReason` text if present
- "Xem ảnh gốc" button to reveal
- Used in: post images, comment images, chat images, cover photo

### Avatar Blur
- Web: `blur-sm` / `blur-md` CSS directly on `<img>`
- Mobile: `BackdropFilter` with Gaussian blur (sigmaX: 10, sigmaY: 10)

---

## 7. Frontend Enums

### Web (shared/types.ts)
```typescript
export enum PostStatus {
    ACTIVE = "active",
    DELETED = "deleted",
    // NOTE: "policy_violation" is set by worker but NOT in enum
    // Posts with this status are excluded from queries silently
}

export enum CommentStatus {
    ACTIVE = "active",
    DELETED = "deleted",
    // Same issue — "policy_violation" not in enum
}
```

### Mobile (enums.dart)
```dart
enum PostStatus {
    active, deleted, policyViolation;  // ✅ Has policy_violation
}
enum CommentStatus {
    active, deleted, policyViolation;  // ✅ Has policy_violation
}
```

---

## 8. Known Gaps & TODOs

### Critical
- [ ] Web: Add `POLICY_VIOLATION` to `PostStatus` and `CommentStatus` enums
- [ ] Web: Add `SensitiveMediaGuard` to `ImageMessage.tsx` for chat images
- [ ] Web: Display `moderationReason` to content author when post is banned
- [ ] Worker: Send notification when post/comment is banned (currently only avatar gets notification)

### Important
- [ ] Web: Show policy violation banner for posts (like Flutter's red banner)
- [ ] Web: Show policy violation banner for comments
- [ ] Admin: Add "AI Moderation" tab showing blur/ban stats, false positive rate
- [ ] Admin: Allow reverting moderation decisions (set status back to "active")

### Nice to Have
- [ ] Appeal mechanism (user can contest false positives)
- [ ] Pre-upload moderation warning for chat images (like avatar/cover)
- [ ] Standardize blur style across web and mobile
- [ ] Configurable thresholds per community/tenant

---

## 9. Security Rules

### Firestore
- `isNotBanned()`: checks `user.status == 'active'` — required for read/write
- `isAdmin()`: checks `role == 'admin'`, `status == 'active'`, email verified
- Posts: author can update but NOT change `status` field
- Reports: any non-banned user can create; only admin or reporter can read

### RTDB
- Messages: conversation members can write
- Sender can recall own messages within 5 minutes
- No content-level moderation rules

### Storage
- Avatars: 5MB max, images only
- Posts: 50MB max, images + videos
- Comments: 5MB max
- Chat: varies by type
