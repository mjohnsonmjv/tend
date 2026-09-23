-- Tend: accept and store the submitter's email on public prayer requests.
-- Apply in the Supabase SQL editor (or via the Supabase CLI) against the
-- Tend project. Safe to re-run: the old function signature is dropped first.

drop function if exists public.tend_submit_prayer(text,text,uuid,text,text,text,boolean,boolean,text);

create function public.tend_submit_prayer(
  p_slug text, p_message text, p_submission_key uuid,
  p_category text default 'prayer', p_name text default null,
  p_phone text default null, p_email text default null,
  p_anonymous boolean default false,
  p_urgent boolean default false, p_website text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.tend_churches;
begin
  if coalesce(p_website,'') <> '' then raise exception 'Submission could not be accepted'; end if;
  select * into c from public.tend_churches where slug=p_slug;
  if not found then raise exception 'Church not found'; end if;
  if p_submission_key is null then raise exception 'Missing submission key'; end if;
  -- Serialize submissions per church so the volume ceiling is race safe.
  perform pg_catalog.pg_advisory_xact_lock(c.id);
  if exists(select 1 from public.tend_prayers where church_id=c.id and submission_key=p_submission_key) then
    return jsonb_build_object('ok',true,'greetingMessage',c.greeting_message);
  end if;
  if (select count(*) from public.tend_prayers where church_id=c.id and created_at > now()-interval '10 minutes') >= 600 then
    raise exception 'Too many requests. Please try later or contact your church directly.';
  end if;
  insert into public.tend_prayers(church_id,submission_key,message,category,submitter_name,submitter_phone,submitter_email,is_anonymous,is_urgent)
  values(c.id,p_submission_key,trim(p_message),p_category,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_name),'') end,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_phone),'') end,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_email),'') end,
    coalesce(p_anonymous,false),coalesce(p_urgent,false));
  return jsonb_build_object('ok',true,'greetingMessage',c.greeting_message);
end;
$$;
revoke all on function public.tend_submit_prayer(text,text,uuid,text,text,text,text,boolean,boolean,text) from public;
grant execute on function public.tend_submit_prayer(text,text,uuid,text,text,text,text,boolean,boolean,text) to anon, authenticated;
