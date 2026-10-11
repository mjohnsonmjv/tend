-- Remove the dead 7-arg tend_signup_watch_slot overload.
-- The 8-arg version (with p_anonymous) from 20261007_watch_anonymous_signup.sql
-- is the live one; the 7-arg from 20261003_prayer_watches.sql is unreachable.
drop function if exists public.tend_signup_watch_slot(text, bigint, text, uuid, text, text, text);
