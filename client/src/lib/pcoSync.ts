import { supabase, SUPABASE_URL, SUPABASE_KEY } from "./supabase";

const FN_BASE = `${SUPABASE_URL}/functions/v1/pco-prayer-sync`;
const CONNECT_FLAG = "tend:pco-connect-pending";
const FLAG_TTL_MS = 30 * 60 * 1000;

export interface PcoStatus {
  connected: boolean;
  organization: string | null;
  workflow_id: string | null;
  token_expires_at: string | null;
  pending_count: number;
  last_synced_at: string | null;
}

export interface PcoWorkflow {
  id: string;
  name: string;
}

export interface PcoSyncSummary {
  attempted: number;
  synced: number;
  failed: number;
  failureReasons: string[];
}

const FRIENDLY: Record<string, string> = {
  access_denied: "The Planning Center connection was cancelled. Try again when you are ready.",
  invalid_callback: "Planning Center did not return a valid response. Try connecting again.",
  invalid_state: "The connection link expired. Try connecting again.",
  exchange_failed: "Planning Center did not finish connecting. Try again.",
  server_error: "Something went wrong while connecting. Try again.",
  unauthorized: "Please sign in to manage Planning Center.",
  not_connected: "Connect Planning Center first, then choose a workflow.",
  invalid_workflow_id: "That workflow choice was not valid. Pick one from the list.",
};

/** Friendly message for a pco_error return code. Never an em dash. */
export function pcoErrorMessage(code: string | null | undefined): string {
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  return "Planning Center did not finish connecting. Try again.";
}

function friendlyFnError(code: unknown): string {
  return typeof code === "string" && FRIENDLY[code]
    ? FRIENDLY[code]
    : "The Planning Center request failed. Try again.";
}

async function pastorJwt(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(FRIENDLY.unauthorized);
  return token;
}

async function callFn(path: string, init?: RequestInit): Promise<any> {
  const token = await pastorJwt();
  const res = await fetch(`${FN_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyFnError((data as { error?: unknown } | null)?.error));
  return data;
}

/** The connect endpoint address the settings UI requests as JSON. Pure. */
export function connectUrl(churchId: number): string {
  return `${FN_BASE}/connect?church_id=${churchId}&format=json`;
}

export async function fetchPcoStatus(churchId: number): Promise<PcoStatus> {
  const data = await callFn(`?action=status&church_id=${churchId}`);
  return {
    connected: !!data.connected,
    organization: typeof data.organization === "string" ? data.organization : null,
    workflow_id: typeof data.workflow_id === "string" ? data.workflow_id : null,
    token_expires_at: typeof data.token_expires_at === "string" ? data.token_expires_at : null,
    pending_count: typeof data.pending_count === "number" ? data.pending_count : 0,
    last_synced_at: typeof data.last_synced_at === "string" ? data.last_synced_at : null,
  };
}

export async function fetchPcoWorkflows(churchId: number): Promise<PcoWorkflow[]> {
  const data = await callFn(`?action=workflows&church_id=${churchId}`);
  const list = (Array.isArray(data.workflows) ? data.workflows : []) as {
    id?: unknown;
    name?: unknown;
  }[];
  return list
    .filter((w): w is { id: string; name: string } => typeof w.id === "string" && typeof w.name === "string")
    .map((w) => ({ id: w.id, name: w.name }));
}

/** Ask the function for the PCO authorize URL, then the UI navigates there. */
export async function requestPcoConnectUrl(churchId: number): Promise<string> {
  const data = await callFn(`/connect?church_id=${churchId}&format=json`);
  if (typeof data.url !== "string" || !data.url.startsWith("https://")) {
    throw new Error("Planning Center did not return a sign-in address. Try again.");
  }
  return data.url;
}

export async function setPcoWorkflow(churchId: number, workflowId: string | null): Promise<void> {
  await callFn(`/`, {
    method: "POST",
    body: JSON.stringify({ action: "set_workflow", church_id: churchId, workflow_id: workflowId }),
  });
}

const REASON_WORDS: Record<string, string> = {
  not_configured: "Planning Center is not connected",
  no_workflow: "no workflow chosen yet",
  reconnect_required: "the Planning Center connection expired",
  pco_error: "Planning Center returned an error",
  prayer_not_found: "a request no longer exists",
};

/** Summarize a sync_pending response. Pure. */
export function summarizeSyncResults(input: unknown): PcoSyncSummary {
  const raw = input as { results?: unknown } | null;
  const results = Array.isArray(raw?.results) ? raw.results : [];
  let synced = 0;
  const reasons = new Set<string>();
  for (const r of results) {
    if (r && typeof r === "object" && (r as { synced?: unknown }).synced === true) {
      synced++;
    } else {
      const reason = (r as { reason?: unknown } | null)?.reason;
      reasons.add(
        typeof reason === "string" && reason && REASON_WORDS[reason]
          ? REASON_WORDS[reason]
          : "an unexpected error",
      );
    }
  }
  return { attempted: results.length, synced, failed: results.length - synced, failureReasons: Array.from(reasons) };
}

export async function syncPcoPending(churchId: number): Promise<PcoSyncSummary> {
  const data = await callFn(`/`, {
    method: "POST",
    body: JSON.stringify({ action: "sync_pending", church_id: churchId }),
  });
  return summarizeSyncResults(data);
}

/** Read the PCO connect return params out of the URL hash. Pure. */
export function parsePcoSyncReturn(hash: string): { connected: boolean; error: string | null } {
  const query = hash.split("?").slice(1).join("?");
  const params = new URLSearchParams(query);
  if (params.get("pco") === "connected") return { connected: true, error: null };
  const error = params.get("pco_error");
  return { connected: false, error: error ? error.slice(0, 64) : null };
}

/** Remove PCO connect return params from the URL hash. Pure. */
export function stripPcoSyncReturn(hash: string): string {
  const idx = hash.indexOf("?");
  if (idx === -1) return hash;
  const params = new URLSearchParams(hash.slice(idx + 1));
  params.delete("pco");
  params.delete("pco_error");
  const rest = params.toString();
  return hash.slice(0, idx) + (rest ? `?${rest}` : "");
}

/** Remember a pending connect across the full-page PCO round trip. */
export function markPcoConnectPending(churchId: number): void {
  try {
    sessionStorage.setItem(CONNECT_FLAG, JSON.stringify({ churchId, at: Date.now() }));
  } catch {
    /* storage unavailable; the status check still works */
  }
}

/** True when the pastor just returned from a connect attempt for this church. */
export function consumePcoConnectPending(churchId: number): boolean {
  try {
    const raw = sessionStorage.getItem(CONNECT_FLAG);
    sessionStorage.removeItem(CONNECT_FLAG);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { churchId?: unknown; at?: unknown };
    return (
      parsed.churchId === churchId &&
      typeof parsed.at === "number" &&
      Date.now() - parsed.at < FLAG_TTL_MS
    );
  } catch {
    return false;
  }
}
