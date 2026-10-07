-- Tend: anonymous prayer-watch signups. Adds an opt-in "keep my name private"
-- checkbox (unchecked by default). Anonymous signups still record the name
-- for the pastor dashboard, but the public day view shows them as Anonymous.

alter table public.tend_prayer_watch_slots
  add column if not exists is_anonymous boolean not null default false;

-- Signup now accepts an anonymous flag.
create or replace function public.tend_signup_watch_slot(
  p_slug text, p_slot_id bigint, p_name text, p_signup_key uuid,
  p_email text default null, p_phone text default null, p_website text default '',
  p_anonymous boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  s public.tend_prayer_watch_slots;
begin
  if coalesce(p_website, '') <> '' then raise exception 'Signup could not be accepted'; end if;
  if p_signup_key is null then raise exception 'Missing signup key'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Please share your name'; end if;
  select tw.* into w from public.tend_prayer_watches tw where tw.slug = p_slug and tw.is_active;
  if not found then raise exception 'Watch not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(w.id);
  select s2.* into s from public.tend_prayer_watch_slots s2
    where s2.id = p_slot_id and s2.watch_id = w.id and s2.signup_key = p_signup_key;
  if found then
    return jsonb_build_object('ok', true, 'startsAt', s.starts_at, 'title', w.title);
  end if;
  select s2.* into s from public.tend_prayer_watch_slots s2
    where s2.id = p_slot_id and s2.watch_id = w.id for update;
  if not found then raise exception 'Time slot not found'; end if;
  if s.signup_name is not null then raise exception 'That time was just taken. Please pick another.'; end if;
  update public.tend_prayer_watch_slots
    set signup_name = trim(p_name),
        signup_email = nullif(trim(p_email), ''),
        signup_phone = nullif(trim(p_phone), ''),
        signed_up_at = now(),
        signup_key = p_signup_key,
        is_anonymous = coalesce(p_anonymous, false)
    where id = s.id;
  return jsonb_build_object('ok', true, 'startsAt', s.starts_at, 'title', w.title);
end;
$$;
revoke all on function public.tend_signup_watch_slot(text, bigint, text, uuid, text, text, text, boolean) from public;
grant execute on function public.tend_signup_watch_slot(text, bigint, text, uuid, text, text, text, boolean) to anon, authenticated;

-- Public day view now includes a display name for taken slots:
-- first name + last initial for public signups, 'Anonymous' for anonymous ones.
create or replace function public.tend_watch_day(p_slug text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  slots jsonb;
  total int; filled int;
  day_start timestamptz; day_end timestamptz;
begin
  select tw.* into w from public.tend_prayer_watches tw where tw.slug = p_slug and tw.is_active;
  if not found then raise exception 'Watch not found'; end if;
  if p_date < w.start_date or (w.end_date is not null and p_date > w.end_date) then
    raise exception 'Date is outside this prayer watch';
  end if;
  perform public.tend_generate_watch_slots_public(w.id, p_date);
  day_start := (p_date::text || ' 00:00:00 America/Detroit')::timestamptz;
  day_end := day_start + interval '1 day';
  select count(*), count(*) filter (where signup_name is not null)
    into total, filled
    from public.tend_prayer_watch_slots s
    where s.watch_id = w.id and s.starts_at >= day_start
      and s.starts_at < day_end;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'startsAt', s.starts_at, 'endsAt', s.ends_at,
      'taken', s.signup_name is not null,
      'displayName', case
        when s.signup_name is null then null
        when s.is_anonymous then 'Anonymous'
        else trim(split_part(trim(s.signup_name), ' ', 1))
          || case when position(' ' in trim(s.signup_name)) > 0
               then ' ' || left(split_part(trim(s.signup_name), ' ', 2), 1) || '.'
               else '' end
      end
    ) order by s.starts_at), '[]'::jsonb)
    into slots
    from public.tend_prayer_watch_slots s
    where s.watch_id = w.id and s.starts_at >= day_start
      and s.starts_at < day_end;
  return jsonb_build_object('total', total, 'filled', filled, 'slots', slots);
end;
$$;
