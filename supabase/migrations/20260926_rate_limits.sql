-- IP rate limiting for public edge functions (e.g. capture-lead).
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 1
);

alter table public.rate_limits enable row level security;
-- No anon/authenticated policies: only the service role (edge functions) touches this table.
