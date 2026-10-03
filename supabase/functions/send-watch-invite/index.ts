import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  });

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const isEmail = (v: unknown) => typeof v === "string" && v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return reply(401, { error: "unauthorized" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("INVITE_FROM") || "Tend <support@tendpray.com>";
  if (!supabaseUrl || !anonKey) return reply(503, { error: "configuration_unavailable" });

  let body: { watchId?: number; title?: string; signupUrl?: string; invites?: { id: number; email: string; token: string }[] };
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_request" }); }
  const { watchId, title, signupUrl, invites } = body;
  if (typeof watchId !== "number" || !title || !signupUrl || !Array.isArray(invites) || !invites.length) {
    return reply(400, { error: "invalid_request" });
  }
  const clean = invites.filter(i => typeof i.id === "number" && isEmail(i.email) && typeof i.token === "string");
  if (!clean.length) return reply(400, { error: "invalid_request" });

  // Verify the caller owns this watch (RLS enforces it on the select).
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: watch, error: watchErr } = await supabase
    .from("tend_prayer_watches").select("id").eq("id", watchId).single();
  if (watchErr || !watch) return reply(403, { error: "not_authorized" });
  if (!resendKey) return reply(503, { error: "configuration_unavailable" });

  let sent = 0;
  const failed: string[] = [];
  for (const invite of clean.slice(0, 100)) {
    const subject = `You're invited: ${title} - 24/7 prayer`;
    const text = `You've been invited to cover a time in prayer.\n\n${title}\n\nWhen Bill Bright founded Cru, he began with a 24-hour prayer chain, dividing each day into 96 fifteen-minute segments. Every great movement of God starts the same way: ordinary people surrendering to Him in prayer, around the clock.\n\nPick a 15-minute slot here:\n${signupUrl}\n\nWith care,\nThe Tend team`;
    const html =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF8F1;margin:0;padding:0;">` +
      `<tr><td align="center" style="padding:32px 16px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;">` +
      `<tr><td align="center" style="padding:32px 32px 8px;font-family:Georgia,serif;font-size:28px;color:#2A2521;">Tend</td></tr>` +
      `<tr><td align="center" style="padding:0 32px 8px;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:#2A2521;">${escapeHtml(title)}</td></tr>` +
      `<tr><td align="center" style="padding:0 32px 16px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#5c554e;">You've been invited to cover a time in prayer.</td></tr>` +
      `<tr><td style="padding:0 32px 16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#5c554e;">When Bill Bright founded Cru, he began with a 24-hour prayer chain, dividing each day into 96 fifteen-minute segments. Every great movement of God starts the same way: ordinary people surrendering to Him in prayer, around the clock.</td></tr>` +
      `<tr><td align="center" style="padding:0 32px 20px;font-family:Georgia,serif;font-style:italic;font-size:15px;line-height:1.6;color:#2A2521;">"Pray continually."<br/><span style="font-family:Arial,sans-serif;font-style:normal;font-size:12px;color:#8a8178;">1 Thessalonians 5:17</span></td></tr>` +
      `<tr><td align="center" style="padding:8px 32px 32px;">` +
      `<a href="${escapeHtml(signupUrl)}" style="display:inline-block;background-color:#EFC65E;color:#2A2521;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 32px;border-radius:999px;">Pick a time to pray</a>` +
      `</td></tr>` +
      `</table>` +
      `<p style="font-family:Arial,sans-serif;font-size:12px;color:#8a8178;margin:16px 0 0;">With care,<br/>The Tend team<br/><a href="mailto:support@tendpray.com" style="color:#8a8178;">support@tendpray.com</a></p>` +
      `</td></tr></table>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `tend-watch-invite/${invite.token}`,
        },
        body: JSON.stringify({ from, to: invite.email, subject, text, html }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { failed.push(invite.email); continue; }
      sent++;
      await supabase.from("tend_prayer_watch_invites").update({ sent_at: new Date().toISOString() }).eq("id", invite.id);
    } catch { failed.push(invite.email); }
  }
  return reply(200, { ok: true, sent, failed: failed.length ? failed : undefined });
});
