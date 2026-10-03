import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const isEmail = (v: unknown) => typeof v === "string" && v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async (req: Request) => {
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
    const text = `You've been invited to cover a time in prayer.\n\n${title}\n\nPick a 15-minute slot here:\n${signupUrl}\n\nWith care,\nThe Tend team`;
    const html = `<p>You've been invited to cover a time in prayer.</p>` +
      `<p><strong>${escapeHtml(title)}</strong></p>` +
      `<p><a href="${escapeHtml(signupUrl)}">Pick a 15-minute slot here</a></p>` +
      `<p>With care,<br/>The Tend team</p>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
Authorization: <redacted>
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
