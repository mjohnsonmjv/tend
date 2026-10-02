-- Auth telemetry for troubleshooting sign-in issues at scale.
-- Append-only event log. No PII: never store emails, codes, verifiers,
-- tokens, or user IDs here — only event names, platform/flow metadata,
-- machine-readable error codes, and timings.
create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null check (event in (
    'oauth_start','oauth_authorize_ok','oauth_authorize_fail',
    'oauth_return','oauth_exchange_ok','oauth_exchange_fail',
    'oauth_fallback_redeem','email_signup_ok','email_signup_fail',
    'email_signin_ok','email_signin_fail','session_expired'
  )),
  provider text check (provider in ('google','microsoft','azure','email')),
  platform text check (platform in ('ios','android','desktop')),
  flow text check (flow in ('popup','solo')),
  error_code text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  app_version text
);
alter table public.auth_events enable row level security;
-- Anonymous clients may append events but never read them.
drop policy if exists "auth_events_anon_insert" on public.auth_events;
create policy "auth_events_anon_insert" on public.auth_events
  for insert to anon with check (true);
-- No SELECT policy for anon: reads are denied by default.
-- Service role retains full access for dashboards and debugging.
create index if not exists auth_events_created_at_idx
  on public.auth_events (created_at desc);
create index if not exists auth_events_event_idx
  on public.auth_events (event);
