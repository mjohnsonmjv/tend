-- Apply after the authenticated Edge Function deployment. Retains the existing
-- trigger and changes only its implementation. No rows or RLS policies change.
create or replace function public.tend_prayer_confirmation_webhook()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  signing_key text;
  issued_at bigint := floor(extract(epoch from now()))::bigint;
  signature text;
begin
  if new.is_anonymous or nullif(trim(new.submitter_email), '') is null then
    return new;
  end if;
  select decrypted_secret into signing_key from vault.decrypted_secrets
    where name = 'tend_prayer_confirmation_signing_key';
  if signing_key is null then
    raise warning 'Tend confirmation signing configuration is unavailable';
    return new;
  end if;
  signature := encode(extensions.hmac(
    new.id::text || ':' || issued_at::text || ':0', signing_key, 'sha256'
  ), 'hex');
  perform net.http_post(
    url := 'https://hvrdkrtismqbrkbmcgne.supabase.co/functions/v1/send-prayer-confirmation',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tend-signature', signature),
    body := jsonb_build_object('prayer_id', new.id::text, 'issued_at', issued_at, 'dry_run', false),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  -- Keep intake available but never log the prayer, recipient, or signing key.
  raise warning 'Tend confirmation enqueue failed';
  return new;
end;
$$;

revoke all on function public.tend_prayer_confirmation_webhook()
  from public, anon, authenticated;
