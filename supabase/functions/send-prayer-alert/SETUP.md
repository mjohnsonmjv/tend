# New-prayer email alert deployment

## What it does

When a row lands in `tend_prayers`, the church owner (via `pastor_email`) and
the church's care-team members each get a short email: church name, a brief
excerpt of the request, and a link to the inbox. Anonymous requests alert the
team too: the team already sees them in the inbox, and the point of the alert
is that nothing sits unseen.

## Security model

Same as `send-prayer-confirmation`: the database trigger sends only
`prayer_id`, `issued_at`, and `dry_run:false` plus a purpose-specific HMAC in
`x-tend-signature`. The signing key (`tend_prayer_alert_signing_key`) lives in
Supabase Vault and never leaves the database. The Edge Function retrieves
recipients through the signed security-definer RPC `tend_prepare_prayer_alert`,
which also enforces the confirmed-email rule: the owner's address is included
only when the owner's auth email is confirmed and matches `pastor_email`, so a
phone-first signup can never make Tend alert a stranger. Care-team addresses
are used as entered by the church owner. No prayer text beyond a 140-character
excerpt leaves the database, and request values from the HTTP body are never
trusted.

No manually copied service-role key is needed. Keep `verify_jwt=false` because
authentication is provided by the signed webhook, not by a user JWT. Never
remove those checks. The secret key and HMAC values must not be logged or
committed.

## Deployment order

1. Apply `20261017100000_prayer_alert_auth.sql` (creates the Vault signing key
   and the `tend_prepare_prayer_alert` RPC).
2. Deploy `index.ts` and `handler.ts` as `send-prayer-alert` with
   `verify_jwt=false`.
3. Apply `20261017100001_prayer_alert_trigger.sql` (creates the trigger on
   `tend_prayers`).
4. Verify unauthenticated and invalid-signature requests return 401.
5. Run a signed dry-run diagnostic: it checks church lookup and recipient
   resolution without sending email.
6. Check for any submissions during the short function/trigger cutover interval.
7. Send a real end-to-end test only with the owner's approval.

Required app secret: `RESEND_API_KEY`. Optional: `ALERT_FROM` (defaults to
`Tend <support@tendpray.com>`), `INBOX_URL` (defaults to
`https://tendpray.com/#/app`). Supabase supplies `SUPABASE_URL` and public keys
(`SUPABASE_PUBLISHABLE_KEYS` or legacy `SUPABASE_ANON_KEY`).

Resend must have verified `tendpray.com`. The idempotency key
`tend-prayer-alert/<prayer ID>/<recipient index>` protects against webhook
replay within the signed request lifetime. Automatic retries are not introduced
by this change.

Immediate per-prayer email is the v1 design. If volume ever makes that noisy,
the follow-up is a digest: accumulate alert rows per church and send one
summary on a schedule instead of emailing per prayer.

## Tests

```sh
node --import tsx --test tests/prayer-alert.test.ts
```
