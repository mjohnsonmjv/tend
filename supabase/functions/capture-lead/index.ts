// capture-lead: stores a nurture lead from the demo prayer page and
// schedules the 3-email Tend welcome sequence via Resend (scheduled_at).
// POST { email: string, source?: string }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("CONFIRM_FROM") || "Tend <support@tendpray.com>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://tendpray.com";
const UNSUB_BASE = `${SUPABASE_URL}/functions/v1/nurture-unsubscribe`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

// Verifies the Turnstile token with Cloudflare. When no secret is configured
// (e.g. local dev), verification is skipped so the form keeps working.
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function db(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`DB ${path} failed: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function footer(unsubUrl: string) {
  return `<p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">You are getting this because you tried the Tend demo. <a href="${unsubUrl}">Unsubscribe</a><br/>Mark Johnson Ventures LLC, 551 Settlers Drive, Suite 200, Ada, MI 49301</p>`;
}

function email1(unsubUrl: string) {
  return {
    subject: "Your church's prayer page is 5 minutes away",
    html: `<p>Hi there,</p><p>You just tried the Tend demo. Thank you.</p><p>Your own prayer page and QR code are only a few minutes away. Sign up, and Tend generates everything: the page, the code, the inbox.</p><p><a href="${SITE_URL}/#/signup">Get your church's QR code</a></p><p>No app for your congregation to download. The small-group plan is free forever, and no card is required.</p><p>With care,<br/>The Tend team</p>${footer(unsubUrl)}`,
  };
}

function email2(unsubUrl: string) {
  return {
    subject: "What happens after someone scans your QR code?",
    html: `<p>Hi there,</p><p>Every request lands in one inbox, ready for care and follow-up. Mark requests new, praying, or prayed for, and keep private notes for your next conversation.</p><p><a href="${SITE_URL}/#/demo">Try the prayer inbox</a></p><p>Small moments of follow-up are what turn a scan into a relationship.</p><p>With care,<br/>The Tend team</p>${footer(unsubUrl)}`,
  };
}

function email3(unsubUrl: string) {
  return {
    subject: "Want a hand getting Tend set up?",
    html: `<p>Hi there,</p><p>If you would like help, just reply to this email and we will walk you through it.</p><p>Your free rollout kit is ready too: an announcement slide and a pew card, each with a slot for your church's QR code.</p><p><a href="${SITE_URL}/#/signup">Get your church's QR code</a></p><p>With care,<br/>The Tend team</p>${footer(unsubUrl)}`,
  };
}

async function scheduleEmail(to: string, unsubUrl: string, scheduledAt: Date, tpl: { subject: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: tpl.subject,
      html: tpl.html,
      scheduled_at: scheduledAt.toISOString(),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) throw new Error(`Resend schedule failed: ${await res.text()}`);
  return res.json();
}

// Best-effort per-IP rate limiting backed by the rate_limits table.
// Returns true when the caller is over the limit and should be rejected.
async function overLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const now = Date.now();
  const rows = await db(`rate_limits?key=eq.${encodeURIComponent(key)}&select=window_start,count`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || now - new Date(row.window_start).getTime() > windowSeconds * 1000) {
    await db("rate_limits", {
      method: "POST",
      body: JSON.stringify({ key, window_start: new Date(now).toISOString(), count: 1 }),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    }).catch(async () => {
      // Row appeared concurrently; reset it instead.
      await db(`rate_limits?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ window_start: new Date(now).toISOString(), count: 1 }),
      });
    });
    return false;
  }
  if (row.count >= max) return true;
  await db(`rate_limits?key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify({ count: row.count + 1 }),
  });
  return false;
}

function clientIp(req: Request): string {
  // Supabase sits behind Cloudflare: CF-Connecting-IP is the true client IP,
  // while x-forwarded-for carries rotating Cloudflare edge IPs.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (await overLimit(`capture-lead:${clientIp(req)}`, 5, 3600)) {
    return new Response("Too many requests. Please try again later.", { status: 429 });
  }
  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const source = typeof body.source === "string" && body.source.length < 40 ? body.source : "demo";
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  if (!EMAIL_RE.test(email)) return new Response("Invalid email", { status: 400 });
  const ip = clientIp(req);
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return new Response(JSON.stringify({ error: "Verification failed. Please try again." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  if (!RESEND_KEY) return new Response("Email not configured", { status: 500 });

  try {
    const existing = await db(`nurture_leads?email=eq.${encodeURIComponent(email)}&select=id,unsubscribed_at,unsub_token,emails_sent`);
    const lead = Array.isArray(existing) ? existing[0] : null;
    if (lead?.unsubscribed_at) {
      return new Response(JSON.stringify({ ok: true, resubscribed: false }), {
        headers: { "content-type": "application/json" },
      });
    }
    let unsubToken: string;
    if (lead) {
      unsubToken = lead.unsub_token;
    } else {
      const created = await db("nurture_leads", {
        method: "POST",
        body: JSON.stringify({ email, source }),
      });
      unsubToken = created[0].unsub_token;
    }
    const unsubUrl = `${UNSUB_BASE}?email=${encodeURIComponent(email)}&token=${unsubToken}`;
    const now = Date.now();
    const schedule = [
      { at: new Date(now + 60 * 60 * 1000), tpl: email1(unsubUrl) },
      { at: new Date(now + 3 * 24 * 60 * 60 * 1000), tpl: email2(unsubUrl) },
      { at: new Date(now + 7 * 24 * 60 * 60 * 1000), tpl: email3(unsubUrl) },
    ];
    if (!lead) {
      // Keep the Resend IDs so an unsubscribe can cancel the still-scheduled
      // messages instead of letting them send after the opt-out.
      const scheduledIds: string[] = [];
      for (const s of schedule) {
        const sent = await scheduleEmail(email, unsubUrl, s.at, s.tpl);
        if (sent && typeof sent.id === "string") scheduledIds.push(sent.id);
      }
      await db(`nurture_leads?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH",
        body: JSON.stringify({ emails_sent: 3, scheduled_email_ids: scheduledIds }),
      });
    }
    return new Response(JSON.stringify({ ok: true, scheduled: !lead }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("capture-lead failed", e);
    return new Response("Server error", { status: 500 });
  }
});
