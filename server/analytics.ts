// Server-side GA4 Measurement Protocol.
// Sends key funnel events from the server so they can't be blocked by
// ad blockers, privacy browsers, or client-side JS failures.
// Privacy rule: only anonymous counts. Never send prayer text, names,
// emails, phones, or church-identifying data.

const GA_MEASUREMENT_ID = "G-BXVRYNV9ZR";
// Set GA4_API_SECRET in the environment (GA4 Admin > Data streams > Measurement Protocol API secrets).
const GA_API_SECRET = process.env.GA4_API_SECRET;

interface GAEvent {
  name: string;
  params?: Record<string, string | number | boolean>;
}

async function sendToGA(events: GAEvent[], clientId: string): Promise<void> {
  if (!GA_API_SECRET) {
    console.warn("[analytics] GA4_API_SECRET not set; skipping server-side event", events.map(e => e.name).join(","));
    return;
  }
  // Abort after 3s so analytics can never slow down or block the API response.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, events }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      console.warn("[analytics] GA4 MP request failed:", res.status);
    }
  } catch (err) {
    // AbortError on timeout is expected; don't spam logs for it.
    if ((err as Error).name !== "AbortError") {
      console.warn("[analytics] GA4 MP error:", (err as Error).message);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// Deterministic anonymous client ID derived from the request IP + user agent.
// Not a cookie; just enough for GA4 to sessionize server-side events.
function anonymousClientId(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const ip = req.ip || "0.0.0.0";
  const ua = String(req.headers["user-agent"] || "");
  let hash = 0;
  const s = `${ip}|${ua}`;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `${hash}.${Date.now() % 100000}`;
}

export function trackServerSignup(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): void {
  // Fire and forget; never block the response on analytics.
  sendToGA([{ name: "sign_up", params: { method: "church_signup", source: "server" } }], anonymousClientId(req));
}

export function trackServerPrayerSubmitted(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): void {
  sendToGA([{ name: "prayer_request_submitted", params: { source: "server" } }], anonymousClientId(req));
}
