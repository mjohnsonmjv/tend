// pco-prayer-sync: Tend -> Planning Center prayer-request sync.
// Each new Tend prayer request becomes a Workflow Card (with the prayer text
// as a card note) in the church's chosen PCO People workflow. Tend stays the
// in-person QR capture layer; PCO stays the system of record.
//
// Routes (all under /functions/v1/pco-prayer-sync):
//   GET  /connect?church_id=N          (pastor JWT) start the PCO connect flow
//   GET  /connect?church_id=N&format=json  same, but returns { url } as JSON
//                                      (browsers cannot read a cross-origin 302 Location)
//   GET  /callback?code=..&state=..     PCO redirect target, stores church tokens
//   GET  ?action=status&church_id=N     (pastor JWT) connection + sync status
//   GET  ?action=workflows&church_id=N  (pastor JWT) PCO workflows for the picker
//   POST /                              sync one prayer:
//                                        { prayer_id } or DB-webhook payload,
//                                        or { action: "sync_pending", church_id }
//                                        or { action: "set_workflow", church_id, workflow_id }
// Auth for POST: x-tend-hook-secret header (DB webhook) or pastor JWT.
// PCO_CLIENT_ID / PCO_CLIENT_SECRET are project secrets. The PCO app must have
// this redirect URI registered:
//   https://<project>.supabase.co/functions/v1/pco-prayer-sync/callback
// Required PCO OAuth scopes: openid people (no new scopes needed).

import {
  PCO_TOKEN_URL,
  PCO_USERINFO_URL,
  USER_AGENT,
  TendPrayer,
  PcoConnection,
  PcoClient,
  needsRefresh,
  normalizePhone,
  buildCardNoteText,
  parsePrayerId,
  refreshPcoTokens,
} from "./sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PCO_CLIENT_ID = Deno.env.get("PCO_CLIENT_ID") ?? "";
const PCO_CLIENT_SECRET = Deno.env.get("PCO_CLIENT_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://tendpray.com";
const HOOK_SECRET = Deno.env.get("PCO_SYNC_HOOK_SECRET") ?? "";
const PCO_AUTHORIZE = "https://api.planningcenteronline.com/oauth/authorize";
const STATE_TTL_MS = 10 * 60 * 1000;
const SYNC_BATCH_LIMIT = 25;

const cors = {
  "Access-Control-Allow-Origin": "https://tendpray.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-tend-hook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

function fnBase(): string {
  return `${SUPABASE_URL}/functions/v1/pco-prayer-sync`;
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

async function upsert(table: string, row: Record<string, unknown>) {
  return db(table, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
}

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function userFromJwt(jwt: string): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id ? { id: data.id } : null;
  } catch {
    return null;
  }
}

async function churchOwnedBy(churchId: number, userId: string): Promise<boolean> {
  try {
    const rows = await db(
      `tend_churches?id=eq.${churchId}&select=id,owner_id,name`,
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.owner_id !== userId) return false;
    return true;
  } catch {
    return false;
  }
}

async function churchName(churchId: number): Promise<string> {
  try {
    const rows = await db(`tend_churches?id=eq.${churchId}&select=name`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return typeof row?.name === "string" ? row.name : "your church";
  } catch {
    return "your church";
  }
}

/** Pastor JWT auth for a church-scoped action. Returns user id or null. */
async function authorizeChurch(req: Request, churchId: number): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return null;
  const user = await userFromJwt(jwt);
  if (!user) return null;
  const ok = await churchOwnedBy(churchId, user.id);
  return ok ? user.id : null;
}

async function getConnection(churchId: number): Promise<PcoConnection | null> {
  const rows = await db(`pco_church_connections?church_id=eq.${churchId}&select=*`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ?? null;
}

/** Refresh the PCO access token when needed; persists the new pair. */
async function withFreshToken(conn: PcoConnection): Promise<{ token: string; conn: PcoConnection }> {
  if (!needsRefresh(conn.expires_at)) return { token: conn.access_token, conn };
  const refreshed = await refreshPcoTokens(PCO_CLIENT_ID, PCO_CLIENT_SECRET, conn.refresh_token);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await upsert("pco_church_connections", {
    church_id: conn.church_id,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  return { token: refreshed.access_token, conn: { ...conn, access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: expiresAt } };
}

async function recordSync(
  prayer: TendPrayer,
  status: string,
  extra: Record<string, unknown> = {},
) {
  await upsert("pco_prayer_syncs", {
    prayer_request_id: prayer.id,
    church_id: prayer.church_id,
    status,
    ...extra,
  }).catch((e) => console.error("pco recordSync failed", e));
}

/** Resolve the PCO person for a prayer: email, then phone, then fallback inbox person. */
async function resolvePerson(
  client: PcoClient,
  conn: PcoConnection,
  prayer: TendPrayer,
): Promise<{ personId: string; matched: boolean }> {
  if (!prayer.is_anonymous && prayer.submitter_email) {
    const id = await client.findPersonByEmail(prayer.submitter_email);
    if (id) return { personId: id, matched: true };
  }
  if (!prayer.is_anonymous && prayer.submitter_phone && normalizePhone(prayer.submitter_phone).length >= 7) {
    const id = await client.findPersonByPhone(prayer.submitter_phone);
    if (id) return { personId: id, matched: true };
  }
  if (conn.fallback_person_id) return { personId: conn.fallback_person_id, matched: false };
  const fallbackId = await client.createFallbackPerson();
  await upsert("pco_church_connections", {
    church_id: conn.church_id,
    fallback_person_id: fallbackId,
    updated_at: new Date().toISOString(),
  });
  return { personId: fallbackId, matched: false };
}

async function syncOnePrayer(prayerId: number): Promise<{ status: number; body: Record<string, unknown> }> {
  const rows = await db(`tend_prayers?id=eq.${prayerId}&select=*`);
  const prayer = (Array.isArray(rows) ? rows[0] : null) as TendPrayer | null;
  if (!prayer) return { status: 404, body: { synced: false, reason: "prayer_not_found" } };

  const existing = await db(`pco_prayer_syncs?prayer_request_id=eq.${prayer.id}&select=status,pco_card_id`);
  const done = Array.isArray(existing) ? existing[0] : null;
  if (done?.status === "synced") {
    return { status: 200, body: { synced: true, deduped: true, card_id: done.pco_card_id } };
  }

  const conn = await getConnection(prayer.church_id);
  if (!conn) {
    await recordSync(prayer, "not_configured", { error: "Planning Center is not connected for this church." });
    return { status: 200, body: { synced: false, reason: "not_configured" } };
  }

  let token: string;
  let live: PcoConnection;
  try {
    ({ token, conn: live } = await withFreshToken(conn));
  } catch (e) {
    await recordSync(prayer, "error", { error: "Planning Center connection expired. Reconnect in Tend settings." });
    console.error("pco refresh failed", e);
    return { status: 200, body: { synced: false, reason: "reconnect_required" } };
  }

  try {
    const client = new PcoClient(token);
    const { personId } = await resolvePerson(client, live, prayer);
    const workflowId = live.workflow_id;
    if (!workflowId) {
      await recordSync(prayer, "not_configured", { error: "No Planning Center prayer workflow selected yet." });
      return { status: 200, body: { synced: false, reason: "no_workflow" } };
    }
    const cardId = await client.createCard(workflowId, personId);
    const name = await churchName(prayer.church_id);
    const note = buildCardNoteText(prayer, { churchName: name, siteUrl: SITE_URL });
    const noteId = await client.createCardNote(personId, cardId, note, live.note_category_id);
    await recordSync(prayer, "synced", {
      pco_card_id: cardId,
      pco_note_id: noteId,
      pco_person_id: personId,
      synced_at: new Date().toISOString(),
      error: null,
    });
    return { status: 200, body: { synced: true, card_id: cardId } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await recordSync(prayer, "error", { error: msg.slice(0, 500) });
    console.error("pco sync failed", msg);
    return { status: 502, body: { synced: false, reason: "pco_error", error: msg.slice(0, 200) } };
  }
}

async function handleConnect(req: Request, url: URL) {
  const churchId = parseInt(url.searchParams.get("church_id") || "", 10);
  if (!Number.isInteger(churchId) || churchId <= 0) return json(400, { error: "church_id required" });
  const userId = await authorizeChurch(req, churchId);
  if (!userId) return json(401, { error: "unauthorized" });
  if (!PCO_CLIENT_ID) return json(503, { error: "Planning Center is not configured." });

  const state = randomState();
  await upsert("pco_connect_states", { state, church_id: churchId });
  const params = new URLSearchParams({
    client_id: PCO_CLIENT_ID,
    redirect_uri: `${fnBase()}/callback`,
    response_type: "code",
    scope: "openid people",
    state,
    prompt: "select_account",
  });
  const authorizeUrl = `${PCO_AUTHORIZE}?${params.toString()}`;
  // Browser clients cannot read the Location of a cross-origin 302, so the
  // Tend settings UI requests the URL as JSON and navigates itself.
  const wantsJson =
    url.searchParams.get("format") === "json" ||
    (req.headers.get("accept") || "").includes("application/json");
  if (wantsJson) return json(200, { url: authorizeUrl });
  return Response.redirect(authorizeUrl, 302);
}

async function handleCallback(url: URL) {
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error") || "";
  const settings = (churchId: number, extra: string) =>
    `${SITE_URL}/#/church/${churchId}/settings?${extra}`;
  const fail = (churchId: number | null, code: string) =>
    Response.redirect(
      churchId ? settings(churchId, `pco_error=${code}`) : `${SITE_URL}/?pco_error=${code}`,
      302,
    );

  if (oauthError || !code || !state) {
    // Resolve the church from the single-use state when possible, so provider
    // errors (e.g. the user cancelling at Planning Center) return to that
    // church's settings instead of the site root.
    let churchId: number | null = null;
    if (state) {
      try {
        const rows = await db(
          `pco_connect_states?state=eq.${encodeURIComponent(state)}&select=church_id,created_at`,
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        await db(`pco_connect_states?state=eq.${encodeURIComponent(state)}`, { method: "DELETE" }).catch(() => {});
        if (row && Date.now() - new Date(row.created_at).getTime() <= STATE_TTL_MS) {
          const cid = row.church_id;
          if (Number.isInteger(cid) && cid > 0) churchId = cid;
        }
      } catch {
        /* fall through to fail(null, ...) */
      }
    }
    if (oauthError) return fail(churchId, oauthError === "access_denied" ? "access_denied" : "invalid_callback");
    return fail(churchId, "invalid_callback");
  }
  let churchId: number | null = null;
  try {
    const rows = await db(`pco_connect_states?state=eq.${encodeURIComponent(state)}&select=church_id,created_at`);
    const row = Array.isArray(rows) ? rows[0] : null;
    await db(`pco_connect_states?state=eq.${encodeURIComponent(state)}`, { method: "DELETE" }).catch(() => {});
    if (!row || Date.now() - new Date(row.created_at).getTime() > STATE_TTL_MS) {
      return fail(null, "invalid_state");
    }
    churchId = row.church_id;
    if (!Number.isInteger(churchId) || (churchId as number) <= 0) {
      return fail(null, "invalid_state");
    }
    const cid: number = churchId as number;

    const tokenRes = await fetch(PCO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${fnBase()}/callback`,
        client_id: PCO_CLIENT_ID,
        client_secret: PCO_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) {
      console.error("pco connect exchange failed", await tokenRes.text());
      return fail(cid, "exchange_failed");
    }
    const tokens = await tokenRes.json();
    if (!tokens.access_token || !tokens.refresh_token) return fail(cid, "exchange_failed");

    let orgName: string | null = null;
    try {
      const meRes = await fetch(PCO_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": USER_AGENT },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        if (typeof me?.organization_name === "string") orgName = me.organization_name.slice(0, 200);
      }
    } catch { /* org name is nice-to-have */ }

    const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 7200;
    await upsert("pco_church_connections", {
      church_id: cid,
      pco_organization_name: orgName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    return Response.redirect(settings(cid, "pco=connected"), 302);
  } catch (e) {
    console.error("pco connect callback failed", e);
    return fail(churchId, "server_error");
  }
}

async function handleStatus(req: Request, url: URL) {
  const churchId = parseInt(url.searchParams.get("church_id") || "", 10);
  if (!Number.isInteger(churchId) || churchId <= 0) return json(400, { error: "church_id required" });
  const userId = await authorizeChurch(req, churchId);
  if (!userId) return json(401, { error: "unauthorized" });
  const conn = await getConnection(churchId);
  const pending = await db(
    `pco_prayer_syncs?church_id=eq.${churchId}&status=in.(pending,error)&select=prayer_request_id`,
  ).catch(() => []);
  const last = await db(
    `pco_prayer_syncs?church_id=eq.${churchId}&status=eq.synced&order=synced_at.desc&limit=1&select=synced_at`,
  ).catch(() => []);
  return json(200, {
    connected: !!conn,
    organization: conn?.pco_organization_name ?? null,
    workflow_id: conn?.workflow_id ?? null,
    token_expires_at: conn?.expires_at ?? null,
    pending_count: Array.isArray(pending) ? pending.length : 0,
    last_synced_at: Array.isArray(last) && last[0]?.synced_at ? last[0].synced_at : null,
  });
}

async function handleWorkflows(req: Request, url: URL) {
  const churchId = parseInt(url.searchParams.get("church_id") || "", 10);
  if (!Number.isInteger(churchId) || churchId <= 0) return json(400, { error: "church_id required" });
  const userId = await authorizeChurch(req, churchId);
  if (!userId) return json(401, { error: "unauthorized" });
  const conn = await getConnection(churchId);
  if (!conn) return json(200, { workflows: [], connected: false });
  try {
    const { token } = await withFreshToken(conn);
    const workflows = await new PcoClient(token).listWorkflows();
    return json(200, { workflows, connected: true });
  } catch (e) {
    console.error("pco workflows failed", e);
    return json(502, { error: "Planning Center request failed. Try reconnecting." });
  }
}

async function handlePost(req: Request) {
  if (!SUPABASE_URL || !SERVICE_KEY || !PCO_CLIENT_ID || !PCO_CLIENT_SECRET) {
    return json(503, { error: "Planning Center sync is not configured." });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Manual / cron sync of everything pending for a church (pastor JWT required).
  if (b.action === "sync_pending") {
    const churchId = typeof b.church_id === "number" ? b.church_id : parseInt(String(b.church_id ?? ""), 10);
    if (!Number.isInteger(churchId) || churchId <= 0) return json(400, { error: "church_id required" });
    const userId = await authorizeChurch(req, churchId);
    if (!userId) return json(401, { error: "unauthorized" });
    const rows = await db(
      `tend_prayers?church_id=eq.${churchId}&select=id&order=id.asc&limit=${SYNC_BATCH_LIMIT}`,
    );
    const ids: number[] = Array.isArray(rows) ? rows.map((r: any) => r.id) : [];
    // Only attempt prayers without a successful sync row.
    const syncedRows = await db(
      `pco_prayer_syncs?church_id=eq.${churchId}&status=eq.synced&select=prayer_request_id`,
    ).catch(() => []);
    const syncedIds = new Set(
      Array.isArray(syncedRows) ? syncedRows.map((r: any) => r.prayer_request_id) : [],
    );
    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      if (syncedIds.has(id)) continue;
      const r = await syncOnePrayer(id);
      results.push({ prayer_id: id, ...r.body });
      if (results.length >= SYNC_BATCH_LIMIT) break;
    }
    return json(200, { attempted: results.length, results });
  }

  // Save the church's chosen PCO workflow (pastor JWT required). The sync
  // reads workflow_id from pco_church_connections; the settings UI writes it
  // here because those tables are service-role only.
  if (b.action === "set_workflow") {
    const churchId = typeof b.church_id === "number" ? b.church_id : parseInt(String(b.church_id ?? ""), 10);
    if (!Number.isInteger(churchId) || churchId <= 0) return json(400, { error: "church_id required" });
    const userId = await authorizeChurch(req, churchId);
    if (!userId) return json(401, { error: "unauthorized" });
    const conn = await getConnection(churchId);
    if (!conn) return json(409, { error: "not_connected" });
    const raw = b.workflow_id;
    const workflowId = raw == null || raw === "" ? null : String(raw);
    if (workflowId !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(workflowId)) {
      return json(400, { error: "invalid_workflow_id" });
    }
    await upsert("pco_church_connections", {
      church_id: churchId,
      workflow_id: workflowId,
      updated_at: new Date().toISOString(),
    });
    return json(200, { ok: true, workflow_id: workflowId });
  }

  // Single-prayer sync: DB webhook (hook secret) or pastor JWT.
  const hookOk = HOOK_SECRET && req.headers.get("x-tend-hook-secret") === HOOK_SECRET;
  const parsed = parsePrayerId(body);
  if ("error" in parsed) return json(400, { error: parsed.error });
  if (!hookOk) {
    const rows = await db(`tend_prayers?id=eq.${parsed.prayerId}&select=church_id`);
    const prayer = Array.isArray(rows) ? rows[0] : null;
    if (!prayer) return json(404, { error: "prayer_not_found" });
    const userId = await authorizeChurch(req, prayer.church_id);
    if (!userId) return json(401, { error: "unauthorized" });
  }
  const result = await syncOnePrayer(parsed.prayerId);
  return json(result.status, result.body);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path.endsWith("/connect")) return await handleConnect(req, url);
    if (req.method === "GET" && path.endsWith("/callback")) return await handleCallback(url);
    if (req.method === "GET" && url.searchParams.get("action") === "status") {
      return await handleStatus(req, url);
    }
    if (req.method === "GET" && url.searchParams.get("action") === "workflows") {
      return await handleWorkflows(req, url);
    }
    if (req.method === "POST" && (path.endsWith("/pco-prayer-sync") || path.endsWith("/pco-prayer-sync/"))) {
      return await handlePost(req);
    }
    return json(404, { error: "not_found" });
  } catch (e) {
    console.error("pco-prayer-sync failed", e);
    return json(500, { error: "server_error" });
  }
});
