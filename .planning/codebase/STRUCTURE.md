# Structure

## Top level
- `src/` — web application source
- `functions/` — Firebase Cloud Functions source
- `docs/` — product and schema documentation
- `klcn/` — Flutter mobile app
- `shared/` — shared types and assets used by the repo
- `test/` — Flutter tests

## Web app structure
- `src/pages/` — screen components such as login, feed, profile, settings, admin, and notifications
- `src/components/` — feature UI for chat, feed, contacts, profile, admin, layout, shared UI
- `src/hooks/` — reusable client hooks
- `src/assets/` — static assets

## Functions structure
- `functions/src/admin/` — moderation/admin actions
- `functions/src/chat/` — direct-message policy and validation
- `functions/src/friends/` — friend suggestion and profile sync logic
- `functions/src/posts/` — post-related triggers
- `functions/src/types.ts` — domain types and enums
- `functions/src/app.ts` — Firebase service setup
