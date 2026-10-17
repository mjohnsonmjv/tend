-- Prayer-alert signing key + preparation RPC for the send-prayer-alert edge function.
-- Mirrors the send-prayer-confirmation security model: the database trigger sends
-- only IDs + HMAC; the function retrieves recipients through this signed RPC.
-- The owner's address is included only when confirmed and matching the church
-- record, so a phone-first signup can never make Tend alert a stranger.
do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'tend_prayer_alert_signing_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'tend_prayer_alert_signing_key',
      'Authenticate only Tend prayer-alert requests'
    );
  end if;
end;
$$;

create or replace function public.tend_prepare_prayer_alert(
  p_prayer_id bigint, p_issued_at bigint, p_signature text,
  p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  signing_key text;
  expected text;
  current_epoch bigint := floor(extract(epoch from now()))::bigint;
  prayer record;
  church record;
  owner_email text;
  owner_confirmed timestamptz;
  recipients text[] := '{}';
  team_email text;
begin
  if p_prayer_id is null or p_prayer_id < 0 or p_issued_at is null
     or p_dry_run is null or p_signature is null
     or p_signature !~ '^[a-f0-9]{64}$'
     or p_issued_at < current_epoch - 600 or p_issued_at > current_epoch + 60 then
    return jsonb_build_object('authorized', false);
  end if;
  select decrypted_secret into signing_key from vault.decrypted_secrets
    where name = 'tend_prayer_alert_signing_key';
  if signing_key is null then
    return jsonb_build_object('authorized', false);
  end if;
  expected := encode(extensions.hmac(
    p_prayer_id::text || ':' || p_issued_at::text || ':' || case when p_dry_run then '1' else '0' end,
    signing_key, 'sha256'
  ), 'hex');
  -- Hash both signatures before equality to avoid revealing matching prefixes.
  if extensions.digest(p_signature, 'sha256') <> extensions.digest(expected, 'sha256') then
    return jsonb_build_object('authorized', false);
  end if;
  if p_dry_run then
    -- Signed diagnostics check church lookup without retrieving prayer data,
    -- disclosing church names, or sending email.
    return jsonb_build_object('authorized', true, 'church_lookup_ok',
      exists(select 1 from public.tend_churches where nullif(trim(name), '') is not null));
  end if;

  select p.church_id, p.message, p.is_anonymous
    into prayer
    from public.tend_prayers p where p.id = p_prayer_id;
  if not found then
    return jsonb_build_object('authorized', true, 'skip', true);
  end if;

  select c.id, c.name, c.pastor_email, c.owner_id
    into church
    from public.tend_churches c where c.id = prayer.church_id;
  if not found or nullif(trim(church.name), '') is null then
    return jsonb_build_object('authorized', true, 'error', 'church_lookup_failed');
  end if;

  -- Owner's address only when confirmed and matching the church record.
  select u.email, u.email_confirmed_at into owner_email, owner_confirmed
    from auth.users u where u.id = church.owner_id;
  if owner_confirmed is not null
     and nullif(trim(church.pastor_email), '') is not null
     and owner_email is not null
     and lower(trim(owner_email)) = lower(trim(church.pastor_email)) then
    recipients := recipients || lower(trim(church.pastor_email));
  end if;

  -- Care-team members, as entered by the church owner.
  for team_email in
    select distinct lower(trim(m.email))
    from public.tend_care_team_members m
    where m.church_id = church.id
      and nullif(trim(m.email), '') is not null
      and lower(trim(m.email)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  loop
    if not (team_email = any(recipients)) then
      recipients := recipients || team_email;
    end if;
  end loop;

  if coalesce(array_length(recipients, 1), 0) = 0 then
    return jsonb_build_object('authorized', true, 'skip', true);
  end if;

  return jsonb_build_object(
    'authorized', true,
    'recipients', to_jsonb(recipients),
    'church_name', church.name,
    'church_id', church.id,
    'prayer_excerpt', left(nullif(trim(prayer.message), ''), 140),
    'is_anonymous', coalesce(prayer.is_anonymous, false)
  );
end;
$$;

revoke all on function public.tend_prepare_prayer_alert(bigint,bigint,text,boolean)
  from public, anon, authenticated;
grant execute on function public.tend_prepare_prayer_alert(bigint,bigint,text,boolean)
  to anon;
