-- "I prayed" closed loop: congregants tap to mark they prayed for a shared request.
-- Only pastor-approved (is_private = false) prayers can receive prays.

create table tend_prayer_prays (
  id uuid primary key default gen_random_uuid(),
  prayer_id bigint not null references tend_prayers(id) on delete cascade,
  church_id bigint not null references tend_churches(id) on delete cascade,
  prayed_at timestamptz not null default now()
);

create index tend_prayer_prays_prayer_id_idx on tend_prayer_prays(prayer_id);

-- Track last "someone prayed" notification to avoid spamming the requester.
alter table tend_prayers add column last_pray_notification_at timestamptz;

-- Record a pray. SECURITY DEFINER so the public wall can call it without
-- direct table access. Refuses private (pastor-only) prayers.
create or replace function record_prayer_pray(p_prayer_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church_id bigint;
  v_count integer;
begin
  select church_id into v_church_id
  from tend_prayers
  where id = p_prayer_id and is_private = false;

  if v_church_id is null then
    raise exception 'Prayer not found or not shared';
  end if;

  insert into tend_prayer_prays (prayer_id, church_id)
  values (p_prayer_id, v_church_id);

  select count(*) into v_count
  from tend_prayer_prays
  where prayer_id = p_prayer_id;

  return v_count;
end;
$$;
