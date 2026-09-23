# Tend deployment

## Current pilot

- Website: https://tend-gilt-seven.vercel.app
- Vercel project: https://vercel.com/mjohnson-1676s-projects/tend
- Supabase project selected by the owner: https://supabase.com/dashboard/project/hvrdkrtismqbrkbmcgne

The initial website was deployed directly with the Vercel CLI. On September 23, 2026, the existing Vercel project was connected to https://github.com/mjohnsonmjv/tend. The owner's Vercel account-level GitHub connection was changed to `mjohnsonmjv` with approval. The site is marked noindex. No custom-domain changes were made.

## Architecture

The Vite/React frontend is hosted on Vercel. Supabase Auth handles email/password authentication. Supabase Postgres persists churches, prayer requests, and pastoral notes. Private data access uses the signed-in user's JWT and row-level security.

The browser contains only the Supabase publishable key. No service-role key, database password, Stripe secret, or Twilio token is shipped to the client.

The local Express/SQLite code is legacy prototype code and is excluded from Vercel uploads. It is not the deployed backend. Vercel uses `vercel.json`: Vite build, output directory `dist/public`. Git pushes can trigger deployment; confirm the project's production branch before pushing changes. For manual CLI deployment, use the installed `vercel` CLI and the intended team's authorized integration.

## Access rules

- A verified pastor account can create a church owned by that account.
- Only its owner can select the church's private details and prayer requests.
- Only status and pastoral-note columns are editable on requests by the authenticated client.
- Billing fields and church ownership cannot be changed by the browser client.
- Public visitors can retrieve only the church's name, slug, pastor display name, and greeting.
- Public submissions are accepted through a narrow, server-validated RPC. Visitors cannot read the saved request record.
- Anonymous submissions discard name and phone at the database boundary.
- Submission keys prevent duplicate inserts on retries.
- A honeypot and per-church volume ceiling are included. CAPTCHA and more granular abuse protection remain pre-launch work.

Supabase's advisor flags the two intentionally public SECURITY DEFINER functions. Both have fixed search paths, narrow signatures, and constrained outputs. These warnings are intentional, not a substitute for a broader security review:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Verified on the selected backend

- Real Supabase password login through the deployed Vercel UI.
- Authenticated church creation and QR generation.
- Public prayer submission without a congregation account.
- Prayer status and private notes saved across a fresh login session.
- Anonymous direct reads denied.
- A second test account could neither read nor update the first church's requests.
- Client-supplied paid-plan changes denied.
- Anonymous identifying fields removed; submitting the same key twice created one record.
- Invalid short messages rejected.

Fictional QA accounts and data were removed from the selected project after these tests.

## Current boundaries

- Auth sessions are in memory. Refreshing or closing the page requires another sign-in; database data persists.
- Site URL was saved to the Vercel address. A redirect-allowlist entry was submitted, but its saved state needs rechecking after the local browser disconnected.
- Public email verification delivery has not been tested. Confirm SMTP configuration and email templates before external church onboarding.
- Password recovery, team invitations, account deletion, data-retention controls, CAPTCHA, and production privacy/terms review remain launch work.
- Stripe account access is live-mode only. No products, prices, live charges, subscriptions, or runtime billing credentials were configured. Pricing remains proposed.
- A dedicated Tend messaging number has not been purchased. Unrelated messaging accounts and numbers must not be repurposed.
- SMS, urgent alerts, and automated email digests are not active.
- tend.faith has not been connected to Vercel.

## Infrastructure cleanup

A superseded backend may still need owner-approved cleanup. Its identifiers and billing details are retained in the private agent handoff, not this public repository. Do not pause or delete infrastructure without confirming ownership, migration status, and explicit approval.
