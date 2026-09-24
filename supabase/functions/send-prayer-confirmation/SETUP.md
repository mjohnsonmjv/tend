# Prayer-confirmation email deployment

## Security model

The database trigger sends only `prayer_id`, `issued_at`, and `dry_run:false`.
A purpose-specific HMAC signature is passed in `x-tend-signature`; the signing
key is generated and retained inside Supabase Vault. No prayer text leaves the
database for this webhook.

The Edge Function uses a Supabase-provided public key to call
`tend_prepare_prayer_confirmation`. This security-definer RPC validates the HMAC
and ten-minute request lifetime before retrieving the current recipient and
church metadata from the database. Anonymous, missing, or email-less submissions
do not send. Recipient and church values from the HTTP request are never trusted.
Database errors fail visibly rather than producing misleading generic emails.

No manually copied service-role key is needed. Keep `verify_jwt=false` because
authentication is provided by the signed webhook and the restricted RPC, not by
a user JWT. Never remove those checks. The secret key and HMAC values must not
be logged or committed.

## Deployment order

1. Apply `20260924194445_tend_prayer_confirmation_auth.sql`.
2. Deploy `index.ts` and `handler.ts` as `send-prayer-confirmation`.
3. Apply `20260924194542_tend_prayer_confirmation_trigger.sql` immediately afterward.
4. Verify unauthenticated and invalid-signature requests return 401.
5. Run a signed dry-run diagnostic. It checks database authorization, church
   lookup, and sender configuration without sending an email or disclosing data.
6. Check for any submissions during the short function/trigger cutover interval.
   Do not replay confirmations without reviewing whether delivery already occurred.
7. Send a real end-to-end test only with the owner's approval.

Required app secret: `RESEND_API_KEY`. Optional: `CONFIRM_FROM` defaults to
`Tend <support@tendpray.com>`. Supabase supplies `SUPABASE_URL` and public keys
(`SUPABASE_PUBLISHABLE_KEYS` or legacy `SUPABASE_ANON_KEY`).

Resend must have verified `tendpray.com`. The deterministic idempotency key
`tend-prayer-confirmation/<prayer ID>` protects against webhook replay within
the signed request lifetime. Automatic retries are not introduced by this change.

## Tests

```sh
node --import tsx --test tests/prayer-confirmation.test.ts
```
