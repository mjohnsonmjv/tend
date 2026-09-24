-- A purpose-specific signing key stays inside Vault. It is never exported to
-- the function, client, source repository, migration output, or webhook body.
do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'tend_prayer_confirmation_signing_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'tend_prayer_confirmation_signing_key',
      'Authenticate only Tend prayer-confirmation requests'
    );
  end if;
end;
$$;

create or replace function public.tend_prepare_prayer_confirmation(
  p_prayer_id bigint, p_issued_at bigint, p_signature text,
  p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  signing_key text;
  expected text;
  current_epoch bigint := floor(extract(epoch from now()))::bigint;
  recipient text;
  church_id bigint;
  anonymous boolean;
  church record;
begin
  if p_prayer_id is null or p_prayer_id < 0 or p_issued_at is null
     or p_dry_run is null or p_signature is null
     or p_signature !~ '^[a-f0-9]{64}$'
     or p_issued_at < current_epoch - 600 or p_issued_at > current_epoch + 60 then
    return jsonb_build_object('authorized', false);
  end if;
  select decrypted_secret into signing_key from vault.decrypted_secrets
    where name = 'tend_prayer_confirmation_signing_key';
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
  select p.submitter_email, p.church_id, p.is_anonymous
    into recipient, church_id, anonymous
    from public.tend_prayers p where p.id = p_prayer_id;
  if not found or anonymous or nullif(trim(recipient), '') is null then
    return jsonb_build_object('authorized', true, 'skip', true);
  end if;
  select c.name, c.pastor_name, c.greeting_message into church
    from public.tend_churches c where c.id = church_id;
  if not found or nullif(trim(church.name), '') is null then
    return jsonb_build_object('authorized', true, 'error', 'church_lookup_failed');
  end if;
  return jsonb_build_object(
    'authorized', true, 'recipient', trim(recipient),
    'church_name', church.name, 'pastor_name', church.pastor_name,
    'greeting_message', church.greeting_message
  );
end;
$$;

revoke all on function public.tend_prepare_prayer_confirmation(bigint,bigint,text,boolean)
  from public, anon, authenticated;
grant execute on function public.tend_prepare_prayer_confirmation(bigint,bigint,text,boolean)
  to anon;
