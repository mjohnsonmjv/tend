// Creates a Stripe Checkout Session for a church's paid plan.
// 30-day trial, no card collected up front (payment_method_collection=if_required).
// Auth: Authorization: Bearer <supabase user JWT>. Body: { church_id, plan, interval }.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://tendpray.com";

const PLANS = ["starter", "growth", "large"] as const;
const PRICE_ENV: Record<string, Record<string, string>> = {
  starter: { month: "STRIPE_PRICE_STARTER_MONTHLY", year: "STRIPE_PRICE_STARTER_YEARLY" },
  growth: { month: "STRIPE_PRICE_GROWTH_MONTHLY", year: "STRIPE_PRICE_GROWTH_YEARLY" },
  large: { month: "STRIPE_PRICE_LARGE_MONTHLY", year: "STRIPE_PRICE_LARGE_YEARLY" },
};

const cors = {
  "Access-Control-Allow-Origin": "https://tendpray.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(STRIPE_KEY + ":")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${path} failed`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    if (!STRIPE_KEY) return json(500, { error: "Billing is not configured yet." });
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "Sign in to continue." });

    // Verify the caller.
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return json(401, { error: "Sign in to continue." });
    const me = await meRes.json();

    const { church_id, plan, interval } = await req.json().catch(() => ({}));
    if (!PLANS.includes(plan)) return json(400, { error: "Unknown plan." });
    if (interval !== "month" && interval !== "year") return json(400, { error: "Unknown billing interval." });
    const priceId = Deno.env.get(PRICE_ENV[plan][interval]);
    if (!priceId) return json(500, { error: "That plan price is not configured yet." });

    // Load the church with the service role; the owner check below is authoritative.
    const db = (path: string, init?: RequestInit) =>
      fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json", ...(init?.headers || {}),
        },
      });
    const churchRes = await db(
      `tend_churches?id=eq.${Number(church_id)}&select=id,owner_id,name,pastor_email,plan,stripe_customer_id,stripe_subscription_id`
    );
    const churches = await churchRes.json();
    const church = Array.isArray(churches) ? churches[0] : null;
    if (!church || church.owner_id !== me.id) return json(404, { error: "Church not found." });
    if (church.stripe_subscription_id) {
      return json(409, { error: "This church already has a subscription. Manage it from Settings." });
    }

    // Reuse or create the Stripe customer.
    let customerId = church.stripe_customer_id as string | null;
    if (customerId) {
      try { await stripe(`customers/${customerId}`, {}); } catch { customerId = null; }
    }
    if (!customerId) {
      const customer = await stripe("customers", {
        email: church.pastor_email, name: church.name,
        "metadata[church_id]": String(church.id),
      });
      customerId = customer.id;
      await db(`tend_churches?id=eq.${church.id}`, {
        method: "PATCH", body: JSON.stringify({ stripe_customer_id: customerId }),
      });
    }

    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "subscription_data[trial_period_days]": "30",
      "subscription_data[metadata][church_id]": String(church.id),
      "subscription_data[metadata][plan]": plan,
      payment_method_collection: "if_required",
      allow_promotion_codes: "true",
      success_url: `${SITE_URL}/#/billing/success?church=${church.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/#/pricing`,
      "metadata[church_id]": String(church.id),
      "metadata[plan]": plan,
      "metadata[interval]": interval,
    });
    return json(200, { url: session.url });
  } catch (e) {
    console.error("create-checkout-session failed", e);
    return json(500, { error: "Could not start checkout. Please try again." });
  }
});
