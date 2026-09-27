// pco-oauth-start: begins the "Continue with Planning Center" login flow.
// GET -> { url } — the Planning Center authorize URL to redirect the browser to.
// Returns 503 when Planning Center login is not configured yet.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PCO_CLIENT_ID = Deno.env.get("PCO_CLIENT_ID") ?? "";
const PCO_AUTHORIZE = "https://api.planningcenteronline.com/oauth/authorize";

async function db(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`DB ${path} failed: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!PCO_CLIENT_ID || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: "Planning Center sign-in is not set up yet." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  const state = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  try {
    await db("pco_oauth_states", {
      method: "POST",
      body: JSON.stringify({ state }),
      headers: { Prefer: "return=minimal" },
    });
  } catch (e) {
    console.error("pco-oauth-start: state store failed", e);
    return new Response("Server error", { status: 500 });
  }
  const redirectUri = `${SUPABASE_URL}/functions/v1/pco-oauth-callback`;
  const params = new URLSearchParams({
    client_id: PCO_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid",
    state,
    prompt: "select_account",
  });
  return new Response(JSON.stringify({ url: `${PCO_AUTHORIZE}?${params}` }), {
    headers: { "content-type": "application/json" },
  });
});
