-- Phone sign-in telemetry events, feeding the error-alert digest's spike check.
-- The digest counts phone_code_verify_fail in the trailing hour and flags
-- 5 or more as a spike worth Mark's attention.
alter table public.auth_events drop constraint if exists auth_events_event_check;
alter table public.auth_events add check (event in (
  'oauth_start','oauth_authorize_ok','oauth_authorize_fail',
  'oauth_return','oauth_exchange_ok','oauth_exchange_fail',
  'oauth_fallback_redeem','email_signup_ok','email_signup_fail',
  'email_signin_ok','email_signin_fail','session_expired',
  'phone_code_sent','phone_code_verify_ok','phone_code_verify_fail'
));
alter table public.auth_events drop constraint if exists auth_events_provider_check;
alter table public.auth_events add check (provider in ('google','microsoft','azure','email','phone'));
