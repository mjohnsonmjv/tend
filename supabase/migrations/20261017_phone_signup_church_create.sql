-- Phone-first signup: a user who signed up by text has no verified email in
-- the JWT yet (email is added after verification and confirmed by link).
-- Keep the email-match rule for users who have a verified email; for users
-- without one, require a non-empty pastor_email. Ownership is still bound by
-- auth.uid() either way.
drop policy if exists tend_church_owner_create on public.tend_churches;
create policy tend_church_owner_create on public.tend_churches for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    (select auth.jwt()->>'email') = pastor_email
    or ((select auth.jwt()->>'email') is null and pastor_email is not null and char_length(pastor_email) between 3 and 254)
  )
);
