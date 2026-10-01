// pray-session: mints a single-use ElevenLabs Scribe realtime token for a
// one-button pray session, and returns recognition keyterms for the church's
// open prayer requests.
// Auth: Authorization: Bearer <supabase user JWT>. Body: { church_id }.
// The ElevenLabs API key never leaves the server; the browser only ever
// sees the 15-minute single-use token. No audio or transcript touches this
// function. If ELEVENLABS_API_KEY is unset, the client gets a clear 503.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "https://tendpray.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","but","by","for","from","has","have",
  "he","her","him","his","i","in","is","it","me","my","of","on","or","our",
  "please","pray","praying","prayer","prayers","she","that","the","their",
  "them","they","this","to","us","was","we","will","with","you","your",
  "lord","god","jesus","amen","father","dear","just","so","all","up","out",
]);

function rest(path: string, token: string) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length > 0);
}

/** Recognition keyterms: submitter names first, then distinctive message words. */
function buildKeyterms(prayers: Array<{ submitter_name: string | null; is_anonymous: boolean; message: string }>): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const clean = t.toLowerCase().slice(0, 20);
    if (clean.length >= 2 && !seen.has(clean) && !STOPWORDS.has(clean)) {
      seen.add(clean);
      terms.push(clean);
    }
  };
  for (const p of prayers) {
    if (!p.is_anonymous && p.submitter_name) words(p.submitter_name).forEach(push);
  }
  for (const p of prayers) {
    for (const w of words(p.message)) {
      if (w.length > 2 && !STOPWORDS.has(w)) push(w);
      if (terms.length >= 50) break;
    }
    if (terms.length >= 50) break;
  }
  return terms.slice(0, 50);
}

/**
 * Mint a single-use realtime token. Verified 2026-09-30 against the official
 * ElevenLabs API reference: POST /v1/single-use-token/:token_type, no body,
 * responds {"token": "sutkn_..."}. Tokens expire after 15 minutes and are
 * consumed on first use.
 */
async function mintToken(): Promise<string | null> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (typeof data.token === "string" && data.token) return data.token;
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "Sign in to continue." });

    // Verify the caller.
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return json(401, { error: "Sign in to continue." });

    const { church_id } = await req.json().catch(() => ({}));
    const churchId = Number(church_id);
    if (!churchId) return json(400, { error: "Missing church." });

    // Membership is proven by RLS: the church row is only readable by its team.
    const churchRes = await rest(`tend_churches?id=eq.${churchId}&select=id`, token);
    if (!churchRes.ok) return json(404, { error: "Church not found." });
    const churches = await churchRes.json().catch(() => []);
    if (!Array.isArray(churches) || !churches.length) return json(404, { error: "Church not found." });

    if (!ELEVENLABS_KEY) {
      return json(503, { error: "Pray mode is not set up for this church yet. The ElevenLabs key has not been configured." });
    }

    const prayersRes = await rest(
      `tend_prayers?church_id=eq.${churchId}&status=in.(new,praying)&select=submitter_name,is_anonymous,message&order=created_at.desc&limit=200`,
      token
    );
    const prayers = prayersRes.ok ? await prayersRes.json().catch(() => []) : [];
    const keyterms = buildKeyterms(Array.isArray(prayers) ? prayers : []);

    const elevenToken = await mintToken();
    if (!elevenToken) return json(502, { error: "Could not reach the transcription service. Please try again." });

    return json(200, { token: elevenToken, keyterms });
  } catch (e) {
    console.error("pray-session failed", e);
    return json(500, { error: "Could not start a prayer session." });
  }
});
