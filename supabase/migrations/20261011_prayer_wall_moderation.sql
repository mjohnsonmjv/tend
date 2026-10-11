-- Prayer wall moderation bot (Mark's decision 2026-10-11):
-- no pastor pre-approval; auto-publish with server-side profanity filtering.
-- Word list mirrors client/src/lib/profanity.ts. Keep both in sync.

-- Drop the old 12-arg signature first so create or replace is unambiguous.
drop function if exists public.tend_submit_prayer(text,text,uuid,text,text,text,text,boolean,boolean,text,text,text);

create function public.tend_submit_prayer(
  p_slug text, p_message text, p_submission_key uuid,
  p_category text default 'prayer', p_name text default null,
  p_phone text default null, p_email text default null,
  p_anonymous boolean default false,
  p_urgent boolean default false, p_website text default '',
  p_photo_url text default null, p_photo_path text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.tend_churches;
declare v_photo_url text;
declare v_photo_path text;
declare v_message text;
declare v_blocked text[] := array[
  'fuck','fucker','fucking','fuk','fuker','shit','shitty','bitch',
  'bitches','bastard','asshole','dick','dicks','pussy','cunt',
  'whore','slut','tits','boobs','porn','porno','xxx',
  'nigger','nigga','faggot','fag','retard','retarded','chink',
  'spic','kike','tranny',
  'f4ck','fck','sh1t','b1tch','a55hole','d1ck','c0ck'
];
declare v_phrases text[] := array['kill yourself','kys'];
declare w text;
begin
  if coalesce(p_website,'') <> '' then raise exception 'Submission could not be accepted'; end if;
  select * into c from public.tend_churches where slug=p_slug;
  if not found then raise exception 'Church not found'; end if;
  if p_submission_key is null then raise exception 'Missing submission key'; end if;

  -- Moderation bot: reject blocked language in the message or name.
  v_message := trim(p_message);
  foreach w in array v_blocked loop
    if v_message ~* ('\m' || w || '\M') then
      raise exception 'Submission could not be accepted. Please keep requests respectful.';
    end if;
  end loop;
  foreach w in array v_phrases loop
    if v_message ~* w then
      raise exception 'Submission could not be accepted. Please keep requests respectful.';
    end if;
  end loop;
  if p_name is not null then
    foreach w in array v_blocked loop
      if p_name ~* ('\m' || w || '\M') then
        raise exception 'Submission could not be accepted. Please keep requests respectful.';
      end if;
    end loop;
  end if;

  -- Validate the photo inputs before anything else.
  v_photo_url := nullif(trim(coalesce(p_photo_url,'')),'');
  if v_photo_url is not null and v_photo_url !~ '^https://lh3\\.googleusercontent\\.com/' then
    raise exception 'Submission could not be accepted'; end if;
  v_photo_path := nullif(trim(coalesce(p_photo_path,'')),'');
  if v_photo_path is not null and v_photo_path !~ '^photos/[0-9a-f-]{36}\\.jpg$' then
    raise exception 'Submission could not be accepted'; end if;

  -- Serialize submissions per church so the volume ceiling is race safe.
  perform pg_catalog.pg_advisory_xact_lock(c.id);
  if exists(select 1 from public.tend_prayers where church_id=c.id and submission_key=p_submission_key) then
    return jsonb_build_object('ok',true,'greetingMessage',c.greeting_message);
  end if;
  if (select count(*) from public.tend_prayers where church_id=c.id and created_at > now()-interval '10 minutes') >= 600 then
    raise exception 'Too many requests. Please try later or contact your church directly.';
  end if;
  -- Auto-publish: new submissions are shared on the prayer wall (is_private=false).
  insert into public.tend_prayers(church_id,submission_key,message,category,submitter_name,submitter_phone,submitter_email,is_anonymous,is_urgent,submitter_photo_url,submitter_photo_path,is_private)
  values(c.id,p_submission_key,v_message,p_category,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_name),'') end,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_phone),'') end,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_email),'') end,
    coalesce(p_anonymous,false),coalesce(p_urgent,false),
    case when coalesce(p_anonymous,false) then null else v_photo_url end,
    case when coalesce(p_anonymous,false) then null else v_photo_path end,
    false);
  return jsonb_build_object('ok',true,'greetingMessage',c.greeting_message);
end;
$$;
revoke all on function public.tend_submit_prayer(text,text,uuid,text,text,text,text,boolean,boolean,text,text,text) from public;
grant execute on function public.tend_submit_prayer(text,text,uuid,text,text,text,text,boolean,boolean,text,text,text) to anon, authenticated;
