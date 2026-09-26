// Creates a Stripe Checkout Session for GIFTING a paid plan to a church.
// Public endpoint (no Tend account needed): the donor pays now, no trial.
// Body: { slug, plan, interval }. The webhook assigns the plan to the church
// when payment completes (metadata.gift=true).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
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
      Authorization: `Bearer ${STRIPE_KEY}`,
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
    const { slug, plan, interval } = await req.json().catch(() => ({}));
    if (!PLANS.includes(plan)) return json(400, { error: "Unknown plan." });
    if (interval !== "month" && interval !== "year") return json(400, { error: "Unknown billing interval." });
    if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) {
      return json(400, { error: "Unknown church." });
    }
    const priceId = Deno.env.get(PRICE_ENV[plan][interval]);
    if (!priceId) return json(500, { error: "That plan price is not configured yet." });

    const db = (path: string) =>
      fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
    const churchRes = await db(`tend_churches?slug=eq.${encodeURIComponent(slug)}&select=id,name`);
    const churches = await churchRes.json();
    const church = Array.isArray(churches) ? churches[0] : null;
    if (!church) return json(404, { error: "Church not found." });

    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: `${SITE_URL}/#/gift/success?church=${encodeURIComponent(slug)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/#/gift/${encodeURIComponent(slug)}`,
      "metadata[church_id]": String(church.id),
      "metadata[plan]": plan,
      "metadata[interval]": interval,
      "metadata[gift]": "true",
    });
    return json(200, { url: session.url });
  } catch (e) {
    console.error("create-gift-checkout failed", e);
    return json(500, { error: e instanceof Error ? e.message : "Could not start gift checkout." });
  }
});
