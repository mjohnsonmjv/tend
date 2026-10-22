-- First-party site events (2026-10-22): the traffic data behind product
-- decisions lives in our own database, queryable any time, instead of only
-- inside GA4. Privacy rules mirror the GA rules: anonymous counts and page
-- paths only. Never prayer text, names, emails, phone numbers, or any
-- pastoral-care content. IP addresses are stored only as a salted hash, used
-- solely for write throttling.
--
-- Writes go through tend_log_site_event (security definer) so anonymous
-- visitors can insert events but nobody can read the table except the
-- service role.

create table if not exists public.tend_site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type text not null check (type in ('page_view', 'not_found')),
  path text not null check (char_length(path) <= 200),
  slug text check (char_length(slug) <= 60),
  referrer_host text check (char_length(referrer_host) <= 120),
  utm_source text check (char_length(utm_source) <= 80),
  utm_medium text check (char_length(utm_medium) <= 80),
  utm_campaign text check (char_length(utm_campaign) <= 80),
  device text check (device in ('mobile', 'desktop')),
  session_id uuid,
  ip_hash text
);

create index if not exists tend_site_events_created_idx on public.tend_site_events (created_at desc);
create index if not exists tend_site_events_type_path_idx on public.tend_site_events (type, path);

alter table public.tend_site_events enable row level security;
-- No policies: anon/authenticated cannot touch the table directly. The RPC
-- below (security definer) is the only write path; the service role reads.

create or replace function public.tend_log_site_event(
  p_type text,
  p_path text,
  p_slug text default null,
  p_referrer_host text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_device text default null,
  p_session_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
  v_ip_hash text;
  v_recent int;
begin
  if p_type not in ('page_view', 'not_found') then
    raise exception 'unknown event type';
  end if;
  if p_path is null or left(p_path, 1) <> '/' then
    raise exception 'path must start with /';
  end if;

  -- Caller IP from the PostgREST request headers, hashed with a static salt.
  -- Used only to throttle floods; never stored raw, never linked to a person.
  begin
    v_ip := coalesce(
      nullif(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), ''),
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip'
    );
  exception when others then
    v_ip := null;
  end;
  if v_ip is not null then
    v_ip_hash := encode(sha256(('tend-events:' || v_ip)::bytea), 'hex');
    select count(*) into v_recent
      from public.tend_site_events
     where ip_hash = v_ip_hash and created_at > now() - interval '1 hour';
    if v_recent >= 180 then
      return; -- silently drop floods
    end if;
  end if;

  insert into public.tend_site_events (
    type, path, slug, referrer_host, utm_source, utm_medium, utm_campaign,
    device, session_id, ip_hash
  ) values (
    p_type,
    left(split_part(p_path, '?', 1), 200),
    nullif(left(coalesce(p_slug, ''), 60), ''),
    nullif(left(coalesce(p_referrer_host, ''), 120), ''),
    nullif(left(coalesce(p_utm_source, ''), 80), ''),
    nullif(left(coalesce(p_utm_medium, ''), 80), ''),
    nullif(left(coalesce(p_utm_campaign, ''), 80), ''),
    case when p_device in ('mobile', 'desktop') then p_device end,
    p_session_id,
    v_ip_hash
  );
end;
$$;

grant execute on function public.tend_log_site_event(
  text, text, text, text, text, text, text, text, uuid
) to anon, authenticated;
