# Error alerts to Mark: deployment and design notes

## What it does

Failures in the highest-signal paths log an event to `tend_alert_events`
through the `tend_log_alert_event` RPC. The RPC atomically claims a digest
slot, so Mark gets **at most one digest email per alert type per hour while
failures continue**. The digest email goes to `mrmarkjohnson@gmail.com` via
Resend, from `Tend Alerts <support@tendpray.com>`. The digest also carries the
trailing-hour count of failed phone-code verifications (from `auth_events`),
flagging 5 or more as a spike.

No scheduler is required: the digest is sent lazily by whichever function
logs the failure that claims the slot. If Resend fails during a digest send,
that hour's digest is skipped; the next failure after the throttle window
re-triggers with the full history. Events are never deleted, so nothing is
lost for forensics.

## Covered sources

- `twilio-sms-inbound`: invalid Twilio signature, signature-check exception,
  prayer save failure, unexpected `tend_sms_handle` action. Details are
  machine-readable codes only, never phone numbers or message bodies.
- `stripe-webhook`: any exception in the event handler (it still returns 200
  to Stripe so poison events are not retried forever).
- Phone sign-in: the client logs `phone_code_sent`, `phone_code_verify_ok`,
  and `phone_code_verify_fail` to the existing `auth_events` table (new events
  added by migration `20261017100003_auth_events_phone.sql`). The digest
  counts `phone_code_verify_fail` in the trailing hour.

## Deployment order

1. Apply `20261017100002_alert_events.sql` (tables + `tend_log_alert_event` RPC).
2. Apply `20261017100003_auth_events_phone.sql` (extends the `auth_events`
   check constraints; safe to apply even with existing rows).
3. Deploy the updated `twilio-sms-inbound` and `stripe-webhook` functions.
   Both need `RESEND_API_KEY` set; `twilio-sms-inbound` did not previously
   send email, so confirm the secret exists on that function. Optional:
   `ALERT_TO` (defaults to `mrmarkjohnson@gmail.com`), `ALERT_FROM`
   (defaults to `Tend Alerts <support@tendpray.com>`).
4. Deploy the web client (picks up the phone telemetry events).
5. Verify: call `tend_log_alert_event('sms_inbound_error','deploy_test')` via
   the SQL editor as service role, confirm one digest email arrives, then
   delete the test row from `tend_alert_events`.

## Deliberately left out

- **Standalone phone-spike tripwire.** Without a scheduler, a spike with no
  webhook errors would need client-triggered alert events (abusable: anyone
  can fail verifications on purpose) or polling (no infrastructure for it).
  The digest always includes the phone-failure count and spike flag, and
  Turnstile plus the 30/hour SMS cap remain the primary defense against
  SMS pumping.
- **ErrorBoundary wiring.** Render crashes are client-side with no server
  path; the boundary already shows a recoverable message. Wiring it to
  alerts would need an anon-writable endpoint, which is a spam vector.
- **Prayer-submission failures.** Web/anon submissions have no server-side
  failure signal today (validation is client-side); the inbox digest in the
  morning report covers adoption, not errors.
- **Per-recipient alert preferences.** Mark is the only recipient for v1.
- **Uptime monitor.** Already exists as a scheduled check and stays as is;
  these alerts cover application errors, not availability.
