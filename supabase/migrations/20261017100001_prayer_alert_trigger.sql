-- Fire the prayer-alert webhook on every new prayer request.
-- Apply after the send-prayer-alert Edge Function is deployed (verify_jwt=false).
create or replace function public.tend_prayer_alert_webhook()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  signing_key text;
  issued_at bigint := floor(extract(epoch from now()))::bigint;
  signature text;
begin
  select decrypted_secret into signing_key from vault.decrypted_secrets
    where name = 'tend_prayer_alert_signing_key';
  if signing_key is null then
    raise warning 'Tend prayer alert signing configuration is unavailable';
    return new;
  end if;
  signature := encode(extensions.hmac(
    new.id::text || ':' || issued_at::text || ':0', signing_key, 'sha256'
  ), 'hex');
  perform net.http_post(
    url := 'https://hvrdkrtismqbrkbmcgne.supabase.co/functions/v1/send-prayer-alert',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tend-signature', signature),
    body := jsonb_build_object('prayer_id', new.id::text, 'issued_at', issued_at, 'dry_run', false),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  -- Keep intake available but never log the prayer, recipients, or signing key.
  raise warning 'Tend prayer alert enqueue failed';
  return new;
end;
$$;

revoke all on function public.tend_prayer_alert_webhook()
  from public, anon, authenticated;

drop trigger if exists tend_prayer_alert_trigger on public.tend_prayers;
create trigger tend_prayer_alert_trigger
  after insert on public.tend_prayers
  for each row execute function public.tend_prayer_alert_webhook();
