-- Adds an optional per-church SMS number for text-in prayer requests.
-- Applied only when SMS compliance is approved; harmless otherwise.

alter table tend_churches
  add column if not exists sms_number text unique;

comment on column tend_churches.sms_number is
  'E.164 Twilio number assigned to this church for inbound text-in prayer requests, e.g. +16165550123';
