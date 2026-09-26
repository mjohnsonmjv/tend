// Stripe webhook: keeps tend_churches plan/subscription in sync.
// Configure the endpoint in Stripe (or via API) with events:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted,
//   invoice.payment_failed

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("CONFIRM_FROM") || "Tend <support@tendpray.com>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://tendpray.com";

const PLANS = ["starter", "growth", "large"];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifySignature(payload: string, header: string | null): Promise<boolean> {
  if (!header || !WEBHOOK_SECRET) return false;
  const parts: Record<string, string> = {};
  for (const p of header.split(",")) {
    const i = p.indexOf("=");
    if (i > 0) parts[p.slice(0, i)] = p.slice(i + 1);
  }
  if (!parts.t || !parts.v1) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${parts.t}.${payload}`)
  );
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return parts.v1.split(" ").some((s) => timingSafeEqual(hex, s));
}

async function db(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`DB ${path} failed: ${await res.text()}`);
  return res.json();
}

const validPlan = (p: unknown) => (typeof p === "string" && PLANS.includes(p) ? p : null);

async function sendTrialStartedEmail(to: string, churchName: string, plan: string) {
  if (!RESEND_KEY || !to) return;
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `Your Tend ${planLabel} trial has started`,
      html: `<p>Hello from Tend,</p><p>Your 30-day free trial of the Tend ${planLabel} plan for <strong>${churchName}</strong> has started. Nothing is charged today, and no card is on file.</p><p>When the trial ends, we will email you before anything is charged. You can manage or cancel the plan at any time from your church settings page.</p><p>Thank you for tending your congregation's prayers with us,<br/>The Tend team</p>`,
    }),
  }).catch((e) => console.error("trial email failed", e));
}

async function sendGiftReceivedEmail(to: string, churchName: string, plan: string) {
  if (!RESEND_KEY || !to) return;
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `Someone gifted Tend ${planLabel} to ${churchName}`,
      html: `<p>Hello,</p><p>Good news: someone gifted the Tend ${planLabel} plan to <strong>${churchName}</strong>, so your church now has the paid features at no cost to you.</p><p>Nothing else changes. Prayer requests keep arriving in your inbox the same way, and the gift renews automatically on the giver's card until they cancel. If the gift ever ends, we will email you first.</p><p>With care,<br/>The Tend team</p>`,
    }),
  }).catch((e) => console.error("gift received email failed", e));
}

async function sendGiftReceiptEmail(to: string, churchName: string, plan: string) {
  if (!RESEND_KEY || !to) return;
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `You gifted Tend ${planLabel} to ${churchName}`,
      html: `<p>Hello,</p><p>Thank you for gifting the Tend ${planLabel} plan to <strong>${churchName}</strong>. Your first payment went through today, and the church's team has been notified.</p><p>The gift renews automatically. If you ever want to change or cancel it, just reply to this email and we will take care of it.</p><p>With gratitude,<br/>The Tend team</p>`,
    }),
  }).catch((e) => console.error("gift receipt email failed", e));
}

async function sendDunningEmail(to: string, churchName: string, churchId: number) {
  if (!RESEND_KEY || !to) return;
  const settingsUrl = `${SITE_URL}/#/church/${churchId}/settings`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: "Tend billing: a payment needs your attention",
      html: `<p>Hello from Tend,</p><p>We could not collect payment for <strong>${churchName}</strong>'s Tend subscription. Your prayer page keeps working during the retry period, but please update your payment method to avoid interruption.</p><p><a href="${settingsUrl}">Open billing settings</a></p><p>Thank you,<br/>The Tend team</p>`,
    }),
  }).catch((e) => console.error("dunning email failed", e));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const payload = await req.text();
  if (!(await verifySignature(payload, req.headers.get("stripe-signature")))) {
    return new Response("Bad signature", { status: 400 });
  }
  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response("Bad JSON", { status: 400 }); }

  try {
    const type = event.type as string;
    if (type === "checkout.session.completed") {
      const s = event.data.object;
      const churchId = Number(s.metadata?.church_id);
      const plan = validPlan(s.metadata?.plan);
      const isGift = s.metadata?.gift === "true";
      if (churchId && plan) {
        await db(`tend_churches?id=eq.${churchId}`, {
          method: "PATCH",
          body: JSON.stringify({
            plan, stripe_customer_id: s.customer, stripe_subscription_id: s.subscription,
          }),
        });
        const rows = await db(`tend_churches?id=eq.${churchId}&select=name,pastor_email`);
        const church = Array.isArray(rows) ? rows[0] : null;
        if (church) {
          if (isGift) {
            const donorEmail = s.customer_details?.email || s.customer_email || "";
            await sendGiftReceivedEmail(church.pastor_email, church.name, plan);
            if (donorEmail) await sendGiftReceiptEmail(donorEmail, church.name, plan);
          } else {
            await sendTrialStartedEmail(church.pastor_email, church.name, plan);
          }
        }
      }
    } else if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated"
    ) {
      const sub = event.data.object;
      const rows = await db(
        `tend_churches?stripe_customer_id=eq.${sub.customer}&select=id,plan`
      );
      const church = Array.isArray(rows) ? rows[0] : null;
      if (church) {
        if (sub.status === "active" || sub.status === "trialing") {
          const plan = validPlan(sub.metadata?.plan) ?? church.plan;
          await db(`tend_churches?id=eq.${church.id}`, {
            method: "PATCH",
            body: JSON.stringify({ plan, stripe_subscription_id: sub.id }),
          });
        } else if (sub.status === "canceled") {
          await db(`tend_churches?id=eq.${church.id}`, {
            method: "PATCH",
            body: JSON.stringify({ plan: "pilot", stripe_subscription_id: null }),
          });
        }
        // past_due / unpaid: leave the plan in place during Stripe's retry window.
      }
    } else if (type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const rows = await db(
        `tend_churches?stripe_customer_id=eq.${sub.customer}&select=id`
      );
      const church = Array.isArray(rows) ? rows[0] : null;
      if (church) {
        await db(`tend_churches?id=eq.${church.id}`, {
          method: "PATCH",
          body: JSON.stringify({ plan: "pilot", stripe_subscription_id: null }),
        });
      }
    } else if (type === "invoice.payment_failed") {
      const inv = event.data.object;
      const rows = await db(
        `tend_churches?stripe_customer_id=eq.${inv.customer}&select=id,name,pastor_email`
      );
      const church = Array.isArray(rows) ? rows[0] : null;
      if (church) await sendDunningEmail(church.pastor_email, church.name, church.id);
    }
  } catch (e) {
    console.error("webhook handler failed", event?.type, e);
    // Return 200 anyway so Stripe does not retry a poison event forever.
  }
  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
});
