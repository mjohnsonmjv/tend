-- Expose the church logo on the public prayer-submission page.
--
-- Additive change to tend_public_church: one new key, logoUrl, returned only
-- for paid tiers (starter/growth) that saved a logo. CREATE OR REPLACE
-- preserves the existing grants to anon/authenticated. Safe to apply live.

create or replace function public.tend_public_church(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', slug,
    'name', name,
    'pastorName', pastor_name,
    'greetingMessage', greeting_message,
    'logoUrl', case when plan in ('starter','growth') then logo_url else null end
  )
  from public.tend_churches where slug = p_slug;
$$;
