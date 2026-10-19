-- Tend: weekly recurring prayer watches.
-- Generalizes the weekend-cycle slot generator (previously hardcoded to
-- Saturday 10am -> Sunday 10am) to any weekday. active_weekdays now stores
-- the days a 24h window STARTS on; each window runs from cycle_start_hour
-- for 24 hours, spilling into the next calendar day automatically.
-- Back-to-back start days compose into continuous coverage.
-- Apply in the Supabase SQL editor (Management API token unavailable).

-- Generalized lazy slot generator. For date D:
--   dow(D) in active_weekdays      -> slots from cycle_start_hour to midnight (first half)
--   dow(D-1) in active_weekdays    -> slots from midnight to cycle_start_hour (second half)
--   active_weekdays null           -> whole day (date-range watches, unchanged behavior)
create or replace function public.tend_generate_watch_slots_public(p_watch_id bigint, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  n int; slot_ts timestamptz; slots_per_day int;
  dow int; prev_dow int;
  start_min int; end_min int;
  day_start timestamptz;
begin
  select * into w from public.tend_prayer_watches where id = p_watch_id and is_active;
  if not found then return; end if;
  if p_date < w.start_date or (w.end_date is not null and p_date > w.end_date) then return; end if;
  dow := extract(dow from p_date)::int;
  prev_dow := extract(dow from p_date - 1)::int;
  if w.active_weekdays is null then
    -- Date-range watch: cover the whole day.
    start_min := 0; end_min := 1440;
  elsif dow = any(w.active_weekdays) then
    -- A 24h window starts today at cycle_start_hour: first half.
    start_min := w.cycle_start_hour * 60; end_min := 1440;
  elsif prev_dow = any(w.active_weekdays) then
    -- Yesterday started a window: second half, midnight to cycle_start_hour.
    start_min := 0; end_min := w.cycle_start_hour * 60;
  else
    return;
  end if;

  -- Build slot timestamps in America/Detroit so 10am means 10am Eastern
  -- across DST transitions.
  day_start := (p_date::text || ' 00:00:00 America/Detroit')::timestamptz;
  slots_per_day := 1440 / w.slot_minutes;
  for n in start_min / w.slot_minutes .. (end_min / w.slot_minutes) - 1 loop
    slot_ts := day_start + (n * w.slot_minutes || ' minutes')::interval;
    insert into public.tend_prayer_watch_slots(watch_id, starts_at, ends_at)
    values (p_watch_id, slot_ts, slot_ts + (w.slot_minutes || ' minutes')::interval)
    on conflict (watch_id, starts_at) do nothing;
  end loop;
end;
$$;
revoke all on function public.tend_generate_watch_slots_public(bigint, date) from public;
grant execute on function public.tend_generate_watch_slots_public(bigint, date) to anon, authenticated;

-- The owner-facing range generator now delegates per date so it respects
-- weekday patterns too. Keeps its auth check and int return contract.
create or replace function public.tend_generate_watch_slots(p_watch_id bigint, p_from date, p_to date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  d date;
  from_d date; to_d date;
  created int := 0;
begin
  select * into w from public.tend_prayer_watches where id = p_watch_id;
  if not found then raise exception 'Watch not found'; end if;
  -- Only the owning church's signed-in owner may generate slots.
  if not exists(select 1 from public.tend_churches c
                where c.id = w.church_id and c.owner_id = (select auth.uid())) then
    raise exception 'Not authorized';
  end if;
  from_d := greatest(p_from, w.start_date);
  to_d := least(p_to, coalesce(w.end_date, p_to));
  d := from_d;
  while d <= to_d loop
    perform public.tend_generate_watch_slots_public(p_watch_id, d);
    d := d + 1;
  end loop;
  select count(*) into created
  from public.tend_prayer_watch_slots s
  where s.watch_id = p_watch_id
    and (s.starts_at at time zone 'America/Detroit')::date between from_d and to_d;
  return created;
end;
$$;
revoke all on function public.tend_generate_watch_slots(bigint, date, date) from public;
grant execute on function public.tend_generate_watch_slots(bigint, date, date) to authenticated;

-- Convert the Frontier weekend watch to start-day semantics: the window
-- starts Saturday ({6}); Sunday's early hours are the spillover and are now
-- generated automatically. Behavior is unchanged (Sat 10am -> Sun 10am ET).
update public.tend_prayer_watches set active_weekdays = '{6}' where id = 5;
