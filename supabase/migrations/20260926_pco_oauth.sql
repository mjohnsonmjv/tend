-- Single-use CSRF states for the Planning Center OAuth login flow.
create table if not exists public.pco_oauth_states (
  state text primary key,
  created_at timestamptz not null default now()
);

alter table public.pco_oauth_states enable row level security;
-- No anon/authenticated policies: only the service role (edge functions) touches this table.
