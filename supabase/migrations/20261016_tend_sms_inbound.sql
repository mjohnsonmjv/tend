-- Text-in prayer requests (applied to production 2026-10-16).
alter table public.tend_churches add column if not exists sms_number text unique;

create or replace function public.tend_twilio_auth_token()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name='twilio_auth_token' limit 1;
$$;
revoke all on function public.tend_twilio_auth_token() from public, anon, authenticated;
grant execute on function public.tend_twilio_auth_token() to service_role;

-- Texted prayers are always private (never on the public prayer wall).
create or replace function public.tend_sms_submit_prayer(p_to text, p_from text, p_body text, p_message_sid text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c public.tend_churches;
declare v_key uuid;
declare v_msg text := left(trim(coalesce(p_body,'')), 2000);
begin
  select * into c from public.tend_churches where sms_number = p_to;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_church'); end if;
  if length(v_msg) < 1 then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  v_key := md5('sms:' || coalesce(p_message_sid, p_from || v_msg))::uuid;
  perform pg_catalog.pg_advisory_xact_lock(c.id);
  if exists(select 1 from public.tend_prayers where church_id=c.id and submission_key=v_key) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'church', c.name);
  end if;
  if (select count(*) from public.tend_prayers where church_id=c.id and submitter_phone=p_from and created_at > now()-interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.tend_prayers(church_id, submission_key, message, category, submitter_phone, is_anonymous, is_urgent, is_private)
  values (c.id, v_key, v_msg, 'prayer', p_from, false, false, true);
  return jsonb_build_object('ok', true, 'church', c.name);
end;
$$;
revoke all on function public.tend_sms_submit_prayer(text,text,text,text) from public, anon, authenticated;
grant execute on function public.tend_sms_submit_prayer(text,text,text,text) to service_role;

-- Default inbox for the shared Tend number (+1 616-816-4172), owned by Mark's account:
-- insert into tend_churches(owner_id,slug,name,pastor_name,pastor_email,sms_number) ... slug 'tend-text-line'
