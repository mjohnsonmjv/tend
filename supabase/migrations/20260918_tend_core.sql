create table public.tend_churches (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$' and slug <> 'demo'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  pastor_name text not null check (char_length(trim(pastor_name)) between 2 and 100),
  pastor_email text not null check (char_length(pastor_email) between 3 and 254),
  greeting_message text not null default 'Thank you for sharing. Your request has been received.' check (char_length(greeting_message) between 1 and 300),
  plan text not null default 'pilot' check (plan in ('pilot','starter','growth','large')),
  stripe_customer_id text,
  created_at timestamptz not null default now()
);
create index tend_church_owner_idx on public.tend_churches(owner_id);
alter table public.tend_churches enable row level security;
revoke all on public.tend_churches from anon, authenticated;
grant select on public.tend_churches to authenticated;
grant insert(slug,name,pastor_name,pastor_email,greeting_message) on public.tend_churches to authenticated;
grant update(greeting_message) on public.tend_churches to authenticated;
grant usage on sequence public.tend_churches_id_seq to authenticated;
create policy tend_church_owner_read on public.tend_churches for select to authenticated using (owner_id = (select auth.uid()));
create policy tend_church_owner_create on public.tend_churches for insert to authenticated with check (owner_id = (select auth.uid()) and (select auth.jwt()->>'email') = pastor_email);
create policy tend_church_owner_update on public.tend_churches for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.tend_prayers (
  id bigint generated always as identity primary key,
  church_id bigint not null references public.tend_churches(id) on delete restrict,
  submission_key uuid not null,
  submitter_name text check (char_length(submitter_name) <= 100),
  submitter_phone text check (char_length(submitter_phone) <= 32),
  submitter_email text check (char_length(submitter_email) <= 254),
  message text not null check (char_length(trim(message)) between 3 and 2000),
  category text not null default 'prayer' check (category in ('prayer','check_in','praise','question')),
  is_anonymous boolean not null default false,
  is_urgent boolean not null default false,
  is_private boolean not null default true check (is_private),
  status text not null default 'new' check (status in ('new','praying','prayed_for','archived')),
  pastor_notes text check (char_length(pastor_notes) <= 4000),
  created_at timestamptz not null default now(),
  unique (church_id, submission_key),
  check (not is_anonymous or (submitter_name is null and submitter_phone is null and submitter_email is null))
);
create index tend_prayer_church_time_idx on public.tend_prayers(church_id, created_at desc);
alter table public.tend_prayers enable row level security;
revoke all on public.tend_prayers from anon, authenticated;
grant select on public.tend_prayers to authenticated;
grant update(status,pastor_notes) on public.tend_prayers to authenticated;
create policy tend_prayer_owner_read on public.tend_prayers for select to authenticated using (exists(select 1 from public.tend_churches c where c.id = church_id and c.owner_id = (select auth.uid())));
create policy tend_prayer_owner_update on public.tend_prayers for update to authenticated using (exists(select 1 from public.tend_churches c where c.id = church_id and c.owner_id = (select auth.uid()))) with check (exists(select 1 from public.tend_churches c where c.id = church_id and c.owner_id = (select auth.uid())));

-- Only intentionally public information is exposed through this function.
create function public.tend_public_church(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('slug',slug,'name',name,'pastorName',pastor_name,'greetingMessage',greeting_message)
  from public.tend_churches where slug = p_slug;
$$;
revoke all on function public.tend_public_church(text) from public;
grant execute on function public.tend_public_church(text) to anon, authenticated;

-- No caller can supply a status, pastor note, or alternate church ID.
create function public.tend_submit_prayer(
  p_slug text, p_message text, p_submission_key uuid,
  p_category text default 'prayer', p_name text default null,
  p_phone text default null, p_anonymous boolean default false,
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
  insert into public.tend_prayers(church_id,submission_key,message,category,submitter_name,submitter_phone,is_anonymous,is_urgent)
  values(c.id,p_submission_key,trim(p_message),p_category,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_name),'') end,
    case when coalesce(p_anonymous,false) then null else nullif(trim(p_phone),'') end,
    coalesce(p_anonymous,false),coalesce(p_urgent,false));
  return jsonb_build_object('ok',true,'greetingMessage',c.greeting_message);
end;
$$;
revoke all on function public.tend_submit_prayer(text,text,uuid,text,text,text,boolean,boolean,text) from public;
grant execute on function public.tend_submit_prayer(text,text,uuid,text,text,text,boolean,boolean,text) to anon, authenticated;
