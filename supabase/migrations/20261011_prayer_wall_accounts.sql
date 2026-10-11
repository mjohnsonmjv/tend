-- Prayer wall "I prayed" with accounts (Mark's decision 2026-10-11):
-- taps require a Tend account; one tap per user per prayer (idempotent).

-- Track which user prayed. Nullable for the pre-account era rows (none exist yet,
-- but keeps the migration safe if any anonymous prays were recorded).
alter table public.tend_prayer_prays
  add column user_id uuid references auth.users(id) on delete cascade;

-- One tap per user per prayer: the idempotency key.
create unique index tend_prayer_prays_prayer_user_uidx
  on public.tend_prayer_prays(prayer_id, user_id);

-- Users can read their own pray taps (so the wall can show "Amen" state on reload).
alter table public.tend_prayer_prays enable row level security;
drop policy if exists tend_prayer_prays_read_own on public.tend_prayer_prays;
create policy tend_prayer_prays_read_own on public.tend_prayer_prays
  for select to authenticated
  using (user_id = auth.uid());

-- record_prayer_pray now requires a signed-in user and upserts for idempotency.
-- Returns the pray count. Raises if not signed in or prayer is not shared.
create or replace function public.record_prayer_pray(p_prayer_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_church_id bigint;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Sign in to mark that you prayed';
  end if;

  select church_id into v_church_id
  from tend_prayers
  where id = p_prayer_id and is_private = false;

  if v_church_id is null then
    raise exception 'Prayer not found or not shared';
  end if;

  insert into tend_prayer_prays (prayer_id, church_id, user_id)
  values (p_prayer_id, v_church_id, v_user_id)
  on conflict (prayer_id, user_id) do nothing;

  select count(*) into v_count
  from tend_prayer_prays
  where prayer_id = p_prayer_id;

  return v_count;
end;
$$;

revoke all on function public.record_prayer_pray(bigint) from public;
grant execute on function public.record_prayer_pray(bigint) to authenticated;
