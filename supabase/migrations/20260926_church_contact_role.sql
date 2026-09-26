-- Who set the church up: pastor, staff, board member, volunteer,
-- congregant, or a donor/friend gifting Tend to the church.
alter table public.tend_churches
  add column if not exists contact_role text
  check (contact_role is null or contact_role in
    ('pastor','staff','board','volunteer','congregant','donor'));
