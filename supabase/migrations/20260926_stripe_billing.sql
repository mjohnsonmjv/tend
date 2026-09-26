-- Stripe billing: track the active subscription per church.
-- plan values ('pilot','starter','growth','large') already cover paid tiers;
-- the webhook sets plan + stripe_subscription_id on subscription events.
alter table public.tend_churches
  add column if not exists stripe_subscription_id text;
