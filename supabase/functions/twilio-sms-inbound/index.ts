// Twilio inbound SMS webhook -> Tend prayer request.
//
// Receives texts sent to a church's Twilio number and stores them as prayer
// requests. Twilio handles STOP/UNSUBSCRIBE opt-outs automatically.
//
// Deploy: supabase functions deploy twilio-sms-inbound
// Secrets (server-side only):
//   TWILIO_AUTH_TOKEN        your Twilio auth token (for signature verification)
//   SUPABASE_URL             project URL
//   SUPABASE_SERVICE_ROLE_KEY service role key (inserts bypass RLS)
// Twilio console: set the number's Messaging webhook to
//   https://<project-ref>.supabase.co/functions/v1/twilio-sms-inbound

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Verify the X-Twilio-Signature header per Twilio's docs:
// HMAC-SHA256(authToken, url + sortedParams), base64-encoded.
async function verifySignature(url: string, params: Record<string, string>, signature: string): Promise<boolean> {
  if (!AUTH_TOKEN || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Bad request", { status: 400 });
  }

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  // Reconstruct the exact URL Twilio called (behind proxies, prefer forwarded host).
  const fwdProto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const fwdHost = req.headers.get("x-forwarded-host") ?? new URL(req.url).host;
  const fullUrl = `${fwdProto}://${fwdHost}${new URL(req.url).pathname}`;
  const signature = req.headers.get("x-twilio-signature") ?? "";

  if (!(await verifySignature(fullUrl, params, signature))) {
    console.error("twilio-sms-inbound: invalid signature");
    return new Response("Forbidden", { status: 403 });
  }

  const from = params["From"] ?? "";
  const to = params["To"] ?? "";
  const body = (params["Body"] ?? "").trim();

  if (!from || !to || !body) {
    // Empty body: respond with TwiML help text so the sender knows what to do.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks for reaching out. Just reply with your prayer request and we'll share it with the care team.</Message></Response>`;
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Route the text to the church that owns the number it was sent to.
  const { data: church, error: churchErr } = await supabase
    .from("tend_churches")
    .select("id")
    .eq("sms_number", to)
    .maybeSingle();

  if (churchErr || !church) {
    console.error("twilio-sms-inbound: no church for number", to, churchErr?.message);
    return new Response("Not found", { status: 404 });
  }

  const { error: insertErr } = await supabase.from("tend_prayers").insert({
    church_id: church.id,
    message: body.slice(0, 2000),
    category: "prayer",
    submitter_name: null,
    submitter_contact: from,
    anonymous: true,
    status: "new",
  });

  if (insertErr) {
    console.error("twilio-sms-inbound: insert failed", insertErr.message);
    return new Response("Server error", { status: 500 });
  }

  // One confirmation text. Costs one outbound segment; disable by returning
  // empty TwiML if SMS spend needs trimming.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Received. Your request was shared with the care team, and they're praying for you.</Message></Response>`;
  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
});
