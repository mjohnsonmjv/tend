-- Fix prayer-request delete (reported 2026-10-14 by Jake Tibbe): the
-- 20261012 migration created the tend_prayer_owner_delete RLS policy but never
-- granted DELETE, so every delete failed with "permission denied for table
-- tend_prayers" (RLS policies filter rows; the role still needs the privilege).
-- The owner-or-care-team-member RLS policy continues to scope which rows can
-- be deleted.
grant delete on public.tend_prayers to authenticated;

-- Same missing-grant class of bug: the prayer-wall share toggle updates
-- is_private, which had no UPDATE grant (only status and pastor_notes did).
grant update(is_private) on public.tend_prayers to authenticated;
