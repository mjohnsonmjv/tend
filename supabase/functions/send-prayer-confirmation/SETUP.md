# Prayer-confirmation email setup

The code is done. Three deployment steps remain, all one-time.

## 1. Apply the database migration

In the Supabase dashboard for project `hvrdkrtismqbrkbmcgne`, open the SQL
editor and run `supabase/migrations/20260923_prayer_email.sql`.

This adds an optional `p_email` parameter to `tend_submit_prayer` and stores
it in `tend_prayers.submitter_email`. Anonymous submissions still store no
contact details (enforced by the existing check constraint).

## 2. Create a Resend account and API key

1. Sign up at resend.com and verify the `tendpray.com` domain (add the DNS
   records Resend provides).
2. Create an API key and keep it server-side only.

## 3. Deploy the edge function and wire the webhook

```bash
supabase functions deploy send-prayer-confirmation --no-verify-jwt
supabase secrets set RESEND_API_KEY=... CONFIRM_FROM="Tend <hello@tendpray.com>" \
  SUPABASE_URL=https://hvrdkrtismqbrkbmcgne.supabase.co SUPABASE_SERVICE_ROLE_KEY=...
```

Then in the Supabase dashboard: Database > Webhooks > Create webhook,
- table: `public.tend_prayers`, events: INSERT,
- filter: `submitter_email is not null`,
- URL: the deployed function URL.

## Privacy notes

- Confirmation emails never include the prayer message text.
- No email is sent for anonymous submissions or the demo form.
- The sender address must be a verified domain in Resend before real sends.
