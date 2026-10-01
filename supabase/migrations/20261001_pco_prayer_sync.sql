-- Tend -> Planning Center prayer-request sync.
-- Each new tend_prayers row becomes a Workflow Card (with the prayer text as a
-- card note) in the church's chosen PCO People workflow.
--
-- Tables below are service-role only (RLS enabled, no client policies).
-- Tokens are stored here; for hardened deployments move them to the Vault
-- (supabase/vault) instead of plain columns.

-- One PCO connection per church. Tokens come from the "Connect Planning
-- Center" flow (GET /functions/v1/pco-prayer-sync/connect); the login-only
-- pco-oauth flow intentionally discards tokens and is untouched.
create table if not exists public.pco_church_connections (
  church_id bigint primary key references public.tend_churches(id) on delete cascade,
  pco_organization_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  -- Church's chosen PCO People workflow for new prayer cards (set in Tend settings).
  workflow_id text,
  -- Optional PCO note category; when set, card notes also create profile notes.
  note_category_id text,
  -- Lazily created "Tend Prayer Requests" PCO person for anonymous/unmatched requests.
  fallback_person_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pco_church_connections enable row level security;
revoke all on public.pco_church_connections from anon, authenticated;

-- Single-use CSRF states for the PCO connect flow (separate from the login flow).
create table if not exists public.pco_connect_states (
  state text primary key,
  church_id bigint not null references public.tend_churches(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.pco_connect_states enable row level security;
revoke all on public.pco_connect_states from anon, authenticated;

-- Sync ledger: one row per prayer request, makes the sync idempotent.
create table if not exists public.pco_prayer_syncs (
  prayer_request_id bigint primary key references public.tend_prayers(id) on delete cascade,
  church_id bigint not null references public.tend_churches(id) on delete cascade,
  pco_card_id text,
  pco_note_id text,
  pco_person_id text,
  status text not null default 'pending'
    check (status in ('pending','synced','not_configured','error')),
  error text,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pco_prayer_syncs_church_idx
  on public.pco_prayer_syncs(church_id, status);
alter table public.pco_prayer_syncs enable row level security;
revoke all on public.pco_prayer_syncs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Automatic trigger (NOT applied here): creating a Database Webhook on
-- tend_prayers INSERT requires the database password or the Supabase dashboard
-- (Database > Webhooks), which this migration cannot do.
--
-- Dashboard setup, once:
--   1. Table: tend_prayers, Events: Insert
--   2. Type: HTTP Request, Method: POST
--   3. URL: https://<project-ref>.supabase.co/functions/v1/pco-prayer-sync
--   4. HTTP Headers: add  x-tend-hook-secret: <value of PCO_SYNC_HOOK_SECRET>
--      (set it first:  supabase secrets set PCO_SYNC_HOOK_SECRET=$(openssl rand -hex 32)
--       then redeploy this function)
--   5. The function is idempotent: re-deliveries return { deduped: true }.
--
-- Until the webhook exists, pastors can sync from Tend settings via
-- POST { action: "sync_pending", church_id } with their JWT.
-- ---------------------------------------------------------------------------
