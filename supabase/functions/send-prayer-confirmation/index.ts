// Supabase Edge Function: send-prayer-confirmation
//
// Trigger: Database Webhook on INSERT into public.tend_prayers,
// filtered to rows where submitter_email is not null.
// The webhook POSTs the row as { record: {...} }.
//
// Required function secrets (set with `supabase secrets set`):
//   RESEND_API_KEY            API key from resend.com
//   CONFIRM_FROM              e.g. "Tend <hello@tendpray.com>" (must be a verified Resend sender/domain)
//   SUPABASE_URL              project URL
//   SUPABASE_SERVICE_ROLE_KEY service-role key (server-side only, never in the frontend)
//
// Deploy: supabase functions deploy send-prayer-confirmation --no-verify-jwt
// (no-verify-jwt because the database webhook does not carry a user JWT.)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CONFIRM_FROM = Deno.env.get("CONFIRM_FROM") ?? "Tend <hello@tendpray.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const record = body?.record ?? {};
  const to = (record.submitter_email ?? "").trim();
  // Never email real prayer content. Only confirmations go out.
  if (!to || record.is_anonymous) return new Response("ok: no email", { status: 200 });

  let churchName = "your church";
  let greeting = "Thank you for sharing. Your request has been received.";
  let pastorName = "";
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await sb
      .from("tend_churches")
      .select("name,pastor_name,greeting_message")
      .eq("id", record.church_id)
      .single();
    if (data) {
      churchName = data.name ?? churchName;
      greeting = data.greeting_message ?? greeting;
      pastorName = data.pastor_name ?? "";
    }
  } catch {
    // Fall back to generic copy rather than failing the send.
  }

  const subject = `Your prayer request was received`;
  const text =
    `Thank you for sharing with ${churchName}.\n\n` +
    `"${greeting}"${pastorName ? ` (from ${pastorName})` : ""}\n\n` +
    `Your request was received and will be seen by the care team. ` +
    `This is a confirmation, not a reply. If this is an emergency, please contact emergency services or someone you trust directly.\n\n` +
    `With care,\nThe Tend team`;
  const html =
    `<p>Thank you for sharing with <strong>${escapeHtml(churchName)}</strong>.</p>` +
    `<p><em>&ldquo;${escapeHtml(greeting)}&rdquo;</em>${pastorName ? ` (from ${escapeHtml(pastorName)})` : ""}</p>` +
    `<p>Your request was received and will be seen by the care team. ` +
    `This is a confirmation, not a reply. If this is an emergency, please contact emergency services or someone you trust directly.</p>` +
    `<p>With care,<br/>The Tend team</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: CONFIRM_FROM, to, subject, text, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("resend error", res.status, err);
    return new Response("email failed", { status: 502 });
  }
  return new Response("ok: sent", { status: 200 });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
