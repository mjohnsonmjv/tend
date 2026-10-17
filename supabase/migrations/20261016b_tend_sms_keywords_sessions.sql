-- Keyword + conversation flow for text-in prayers (applied to production 2026-10-16).
-- Text a church keyword (e.g. PRAY) or a church's own number -> "How can we pray for you?"
-- -> the next text is saved privately to that church's inbox.
alter table public.tend_churches add column if not exists sms_keyword text;
create unique index if not exists tend_churches_sms_keyword_key on public.tend_churches (upper(sms_keyword)) where sms_keyword is not null;
alter table public.tend_churches add constraint tend_churches_sms_keyword_format check (sms_keyword is null or sms_keyword ~ '^[A-Za-z0-9]{3,20}$');
create table if not exists public.tend_sms_sessions (
  phone text not null, tend_number text not null,
  church_id bigint not null references public.tend_churches(id) on delete cascade,
  awaiting_request boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (phone, tend_number));
alter table public.tend_sms_sessions enable row level security;
revoke all on public.tend_sms_sessions from anon, authenticated;
drop function if exists public.tend_sms_submit_prayer(text,text,text,text);
-- tend_sms_handle(p_to, p_from, p_body, p_message_sid): see production definition (pg_get_functiondef).
-- Returns {action: prompt|saved|duplicate|ignored|rate_limited, church}. Server-only (service_role).
update public.tend_churches set sms_keyword = 'PRAY' where slug = 'tend-text-line';
