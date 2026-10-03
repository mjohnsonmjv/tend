-- 24/7 prayer watch ministry: churches define a prayer watch (a date range or
-- ongoing), each day split into 96 fifteen-minute slots. Congregants sign up
-- for slots from a public frictionless page; the pastor sees per-day coverage.
--
-- Apply in the Supabase SQL editor (Management API token unavailable).

-- ---------------------------------------------------------------- watches
create table public.tend_prayer_watches (
  id bigint generated always as identity primary key,
  church_id bigint not null references public.tend_churches(id) on delete cascade,
  title text not null,
  description text,
  slug text not null,
  start_date date not null,
  -- null end_date = ongoing ministry; slots are generated on a rolling horizon.
  end_date date,
  slot_minutes int not null default 15 check (slot_minutes in (15, 30, 60)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (church_id, slug),
  check (end_date is null or end_date >= start_date)
);
create index tend_watch_church_idx on public.tend_prayer_watches(church_id);
alter table public.tend_prayer_watches enable row level security;
revoke all on public.tend_prayer_watches from anon, authenticated;
grant select, insert, update, delete on public.tend_prayer_watches to authenticated;
create policy tend_watch_owner_all on public.tend_prayer_watches for all to authenticated
  using (exists(select 1 from public.tend_churches c where c.id = church_id and c.owner_id = (select auth.uid())))
  with check (exists(select 1 from public.tend_churches c where c.id = church_id and c.owner_id = (select auth.uid())));

-- ------------------------------------------------------------------ slots
create table public.tend_prayer_watch_slots (
  id bigint generated always as identity primary key,
  watch_id bigint not null references public.tend_prayer_watches(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  signup_name text,
  signup_email text,
  signup_phone text,
  signed_up_at timestamptz,
  -- Idempotency / cancellation key handed to the signup confirmation.
  signup_key uuid,
  unique (watch_id, starts_at),
  check (ends_at > starts_at)
);
create index tend_watch_slot_day_idx on public.tend_prayer_watch_slots(watch_id, starts_at);
alter table public.tend_prayer_watch_slots enable row level security;
revoke all on public.tend_prayer_watch_slots from anon, authenticated;
grant select on public.tend_prayer_watch_slots to authenticated;
create policy tend_watch_slot_owner_read on public.tend_prayer_watch_slots for select to authenticated
  using (exists(
    select 1 from public.tend_prayer_watches w
    join public.tend_churches c on c.id = w.church_id
    where w.id = watch_id and c.owner_id = (select auth.uid())));

-- ----------------------------------------------------------------- invites
create table public.tend_prayer_watch_invites (
  id bigint generated always as identity primary key,
  watch_id bigint not null references public.tend_prayer_watches(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (watch_id, email)
);
alter table public.tend_prayer_watch_invites enable row level security;
revoke all on public.tend_prayer_watch_invites from anon, authenticated;
grant select, insert, update, delete on public.tend_prayer_watch_invites to authenticated;
create policy tend_watch_invite_owner_all on public.tend_prayer_watch_invites for all to authenticated
  using (exists(
    select 1 from public.tend_prayer_watches w
    join public.tend_churches c on c.id = w.church_id
    where w.id = watch_id and c.owner_id = (select auth.uid())))
  with check (exists(
    select 1 from public.tend_prayer_watches w
    join public.tend_churches c on c.id = w.church_id
    where w.id = watch_id and c.owner_id = (select auth.uid())));

-- ------------------------------------------------------- slot generation
-- Generate slots for a watch between two dates (inclusive). Safe to re-run:
-- existing slots are left untouched.
create function public.tend_generate_watch_slots(p_watch_id bigint, p_from date, p_to date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  d date;
  n int;
  slot_ts timestamptz;
  slots_per_day int;
  created int := 0;
begin
  select * into w from public.tend_prayer_watches where id = p_watch_id;
  if not found then raise exception 'Watch not found'; end if;
  -- Only the owning church's signed-in owner may generate slots.
  if not exists(select 1 from public.tend_churches c
                where c.id = w.church_id and c.owner_id = (select auth.uid())) then
    raise exception 'Not authorized';
  end if;
  slots_per_day := 1440 / w.slot_minutes;
  d := greatest(p_from, w.start_date);
  while d <= least(p_to, coalesce(w.end_date, p_to)) loop
    for n in 0..slots_per_day - 1 loop
      slot_ts := (d::timestamptz + (n * w.slot_minutes || ' minutes')::interval);
      insert into public.tend_prayer_watch_slots(watch_id, starts_at, ends_at)
      values (p_watch_id, slot_ts, slot_ts + (w.slot_minutes || ' minutes')::interval)
      on conflict (watch_id, starts_at) do nothing;
      if found then created := created + 1; end if;
    end loop;
    d := d + 1;
  end loop;
  return created;
end;
$$;
revoke all on function public.tend_generate_watch_slots(bigint, date, date) from public;
grant execute on function public.tend_generate_watch_slots(bigint, date, date) to authenticated;

-- ------------------------------------------------------------- public API
-- Public watch info for the signup page. Only intentionally public fields.
create function public.tend_public_watch(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', w.id, 'slug', w.slug, 'title', w.title,
    'description', w.description,
    'churchName', c.name,
    'startDate', w.start_date, 'endDate', w.end_date,
    'slotMinutes', w.slot_minutes, 'isActive', w.is_active
  )
  from public.tend_prayer_watches w
  join public.tend_churches c on c.id = w.church_id
  where w.slug = p_slug and w.is_active;
$$;
revoke all on function public.tend_public_watch(text) from public;
grant execute on function public.tend_public_watch(text) to anon, authenticated;

-- Day view for the public signup page. Names are NOT exposed publicly;
-- filled slots just show as taken.
create function public.tend_watch_day(p_slug text, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  slots jsonb;
  total int; filled int;
begin
  select w.* into w from public.tend_prayer_watches w where w.slug = p_slug and w.is_active;
  if not found then raise exception 'Watch not found'; end if;
  if p_date < w.start_date or (w.end_date is not null and p_date > w.end_date) then
    raise exception 'Date is outside this prayer watch';
  end if;
  -- Lazily generate the day's slots on first public view.
  perform public.tend_generate_watch_slots_public(w.id, p_date);
  select count(*), count(*) filter (where signup_name is not null)
    into total, filled
    from public.tend_prayer_watch_slots s
    where s.watch_id = w.id and s.starts_at >= p_date::timestamptz
      and s.starts_at < (p_date + 1)::timestamptz;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'startsAt', s.starts_at, 'endsAt', s.ends_at,
      'taken', s.signup_name is not null
    ) order by s.starts_at), '[]'::jsonb)
    into slots
    from public.tend_prayer_watch_slots s
    where s.watch_id = w.id and s.starts_at >= p_date::timestamptz
      and s.starts_at < (p_date + 1)::timestamptz;
  return jsonb_build_object('total', total, 'filled', filled, 'slots', slots);
end;
$$;
revoke all on function public.tend_watch_day(text, date) from public;
grant execute on function public.tend_watch_day(text, date) to anon, authenticated;

-- Internal slot generator callable without an authenticated owner (used by
-- the public day view for lazy generation). Only fills gaps; never touches
-- existing signups.
create function public.tend_generate_watch_slots_public(p_watch_id bigint, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  n int; slot_ts timestamptz; slots_per_day int;
begin
  select * into w from public.tend_prayer_watches where id = p_watch_id and is_active;
  if not found then return; end if;
  if p_date < w.start_date or (w.end_date is not null and p_date > w.end_date) then return; end if;
  slots_per_day := 1440 / w.slot_minutes;
  for n in 0..slots_per_day - 1 loop
    slot_ts := (p_date::timestamptz + (n * w.slot_minutes || ' minutes')::interval);
    insert into public.tend_prayer_watch_slots(watch_id, starts_at, ends_at)
    values (p_watch_id, slot_ts, slot_ts + (w.slot_minutes || ' minutes')::interval)
    on conflict (watch_id, starts_at) do nothing;
  end loop;
end;
$$;
revoke all on function public.tend_generate_watch_slots_public(bigint, date) from public;
grant execute on function public.tend_generate_watch_slots_public(bigint, date) to anon, authenticated;

-- Claim a slot. One signup per slot; serialized per watch so double-booking
-- is impossible. Idempotent via p_signup_key.
create function public.tend_signup_watch_slot(
  p_slug text, p_slot_id bigint, p_name text, p_signup_key uuid,
  p_email text default null, p_phone text default null, p_website text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  s public.tend_prayer_watch_slots;
begin
  if coalesce(p_website, '') <> '' then raise exception 'Signup could not be accepted'; end if;
  if p_signup_key is null then raise exception 'Missing signup key'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Please share your name'; end if;
  select w.* into w from public.tend_prayer_watches w where w.slug = p_slug and w.is_active;
  if not found then raise exception 'Watch not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(w.id);
  -- Idempotent retry: same key returns the existing signup.
  select s.* into s from public.tend_prayer_watch_slots s
    where s.id = p_slot_id and s.watch_id = w.id and s.signup_key = p_signup_key;
  if found then
    return jsonb_build_object('ok', true, 'startsAt', s.starts_at, 'title', w.title);
  end if;
  select s.* into s from public.tend_prayer_watch_slots s
    where s.id = p_slot_id and s.watch_id = w.id for update;
  if not found then raise exception 'Time slot not found'; end if;
  if s.signup_name is not null then raise exception 'That time was just taken. Please pick another.'; end if;
  update public.tend_prayer_watch_slots
    set signup_name = trim(p_name),
        signup_email = nullif(trim(p_email), ''),
        signup_phone = nullif(trim(p_phone), ''),
        signed_up_at = now(),
        signup_key = p_signup_key
    where id = s.id;
  return jsonb_build_object('ok', true, 'startsAt', s.starts_at, 'title', w.title);
end;
$$;
revoke all on function public.tend_signup_watch_slot(text, bigint, text, uuid, text, text, text) from public;
grant execute on function public.tend_signup_watch_slot(text, bigint, text, uuid, text, text, text) to anon, authenticated;

-- Release a slot with its signup key (link in the confirmation email).
create function public.tend_cancel_watch_signup(p_signup_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.tend_prayer_watch_slots;
begin
  if p_signup_key is null then raise exception 'Missing signup key'; end if;
  select s.* into s from public.tend_prayer_watch_slots s where s.signup_key = p_signup_key;
  if not found then raise exception 'Signup not found'; end if;
  update public.tend_prayer_watch_slots
    set signup_name = null, signup_email = null, signup_phone = null,
        signed_up_at = null, signup_key = null
    where id = s.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.tend_cancel_watch_signup(uuid) from public;
grant execute on function public.tend_cancel_watch_signup(uuid) to anon, authenticated;

-- Pastor day dashboard: full slot detail including signup names/contact.
create function public.tend_watch_day_detail(p_watch_id bigint, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  slots jsonb; total int; filled int;
begin
  select w.* into w from public.tend_prayer_watches w where w.id = p_watch_id;
  if not found then raise exception 'Watch not found'; end if;
  if not exists(select 1 from public.tend_churches c
                where c.id = w.church_id and c.owner_id = (select auth.uid())) then
    raise exception 'Not authorized';
  end if;
  perform public.tend_generate_watch_slots_public(w.id, p_date);
  select count(*), count(*) filter (where signup_name is not null)
    into total, filled
    from public.tend_prayer_watch_slots s
    where s.watch_id = w.id and s.starts_at >= p_date::timestamptz
      and s.starts_at < (p_date + 1)::timestamptz;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'startsAt', s.starts_at, 'endsAt', s.ends_at,
      'name', s.signup_name, 'email', s.signup_email, 'phone', s.signup_phone,
      'signedUpAt', s.signed_up_at
    ) order by s.starts_at), '[]'::jsonb)
    into slots
    from public.tend_prayer_watch_slots s
    where s.watch_id = w.id and s.starts_at >= p_date::timestamptz
      and s.starts_at < (p_date + 1)::timestamptz;
  return jsonb_build_object('total', total, 'filled', filled, 'slots', slots);
end;
$$;
revoke all on function public.tend_watch_day_detail(bigint, date) from public;
grant execute on function public.tend_watch_day_detail(bigint, date) to authenticated;
