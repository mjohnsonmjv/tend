-- Care team members: multiple admins per church (Mark's decision 2026-10-13).
-- The $99 Large Church plan advertises "Team accounts"; this delivers it.
-- A member is identified by email (lowercased), so a person can administer a
-- church from any Tend account using that email address.

-- ------------------------------------------------------------------ table
create table public.tend_care_team_members (
  id bigint generated always as identity primary key,
  church_id bigint not null references public.tend_churches(id) on delete cascade,
  email text not null,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index tend_care_team_members_church_email_uidx
  on public.tend_care_team_members(church_id, lower(email));
create index tend_care_team_members_church_idx on public.tend_care_team_members(church_id);
create index tend_care_team_members_email_idx on public.tend_care_team_members(lower(email));

alter table public.tend_care_team_members enable row level security;
revoke all on public.tend_care_team_members from anon, authenticated;
grant select, insert, delete on public.tend_care_team_members to authenticated;

-- ------------------------------------------------- membership helper fn
-- Security definer so RLS policies can call it without recursion issues.
-- auth.jwt() still reflects the calling user inside a security definer fn.
create or replace function public.tend_is_care_team_member(p_church_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.tend_care_team_members m
    where m.church_id = p_church_id
      and lower(m.email) = lower(auth.jwt()->>'email')
  );
$$;
grant execute on function public.tend_is_care_team_member(bigint) to authenticated;

-- --------------------------------------- RLS on tend_care_team_members
-- Written with direct email checks (not via the helper) to avoid recursion.
drop policy if exists tend_care_team_select on public.tend_care_team_members;
create policy tend_care_team_select on public.tend_care_team_members
  for select to authenticated
  using (
    exists(select 1 from public.tend_churches c
           where c.id = church_id and c.owner_id = (select auth.uid()))
    or lower(email) = lower(auth.jwt()->>'email')
  );

-- NOTE on the subqueries below: the inner alias `m` also has a church_id
-- column, so a bare `church_id` would resolve to the inner row instead of the
-- row being inserted/deleted. Qualifying with the policy target table name
-- (`tend_care_team_members.church_id`) pins the reference to the outer row.
drop policy if exists tend_care_team_insert on public.tend_care_team_members;
create policy tend_care_team_insert on public.tend_care_team_members
  for insert to authenticated
  with check (
    exists(select 1 from public.tend_churches c
           where c.id = church_id and c.owner_id = (select auth.uid()))
    or exists(select 1 from public.tend_care_team_members m
              where m.church_id = tend_care_team_members.church_id
                and lower(m.email) = lower(auth.jwt()->>'email'))
  );

drop policy if exists tend_care_team_delete on public.tend_care_team_members;
create policy tend_care_team_delete on public.tend_care_team_members
  for delete to authenticated
  using (
    exists(select 1 from public.tend_churches c
           where c.id = church_id and c.owner_id = (select auth.uid()))
    or exists(select 1 from public.tend_care_team_members m
              where m.church_id = tend_care_team_members.church_id
                and lower(m.email) = lower(auth.jwt()->>'email'))
  );

-- --------------------------------- extend existing policies: members
-- tend_churches: select + update (insert/delete stay owner-only)
drop policy if exists tend_church_owner_read on public.tend_churches;
create policy tend_church_owner_read on public.tend_churches
  for select to authenticated
  using (owner_id = (select auth.uid())
         or public.tend_is_care_team_member(id));

drop policy if exists tend_church_owner_update on public.tend_churches;
create policy tend_church_owner_update on public.tend_churches
  for update to authenticated
  using (owner_id = (select auth.uid())
         or public.tend_is_care_team_member(id))
  with check (owner_id = (select auth.uid())
              or public.tend_is_care_team_member(id));

-- tend_prayers: select, update, delete
drop policy if exists tend_prayer_owner_read on public.tend_prayers;
create policy tend_prayer_owner_read on public.tend_prayers
  for select to authenticated
  using (exists(select 1 from public.tend_churches c
                where c.id = church_id and c.owner_id = (select auth.uid()))
         or public.tend_is_care_team_member(church_id));

drop policy if exists tend_prayer_owner_update on public.tend_prayers;
create policy tend_prayer_owner_update on public.tend_prayers
  for update to authenticated
  using (exists(select 1 from public.tend_churches c
                where c.id = church_id and c.owner_id = (select auth.uid()))
         or public.tend_is_care_team_member(church_id))
  with check (exists(select 1 from public.tend_churches c
                     where c.id = church_id and c.owner_id = (select auth.uid()))
              or public.tend_is_care_team_member(church_id));

drop policy if exists tend_prayer_owner_delete on public.tend_prayers;
create policy tend_prayer_owner_delete on public.tend_prayers
  for delete to authenticated
  using (exists(
    select 1 from public.tend_churches c
    where c.id = church_id and c.owner_id = (select auth.uid()))
    or public.tend_is_care_team_member(church_id)
  );

-- tend_prayer_prays: select (users still read their own taps)
drop policy if exists tend_prayer_prays_read_own on public.tend_prayer_prays;
create policy tend_prayer_prays_read_own on public.tend_prayer_prays
  for select to authenticated
  using (user_id = auth.uid()
         or public.tend_is_care_team_member(church_id));

-- tend_prayer_watches: all
drop policy if exists tend_watch_owner_all on public.tend_prayer_watches;
create policy tend_watch_owner_all on public.tend_prayer_watches
  for all to authenticated
  using (exists(select 1 from public.tend_churches c
                where c.id = church_id and c.owner_id = (select auth.uid()))
         or public.tend_is_care_team_member(church_id))
  with check (exists(select 1 from public.tend_churches c
                     where c.id = church_id and c.owner_id = (select auth.uid()))
              or public.tend_is_care_team_member(church_id));

-- tend_prayer_watch_slots: select
drop policy if exists tend_watch_slot_owner_read on public.tend_prayer_watch_slots;
create policy tend_watch_slot_owner_read on public.tend_prayer_watch_slots
  for select to authenticated
  using (exists(
    select 1 from public.tend_prayer_watches w
    join public.tend_churches c on c.id = w.church_id
    where w.id = watch_id
      and (c.owner_id = (select auth.uid())
           or public.tend_is_care_team_member(w.church_id))));

-- tend_prayer_watch_invites: all
drop policy if exists tend_watch_invite_owner_all on public.tend_prayer_watch_invites;
create policy tend_watch_invite_owner_all on public.tend_prayer_watch_invites
  for all to authenticated
  using (exists(
    select 1 from public.tend_prayer_watches w
    join public.tend_churches c on c.id = w.church_id
    where w.id = watch_id
      and (c.owner_id = (select auth.uid())
           or public.tend_is_care_team_member(w.church_id))))
  with check (exists(
    select 1 from public.tend_prayer_watches w
    join public.tend_churches c on c.id = w.church_id
    where w.id = watch_id
      and (c.owner_id = (select auth.uid())
           or public.tend_is_care_team_member(w.church_id))));

-- device_tokens: all (owner or member of the token's church)
-- Guarded: the device_tokens table was never created in production
-- (its 2026-09-30 migration was not applied), so skip if absent.
do $$
begin
  if to_regclass('public.device_tokens') is not null then
    drop policy if exists device_tokens_owner_all on public.device_tokens;
    create policy device_tokens_owner_all on public.device_tokens
      for all to authenticated
      using (user_id = (select auth.uid())
             or public.tend_is_care_team_member(church_id))
      with check (user_id = (select auth.uid())
                  or public.tend_is_care_team_member(church_id));
  end if;
end $$;
