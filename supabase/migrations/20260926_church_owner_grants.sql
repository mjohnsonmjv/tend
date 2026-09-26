-- Owner write grants for tend_churches.
-- RLS policies (tend_church_owner_create / tend_church_owner_update) already
-- scope writes to the owning user; the table-level grants were revoked in
-- 20260918_tend_core.sql and never restored, which broke church signup and
-- settings updates for all signed-in users.
grant insert on public.tend_churches to authenticated;
grant update on public.tend_churches to authenticated;
