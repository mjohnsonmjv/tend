// Twilio inbound SMS webhook -> private Tend prayer request.
//
// A congregant texts a church keyword (e.g. PRAY) or a church's own Tend number.
// Tend replies "How can we pray for you?" and the next text is saved privately
// to that church's prayer inbox (never the public wall), with one confirmation.
//
// Secrets: the Twilio auth token is read from Supabase Vault through the
// service-role-only RPC tend_twilio_auth_token(). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime.
// STOP/START/HELP are answered by Twilio's messaging-service opt-out handling.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_URL = `${SUPABASE_URL}/functions/v1/twilio-sms-inbound`;
const KEYWORDS = new Set(["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT","START","UNSTOP","YES","HELP","INFO"]);
const team = (church?: string) => !church || church === "Tend Text Line" ? "the Tend prayer team" : `${church}'s prayer team`;
const PROMPT = (church?: string) => `Tend Prayer Requests${church && church !== "Tend Text Line" ? ` for ${church}` : ""}: How can we pray for you? Reply with your prayer request and it will be shared privately with ${team(church)}. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
const CONFIRM = (church?: string) => `Tend Prayer Requests: Thank you. Your request was shared privately with ${team(church)}. Msg & data rates may apply. Reply STOP to opt out.`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
let cachedToken: string | null = null;

async function authToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const { data, error } = await supabase.rpc("tend_twilio_auth_token");
  if (error || !data) throw new Error("auth token unavailable");
  cachedToken = String(data);
  return cachedToken;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function validSignature(params: Record<string, string>, signature: string): Promise<boolean> {
  if (!signature) return false;
  const data = PUBLIC_URL + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(await authToken()),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return safeEqual(btoa(String.fromCharCode(...new Uint8Array(mac))), signature);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const twiml = (msg?: string) => new Response(
  `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${xml(msg)}</Message>` : ""}</Response>`,
  { headers: { "Content-Type": "text/xml" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!(req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")) {
    return new Response("Bad request", { status: 400 });
  }
  const params: Record<string, string> = {};
  (await req.formData()).forEach((v, k) => { params[k] = String(v); });

  try {
    if (!(await validSignature(params, req.headers.get("x-twilio-signature") ?? ""))) {
      console.error("twilio-sms-inbound: invalid signature");
      return new Response("Forbidden", { status: 403 });
    }
  } catch (e) {
    console.error("twilio-sms-inbound: signature check failed", (e as Error).message);
    return new Response("Server error", { status: 500 });
  }

  const from = params["From"] ?? "", to = params["To"] ?? "", body = (params["Body"] ?? "").trim();
  if (KEYWORDS.has(body.toUpperCase())) return twiml();
  if (!from || !to || !body) return twiml();

  const { data, error } = await supabase.rpc("tend_sms_handle", {
    p_to: to, p_from: from, p_body: body, p_message_sid: params["MessageSid"] ?? null,
  });
  if (error) {
    console.error("twilio-sms-inbound: save failed", error.message);
    return new Response("Server error", { status: 500 });
  }
  if (data?.action === "prompt") return twiml(PROMPT(data.church));
  if (data?.action === "saved") return twiml(CONFIRM(data.church));
  if (data?.action !== "duplicate") console.error("twilio-sms-inbound: not saved", data?.action, data?.reason);
  return twiml();
});
