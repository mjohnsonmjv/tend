-- Track Resend scheduled email IDs for nurture leads so that an unsubscribe
-- can cancel the still-scheduled messages via the Resend API.
alter table public.nurture_leads
  add column if not exists scheduled_email_ids text[] not null default '{}';
