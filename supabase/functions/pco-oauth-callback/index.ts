// pco-oauth-callback: completes the "Continue with Planning Center" login flow.
// Planning Center redirects here with ?code=...&state=.... This function:
//  1. validates and consumes the single-use state,
//  2. exchanges the code for tokens (server side, confidential client),
//  3. fetches the user's identity from PCO's userinfo endpoint,
//  4. creates (or finds) the matching Supabase auth user,
//  5. issues a one-time sign-in ticket and redirects back to Tend.
// The browser never sees PCO tokens; only the short-lived ticket crosses the redirect.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PCO_CLIENT_ID = Deno.env.get("PCO_CLIENT_ID") ?? "";
const PCO_CLIENT_SECRET = Deno.env.get("PCO_CLIENT_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://tendpray.com";
const PCO_TOKEN = "https://api.planningcenteronline.com/oauth/token";
const PCO_USERINFO = "https://api.planningcenteronline.com/oauth/userinfo";
const STATE_TTL_MS = 10 * 60 * 1000;

function redirect(params: URLSearchParams) {
  return Response.redirect(`${SITE_URL}/?${params.toString()}`, 302);
}
function fail(code: string) {
  return redirect(new URLSearchParams({ pco_error: code }));
}

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

async function authAdmin(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!PCO_CLIENT_ID || !PCO_CLIENT_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return fail("not_configured");
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error") || "";
  if (oauthError) return fail(oauthError === "access_denied" ? "access_denied" : "provider_error");
  if (!code || !state) return fail("invalid_callback");

  try {
    // 1. Validate and consume the single-use state.
    const rows = await db(`pco_oauth_states?state=eq.${encodeURIComponent(state)}&select=created_at`);
    const row = Array.isArray(rows) ? rows[0] : null;
    await db(`pco_oauth_states?state=eq.${encodeURIComponent(state)}`, { method: "DELETE" }).catch(() => {});
    if (!row || Date.now() - new Date(row.created_at).getTime() > STATE_TTL_MS) {
      return fail("invalid_state");
    }

    // 2. Exchange the authorization code for tokens (confidential client).
    const redirectUri = `${SUPABASE_URL}/functions/v1/pco-oauth-callback`;
    const tokenRes = await fetch(PCO_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: PCO_CLIENT_ID,
        client_secret: PCO_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) {
      console.error("pco token exchange failed", await tokenRes.text());
      return fail("exchange_failed");
    }
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return fail("exchange_failed");

    // 3. Identity comes from PCO's userinfo endpoint over the server-side TLS
    //    connection (no JWT verification needed in the function).
    const meRes = await fetch(PCO_USERINFO, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!meRes.ok) {
      console.error("pco userinfo failed", await meRes.text());
      return fail("identity_failed");
    }
    const me = await meRes.json();
    let email = typeof me.email === "string" ? me.email.trim().toLowerCase() : "";
    let name = typeof me.name === "string" ? me.name.trim().slice(0, 120) : "";
    const pcoSub = typeof me.sub === "string" ? me.sub : "";

    // PCO's userinfo with the openid scope only returns a subject id. With the
    // people scope we can read the person's own record to get their email.
    if (!email) {
      const personRes = await fetch(
        "https://api.planningcenteronline.com/people/v2/me?include=email_addresses",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (personRes.ok) {
        const person = await personRes.json();
        const attrs = person?.data?.attributes || {};
        const first = typeof attrs.first_name === "string" ? attrs.first_name : "";
        const last = typeof attrs.last_name === "string" ? attrs.last_name : "";
        if (!name) name = `${first} ${last}`.trim().slice(0, 120);
        const emails = Array.isArray(person?.included) ? person.included : [];
        const primary = emails.find(
          (e: any) => e?.type === "Email" && e?.attributes?.primary === true,
        ) || emails.find((e: any) => e?.type === "Email");
        const addr = primary?.attributes?.address;
        if (typeof addr === "string") email = addr.trim().toLowerCase();
      } else {
        console.error("pco people me failed", await personRes.text());
      }
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("no_email");

    // 4. Find or create the Supabase auth user. generate_link only needs the
    //    email, so: try creating (idempotent for new users), then issue the
    //    ticket. If creation reports "already registered", the user exists and
    //    generate_link still succeeds.
    const created = await authAdmin("users", {
      method: "POST",
      body: JSON.stringify({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: name || undefined,
          provider: "planning_center",
          pco_sub: pcoSub || undefined,
          pco_organization: me.organization_name || undefined,
        },
      }),
    });
    if (!created.ok) {
      const msg = JSON.stringify(created.data || {}).toLowerCase();
      if (!msg.includes("already") || created.status === 0) {
        console.error("pco user create failed", created.status, msg.slice(0, 300));
        // Fall through: generate_link below will confirm whether the account exists.
      }
    }

    // 5. One-time sign-in ticket for the browser (magic-link token hash).
    const link = await authAdmin("generate_link", {
      method: "POST",
      body: JSON.stringify({ type: "magiclink", email }),
    });
    const ticket = link.data?.hashed_token;
    if (!link.ok || !ticket) {
      console.error("pco generate_link failed", link.status);
      return fail("ticket_failed");
    }
    return redirect(new URLSearchParams({ pco_ticket: ticket }));
  } catch (e) {
    console.error("pco-oauth-callback failed", e);
    return fail("server_error");
  }
});
