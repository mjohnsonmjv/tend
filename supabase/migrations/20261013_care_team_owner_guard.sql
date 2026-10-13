-- Care team hardening: only the church owner can change owner_id.
-- The tend_church_owner_update policy lets care team members update church
-- rows; without this guard a member could transfer ownership via direct API.
-- The web UI only ever updates the greeting, so this changes no legit flow.
create or replace function public.tend_church_protect_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and old.owner_id is distinct from (select auth.uid()) then
    raise exception 'Only the church owner can transfer ownership';
  end if;
  return new;
end;
$$;

revoke all on function public.tend_church_protect_owner() from public, anon, authenticated;

drop trigger if exists tend_church_protect_owner on public.tend_churches;
create trigger tend_church_protect_owner
  before update on public.tend_churches
  for each row execute function public.tend_church_protect_owner();
