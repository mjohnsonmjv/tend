// Creates a Stripe Customer Portal session so a church can update
// its card, change plan, or cancel. Auth: Bearer <supabase user JWT>.
// Body: { church_id }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://tendpray.com";

const cors = {
  "Access-Control-Allow-Origin": "https://tendpray.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    if (!STRIPE_KEY) return json(500, { error: "Billing is not configured yet." });
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "Sign in to continue." });

    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return json(401, { error: "Sign in to continue." });
    const me = await meRes.json();

    const { church_id } = await req.json().catch(() => ({}));
    const db = (path: string, init?: RequestInit) =>
      fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json", ...(init?.headers || {}),
        },
      });
    const rows = await (await db(
      `tend_churches?id=eq.${Number(church_id)}&select=id,owner_id,stripe_customer_id`
    )).json();
    const church = Array.isArray(rows) ? rows[0] : null;
    if (!church || church.owner_id !== me.id) return json(404, { error: "Church not found." });
    if (!church.stripe_customer_id) return json(409, { error: "No subscription to manage yet." });

    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(STRIPE_KEY + ":")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: church.stripe_customer_id,
        return_url: `${SITE_URL}/#/church/${church.id}/settings`,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "Portal session failed");
    return json(200, { url: data.url });
  } catch (e) {
    console.error("create-portal-session failed", e);
    return json(500, { error: "Could not open billing management. Please try again." });
  }
});
