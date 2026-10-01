// pco-prayer-sync logic: pure helpers plus a small Planning Center API client.
// Kept free of Deno globals so it can be unit tested with node/tsx.
// Write target in PCO (documented People API endpoints):
//   POST /people/v2/workflows/{workflow_id}/cards
//     -> creates a WorkflowCard for a person (person_id required)
//   POST /people/v2/people/{person_id}/workflow_cards/{card_id}/notes
//     -> attaches the prayer text as a note on that card
// Person resolution: exact email match, then exact phone match, then a single
// per-church "Tend Prayer Requests" fallback person created once via the API.

export const PCO_API = "https://api.planningcenteronline.com";
export const PCO_TOKEN_URL = `${PCO_API}/oauth/token`;
export const PCO_USERINFO_URL = `${PCO_API}/oauth/userinfo`;
export const USER_AGENT = "TendPrayerRequests/1.0";

export interface TendPrayer {
  id: number;
  church_id: number;
  submitter_name: string | null;
  submitter_phone: string | null;
  submitter_email: string | null;
  message: string;
  category: string;
  is_anonymous: boolean;
  is_urgent: boolean;
  created_at: string;
}

export interface PcoConnection {
  church_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  workflow_id: string | null;
  note_category_id: string | null;
  fallback_person_id: string | null;
  pco_organization_name: string | null;
}

export type FetchFn = typeof fetch;

const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** True when the access token is expired or will expire within the skew window. */
export function needsRefresh(expiresAt: string, nowMs: number = Date.now()): boolean {
  const exp = new Date(expiresAt).getTime();
  if (Number.isNaN(exp)) return true;
  return exp - nowMs <= REFRESH_SKEW_MS;
}

/** Digits only, for phone comparison. */
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

const CATEGORY_LABELS: Record<string, string> = {
  prayer: "Prayer request",
  check_in: "Check-in",
  praise: "Praise",
  question: "Question",
};

/**
 * The note text stored on the PCO workflow card. Plain text, no em dashes.
 * Anonymous requests carry no submitter details (enforced by the DB check).
 */
export function buildCardNoteText(
  prayer: TendPrayer,
  opts: { churchName: string; siteUrl: string },
): string {
  const date = new Date(prayer.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const lines: string[] = [];
  lines.push(`Prayer request submitted via Tend on ${date}`);
  lines.push("");
  lines.push(prayer.message.trim());
  lines.push("");
  const category = CATEGORY_LABELS[prayer.category] ?? prayer.category;
  const details: string[] = [`Type: ${category}`];
  if (prayer.is_urgent) details.push("Marked urgent in Tend");
  if (!prayer.is_anonymous && prayer.submitter_name) {
    details.push(`From: ${prayer.submitter_name.trim()}`);
  } else {
    details.push("From: Anonymous");
  }
  lines.push(details.join(" | "));
  lines.push(`Manage in Tend: ${opts.siteUrl}/#/church/${prayer.church_id}/inbox`);
  return lines.join("\n").slice(0, 4000);
}

/** JSON:API payload for POST /people/v2/workflows/{id}/cards */
export function cardCreatePayload(personId: string): Record<string, unknown> {
  return {
    data: {
      type: "WorkflowCard",
      attributes: { person_id: personId },
    },
  };
}

/** JSON:API payload for POST /people/v2/people/{pid}/workflow_cards/{cid}/notes */
export function cardNotePayload(note: string, noteCategoryId?: string | null): Record<string, unknown> {
  const attributes: Record<string, unknown> = { note };
  // When a category is given, PCO also creates a matching profile note.
  if (noteCategoryId) attributes.note_category_id = noteCategoryId;
  return {
    data: {
      type: "WorkflowCardNote",
      attributes,
    },
  };
}

/** JSON:API payload for POST /people/v2/people (the per-church fallback inbox person). */
export function fallbackPersonPayload(): Record<string, unknown> {
  return {
    data: {
      type: "Person",
      attributes: { first_name: "Tend", last_name: "Prayer Requests" },
    },
  };
}

/**
 * Accept a sync request body in any supported shape and return the prayer id.
 * Supports { prayer_id }, { prayer_request_id }, and the Supabase DB webhook
 * payload { type: "INSERT", table: "tend_prayers", record: { id } }.
 */
export function parsePrayerId(body: unknown): { prayerId: number } | { error: string } {
  if (!body || typeof body !== "object") return { error: "empty_body" };
  const b = body as Record<string, unknown>;
  const direct = b.prayer_id ?? b.prayer_request_id;
  if (typeof direct === "number" && Number.isInteger(direct) && direct > 0) {
    return { prayerId: direct };
  }
  if (typeof direct === "string" && /^\d+$/.test(direct)) {
    return { prayerId: parseInt(direct, 10) };
  }
  const record = b.record as Record<string, unknown> | undefined;
  if (record && typeof record.id === "number" && Number.isInteger(record.id)) {
    return { prayerId: record.id };
  }
  return { error: "missing_prayer_id" };
}

async function pcoFetch(
  fetchFn: FetchFn,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetchFn(`${PCO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function includedEmails(json: any): string[] {
  const included = Array.isArray(json?.included) ? json.included : [];
  return included
    .filter((e: any) => e?.type === "Email" && typeof e?.attributes?.address === "string")
    .map((e: any) => e.attributes.address.trim().toLowerCase());
}

function includedPhones(json: any): string[] {
  const included = Array.isArray(json?.included) ? json.included : [];
  return included
    .filter((p: any) => p?.type === "PhoneNumber" && typeof p?.attributes?.number === "string")
    .map((p: any) => normalizePhone(p.attributes.number));
}

export class PcoClient {
  constructor(
    private token: string,
    private fetchFn: FetchFn = fetch,
  ) {}

  /** Person id for an exact primary-email match, or null. Safe: never fuzzy. */
  async findPersonByEmail(email: string): Promise<string | null> {
    const needle = email.trim().toLowerCase();
    if (!needle) return null;
    try {
      const { ok, json } = await pcoFetch(
        this.fetchFn,
        this.token,
        `/people/v2/people?where[search_name_or_email]=${encodeURIComponent(needle)}&include=email_addresses&per_page=5`,
      );
      if (!ok || !json) return null;
      const data = Array.isArray(json.data) ? json.data : [];
      if (data.length !== 1) return null;
      const emails = includedEmails(json);
      if (!emails.includes(needle)) return null;
      const id = data[0]?.id;
      return typeof id === "string" || typeof id === "number" ? String(id) : null;
    } catch {
      return null;
    }
  }

  /** Person id for an exact phone-number match, or null. Safe: never fuzzy. */
  async findPersonByPhone(phone: string): Promise<string | null> {
    const digits = normalizePhone(phone);
    if (digits.length < 7) return null;
    try {
      const { ok, json } = await pcoFetch(
        this.fetchFn,
        this.token,
        `/people/v2/people?where[search_phone_number]=${encodeURIComponent(digits)}&include=phone_numbers&per_page=5`,
      );
      if (!ok || !json) return null;
      const data = Array.isArray(json.data) ? json.data : [];
      if (data.length !== 1) return null;
      const phones = includedPhones(json);
      if (!phones.includes(digits)) return null;
      const id = data[0]?.id;
      return typeof id === "string" || typeof id === "number" ? String(id) : null;
    } catch {
      return null;
    }
  }

  /** Create the per-church "Tend Prayer Requests" fallback person. Returns the id. */
  async createFallbackPerson(): Promise<string> {
    const { ok, status, json } = await pcoFetch(this.fetchFn, this.token, "/people/v2/people", {
      method: "POST",
      body: JSON.stringify(fallbackPersonPayload()),
    });
    if (!ok || !json?.data?.id) {
      throw new Error(`pco create person failed: ${status}`);
    }
    return String(json.data.id);
  }

  /** Create a workflow card. Returns the card id. */
  async createCard(workflowId: string, personId: string): Promise<string> {
    const { ok, status, json } = await pcoFetch(
      this.fetchFn,
      this.token,
      `/people/v2/workflows/${encodeURIComponent(workflowId)}/cards`,
      { method: "POST", body: JSON.stringify(cardCreatePayload(personId)) },
    );
    if (!ok || !json?.data?.id) {
      throw new Error(`pco create card failed: ${status}`);
    }
    return String(json.data.id);
  }

  /** Attach the prayer text as a note on the card. Returns the note id (may be null). */
  async createCardNote(
    personId: string,
    cardId: string,
    note: string,
    noteCategoryId?: string | null,
  ): Promise<string | null> {
    const { ok, status, json } = await pcoFetch(
      this.fetchFn,
      this.token,
      `/people/v2/people/${encodeURIComponent(personId)}/workflow_cards/${encodeURIComponent(cardId)}/notes`,
      { method: "POST", body: JSON.stringify(cardNotePayload(note, noteCategoryId)) },
    );
    if (!ok) {
      throw new Error(`pco create card note failed: ${status}`);
    }
    const id = json?.data?.id;
    return id == null ? null : String(id);
  }

  /** Workflows visible to the connected PCO user, for the Tend settings picker. */
  async listWorkflows(): Promise<{ id: string; name: string }[]> {
    const { ok, json } = await pcoFetch(
      this.fetchFn,
      this.token,
      "/people/v2/workflows?per_page=100&order=name",
    );
    if (!ok || !json) return [];
    const data = Array.isArray(json.data) ? json.data : [];
    return data
      .filter((w: any) => w?.id && typeof w?.attributes?.name === "string")
      .map((w: any) => ({ id: String(w.id), name: w.attributes.name }));
  }
}

/** Exchange a refresh token for a new token pair. Throws on failure. */
export async function refreshPcoTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  fetchFn: FetchFn = fetch,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetchFn(PCO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || !data?.access_token) {
    throw new Error(`pco token refresh failed: ${res.status}`);
  }
  return {
    access_token: data.access_token,
    refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : refreshToken,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : 7200,
  };
}
