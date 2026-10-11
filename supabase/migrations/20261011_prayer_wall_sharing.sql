-- Prayer wall sharing (Mark's decision 2026-10-11):
-- auto-publish (no pastor pre-approval); profanity bot filters at submit time.

-- Drop the forcing constraint that made every prayer private.
-- Auto-generated name is tend_prayers_is_private_check; IF EXISTS keeps this safe.
alter table public.tend_prayers
  drop constraint if exists tend_prayers_is_private_check;

-- New submissions via tend_submit_prayer are shared by default (auto-publish).
-- Existing rows keep their current is_private value.
alter table public.tend_prayers
  alter column is_private set default false;

-- Display-only wall feed. SECURITY DEFINER so anonymous visitors can read
-- shared prayers without direct table access. Exposes ONLY safe columns:
-- never email, phone, photo, pastor notes, or submission keys.
create or replace function public.get_shared_prayers(p_slug text)
returns table (
  id bigint,
  message text,
  category text,
  is_anonymous boolean,
  submitter_name text,
  created_at timestamptz,
  pray_count bigint
)
language sql stable security definer
set search_path = public
as $$
  select
    p.id,
    p.message,
    p.category,
    p.is_anonymous,
    case when p.is_anonymous then null else p.submitter_name end,
    p.created_at,
    (select count(*) from tend_prayer_prays pp where pp.prayer_id = p.id)
  from tend_prayers p
  join tend_churches c on c.id = p.church_id
  where c.slug = p_slug
    and p.is_private = false
  order by p.created_at desc
  limit 100;
$$;

revoke all on function public.get_shared_prayers(text) from public;
grant execute on function public.get_shared_prayers(text) to anon, authenticated;

-- Prepares a "someone prayed" notification. Called by the send-prayed-notification
-- edge function. Enforces: prayer is shared, requester not anonymous, requester
-- gave an email, and no notification sent in the last 24h (throttle).
-- Atomically stamps last_pray_notification_at so concurrent taps send only one email.
-- Returns zero rows when the notification should be skipped.
create or replace function public.tend_prepare_prayed_notification(p_prayer_id bigint)
returns table (send_to text, church_name text, pray_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_church text;
  v_count bigint;
begin
  select p.submitter_email, c.name
    into v_email, v_church
  from tend_prayers p
  join tend_churches c on c.id = p.church_id
  where p.id = p_prayer_id
    and p.is_private = false
    and p.is_anonymous = false
    and p.submitter_email is not null
    and char_length(p.submitter_email) between 3 and 254
    and (p.last_pray_notification_at is null
         or p.last_pray_notification_at < now() - interval '24 hours')
  for update of p skip locked;

  if v_email is null then
    return;
  end if;

  update tend_prayers
  set last_pray_notification_at = now()
  where id = p_prayer_id;

  select count(*) into v_count
  from tend_prayer_prays
  where prayer_id = p_prayer_id;

  return query select v_email, v_church, v_count;
end;
$$;

revoke all on function public.tend_prepare_prayed_notification(bigint) from public;
-- Only the edge function (service role) calls this; no direct grants.
