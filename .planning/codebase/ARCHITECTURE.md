# Architecture

## High-level shape
- The repo contains a React web app, Firebase backend functions, and a separate Flutter mobile app.
- Shared business rules are expressed in TypeScript types and docs, then enforced in UI, functions, and database rules.

## Web app layers
- `src/pages/` contains page-level screens.
- `src/components/` contains reusable UI grouped by feature area.
- `src/hooks/` contains client-side behavior shared across screens.
- `src/utils/`, `src/constants/`, and `src/store/` hold support logic and app state.

## Backend shape
- `functions/src/` is organized by domain: admin, chat, friends, posts.
- Chat functions coordinate direct-message policy, block feedback, and RTDB conversation records.
- Friend suggestion logic and user-profile updates live in the friends domain.

## Data model direction
- User, post, comment, notification, and report types are centralized in `functions/src/types.ts`.
- The app uses Firestore for social content and reports, RTDB for live chat state, and Storage for files.
