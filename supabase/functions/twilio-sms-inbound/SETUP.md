# Tend SMS text-in setup

Inbound texts: a congregant texts a prayer to their church's Twilio number;
the `twilio-sms-inbound` Edge Function verifies Twilio's signature, routes
by the receiving number, and stores the prayer. The sender gets one
confirmation text.

**Do not start this until Twilio compliance rejection 18601 is resolved.**
Nothing below can receive texts without an approved profile.

## 1. Fix the Twilio compliance profile (owner action, Twilio console)

The primary business profile was rejected with error 18601
(business-name/website association). In the Twilio console:

1. Open Trust Hub / Compliance and correct the business profile:
   - Legal business name: Mark Johnson Ventures LLC
   - Website: https://tendpray.com
   - Business address: the non-home business address already on file
     (verification use only; never published on the site)
2. Re-submit the profile and wait for approval.

Status note (verified via Twilio API 2026-09-23): the account already has an
**approved** profile named "Mark Johnson Ventures LLC" (approved 2026-04-19).
The reapplied "Mark Johnson Ventures" profile (no LLC suffix) was rejected
again on 2026-09-18 with 18601. On 2026-09-23 Mark re-submitted the primary
profile with the LLC name and tendpray.com URL; it is now pending Twilio
review. Once approved, use it for A2P brand registration.

## 2. A2P 10DLC brand and campaign (owner action)

US carriers require this for application-to-person texting:

1. Register the A2P brand (Mark Johnson Ventures LLC / Tend).
2. Create a campaign for prayer-request notifications, sample message:
   "Tend: a prayer request was shared with your church's care team. Reply STOP to opt out."
3. Wait for carrier approval before buying numbers or going live.

Cheaper alternative for launch: a Twilio toll-free number (own verification
flow, lower monthly cost, no A2P campaign). Decide before buying.

## 3. Buy a 616 number for the pilot church (owner action)

- In the Twilio console, buy one long-code number in area code 616.
- Do NOT reuse +1 877-745-1209 (belongs to MJV Budget SMS).
- Set the number's Messaging webhook to:
  `https://<project-ref>.supabase.co/functions/v1/twilio-sms-inbound`

## 4. Deploy (agent, needs Supabase access)

```bash
# Apply migrations (adds sms_number to tend_churches)
supabase db push

# Deploy the function
supabase functions deploy twilio-sms-inbound

# Secrets -- never in the frontend, never in chat
supabase secrets set TWILIO_AUTH_TOKEN=... \
  SUPABASE_URL=https://<project-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=...
```

Then assign the number to the church:

```sql
update tend_churches set sms_number = '+16165550123' where slug = 'demo';
```

## 5. Test

Text the number from a personal phone with a non-sensitive test message
(never real prayer content). Confirm the prayer appears in the dashboard
and the confirmation text arrives.

## Costs (approx, 2026)

- Long-code number: ~$1.15/month each (one per church at launch).
- Inbound SMS: ~$0.0075/message. Confirmation reply: another segment.
- Keep SMS tier-limited per the launch plan; email stays the default channel.
