# Tend Prayer (mobile)

Church-team app for Tend: prayer inbox, pray mode, and push notifications for new prayer requests. Built with Expo (TypeScript + Expo Router), talking to the same Supabase project as the web app. No new backend.

Submitters never need this app. The QR code keeps opening the mobile website. This split is permanent.

## Status

Scaffold. Not built for stores, not submitted anywhere.

## Setup

1. Copy `.env.example` to `.env` and fill in the Supabase URL and publishable key (same project as the web app).
2. `npm install`
3. `npx expo start`, then run on a development build (push notifications, secure storage, and OAuth all need a dev build, not Expo Go).

## Still to do (needs Mark)

- **Supabase redirect URL:** add `tendpray://auth/callback` to Supabase Auth > URL Configuration > Redirect URLs, or Google/Microsoft sign-in will fail after the browser step.
- **Microsoft sign-in:** the Azure app registration is not finished yet, so the Microsoft button will error until then. Google works now.
- **`eas init`:** creates the EAS project and fills `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env`. Required before push token registration works.
- **Apply the migration:** `supabase/migrations/20260930_device_tokens.sql` is written but not applied. Review, then `supabase db push` from `~/workspace/tend`.
- **Deploy the push function:** `supabase/functions/prayer-push/index.ts` is a stub. Finish it, wire a Database Webhook on `tend_prayers` inserts, then `supabase functions deploy prayer-push`.
- **Apple Developer Program** ($99/year) and EAS build profiles before TestFlight.

## What is scaffolded

- `src/app/login.tsx`: Google and Microsoft sign-in via `expo-auth-session` + PKCE, session in SecureStore (Keychain/Keystore).
- `src/app/(app)/inbox.tsx`: church switcher, status filters, prayer request list reading `tend_prayers` (RLS respected), pull to refresh.
- `src/app/(app)/request/[id].tsx`: request detail, status changes, private care notes.
- `src/app/(app)/pray.tsx`: placeholder for the one-button pray voice loop (spec: `specs/one-button-pray.md`).
- `src/lib/notifications.ts`: permission flow (asked after first inbox view, not on launch) and push token registration into `device_tokens`.
- `app.json`: app name "Tend Prayer", scheme `tendprayer`, microphone usage copy, notification plugin.

## Checks

- `npx tsc --noEmit` must pass before calling anything done.
- Never commit `.env`. Never run `eas build` without Mark's Apple credentials on hand.
