-- Nurture leads: email addresses captured from the demo prayer page
-- (and abandoned checkouts) for the Tend email nurture sequence.
create table if not exists public.nurture_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'demo',
  church_id integer references public.tend_churches(id) on delete set null,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unsub_token uuid not null default gen_random_uuid(),
  emails_sent integer not null default 0
);

create unique index if not exists nurture_leads_email_unique on public.nurture_leads (lower(email));

alter table public.nurture_leads enable row level security;
-- No anon/authenticated policies: only the service role (edge functions) touches this table.
