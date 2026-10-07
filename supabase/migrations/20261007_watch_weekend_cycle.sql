-- Tend: recurring weekend prayer cycle (Saturday 10am -> Sunday 10am Eastern).
-- Adds per-watch weekday filtering and a daily cycle start hour so a watch
-- can cover a 24h window spanning two calendar days (e.g. Sat 10am - Sun 10am).

alter table public.tend_prayer_watches
  add column if not exists active_weekdays int[],
  add column if not exists cycle_start_hour int not null default 0;

-- Update the public lazy slot generator to respect the weekday filter and
-- the cycle start hour. For a watch with cycle_start_hour = 10 and
-- active_weekdays = {0,6}: Saturday generates 10:00-24:00 slots,
-- Sunday generates 00:00-10:00 slots (all in America/Detroit).
create or replace function public.tend_generate_watch_slots_public(p_watch_id bigint, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.tend_prayer_watches;
  n int; slot_ts timestamptz; slots_per_day int;
  dow int;
  start_min int; end_min int;
  day_start timestamptz;
begin
  select * into w from public.tend_prayer_watches where id = p_watch_id and is_active;
  if not found then return; end if;
  if p_date < w.start_date or (w.end_date is not null and p_date > w.end_date) then return; end if;
  dow := extract(dow from p_date)::int;
  if w.active_weekdays is not null and not (dow = any(w.active_weekdays)) then return; end if;

  slots_per_day := 1440 / w.slot_minutes;
  start_min := 0; end_min := 1440;
  if w.cycle_start_hour > 0 then
    -- Weekend cycle: Saturday (dow 6) runs from cycle_start_hour to midnight,
    -- Sunday (dow 0) runs from midnight to cycle_start_hour.
    if dow = 6 then start_min := w.cycle_start_hour * 60; end if;
    if dow = 0 then end_min := w.cycle_start_hour * 60; end if;
  end if;

  -- Build slot timestamps in America/Detroit so 10am means 10am Eastern
  -- across DST transitions.
  day_start := (p_date::text || ' 00:00:00 America/Detroit')::timestamptz;
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

-- Convert the Frontier watch to a recurring Saturday 10am -> Sunday 10am cycle.
update public.tend_prayer_watches
set start_date = '2026-10-10',
    end_date = null,
    active_weekdays = '{0,6}',
    cycle_start_hour = 10,
    description = coalesce(description, '') || ''
where id = 5;

-- Clear old slots (the month-long daily pattern).
delete from public.tend_prayer_watch_slots where watch_id = 5;

-- Pre-generate the next 12 weekends.
do $$
declare
  sat date := '2026-10-10';
  i int;
begin
  for i in 0..11 loop
    perform public.tend_generate_watch_slots_public(5, sat + (i * 7));
    perform public.tend_generate_watch_slots_public(5, sat + (i * 7) + 1);
  end loop;
end;
$$;
