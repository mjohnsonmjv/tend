-- Tighten the authenticated UPDATE grant on tend_churches back to the
-- greeting_message column only. A 20260926 migration widened it to full-row
-- UPDATE, which lets any signed-in pastor modify plan, stripe_customer_id,
-- stripe_subscription_id, slug, and pastor_email on their own church,
-- bypassing Stripe and breaking public URLs. The client only ever PATCHes
-- the greeting (see /api/churches/:id/greeting), and the owner-only RLS
-- update policy still scopes which rows are updatable.
revoke update on public.tend_churches from authenticated;
grant update(greeting_message) on public.tend_churches to authenticated;
