-- Error-alert event log and per-type throttle state.
-- Edge functions log failures here through tend_log_alert_event(). The RPC
-- atomically claims the digest send, so at most one digest email goes out per
-- alert type per hour while failures continue. Digests are sent lazily by the
-- logging function itself: no scheduler is required.
create table public.tend_alert_events (
  id bigint generated always as identity primary key,
  alert_type text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index tend_alert_events_type_time_idx
  on public.tend_alert_events(alert_type, created_at desc);

create table public.tend_alert_state (
  alert_type text primary key,
  last_sent_at timestamptz
);

alter table public.tend_alert_events enable row level security;
alter table public.tend_alert_state enable row level security;
-- Only the service role (edge functions) touches these tables, through the RPC.
revoke all on public.tend_alert_events from anon, authenticated, public;
revoke all on public.tend_alert_state from anon, authenticated, public;

-- Log one alert event. Returns {logged, send, digest?}. When send is true, the
-- caller must email the digest to Mark now: this call claimed the hourly slot.
-- The digest covers alert events since the previous send (capped at 24h) plus
-- the trailing-hour count of failed phone-code verifications, with a spike
-- flag at 5 or more. Details are machine-readable codes only, never PII.
create or replace function public.tend_log_alert_event(p_alert_type text, p_detail text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  prev_sent timestamptz;
  claimed_count integer := 0;
  window_start timestamptz;
  phone_fails bigint;
  digest jsonb;
begin
  if p_alert_type not in ('sms_inbound_error', 'stripe_webhook_error') then
    return jsonb_build_object('logged', false, 'error', 'unknown_alert_type');
  end if;

  insert into public.tend_alert_events(alert_type, detail)
  values (p_alert_type, left(nullif(trim(p_detail), ''), 500));

  select last_sent_at into prev_sent
    from public.tend_alert_state where alert_type = p_alert_type;

  insert into public.tend_alert_state(alert_type, last_sent_at)
  values (p_alert_type, now())
  on conflict (alert_type) do update set last_sent_at = now()
  where tend_alert_state.last_sent_at is null
     or tend_alert_state.last_sent_at < now() - interval '1 hour';
  get diagnostics claimed_count = row_count;

  if claimed_count = 0 then
    return jsonb_build_object('logged', true, 'send', false);
  end if;

  window_start := coalesce(prev_sent, now() - interval '24 hours');

  select count(*) into phone_fails from public.auth_events
  where event = 'phone_code_verify_fail'
    and created_at > now() - interval '1 hour';

  select jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object('type', e.alert_type, 'detail', e.detail, 'at', e.created_at)
        order by e.created_at desc
      )
      from (
        select alert_type, detail, created_at from public.tend_alert_events
        where created_at > window_start
        order by created_at desc limit 20
      ) e
    ), '[]'::jsonb),
    'phone_fail_count', phone_fails,
    'phone_spike', phone_fails >= 5,
    'window_since', window_start
  ) into digest;

  return jsonb_build_object('logged', true, 'send', true, 'digest', digest);
end;
$$;

revoke all on function public.tend_log_alert_event(text, text)
  from public, anon, authenticated;
grant execute on function public.tend_log_alert_event(text, text) to service_role;
