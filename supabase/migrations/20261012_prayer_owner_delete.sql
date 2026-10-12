-- Let church owners hard-delete prayer requests (e.g. removing test requests).
-- tend_prayer_prays and pco sync rows cascade on delete.
create policy tend_prayer_owner_delete on public.tend_prayers for delete to authenticated
using (exists(
  select 1 from public.tend_churches c
  where c.id = church_id and c.owner_id = (select auth.uid())
));
