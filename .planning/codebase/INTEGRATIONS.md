# Integrations

## Firebase
- Auth for sign-in/session flows
- Firestore for core social data and reports
- Realtime Database for chat state, presence, typing, and user chat indexes
- Storage for media uploads
- FCM for notifications
- Cloud Functions for server-side moderation, chat guards, and suggestions

## Chat / calling
- ZegoCloud for RTC calls
- Callable function `validateDirectMessageSend` enforces direct-message policy before send
- Chat helpers block disallowed direct messages and can append system feedback

## Moderation / admin
- Report resolution and ban flows run through functions under `functions/src/admin/`
- Report schema and labels are documented in `docs/report_database.md`

## Mobile/web alignment
- Flutter app mirrors the web feature set with its own Firebase client layer and shared domain concepts
