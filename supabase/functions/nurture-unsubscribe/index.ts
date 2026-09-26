// nurture-unsubscribe: one-click/list-unsubscribe handler for nurture emails.
// Supports GET (link click) and POST (one-click, List-Unsubscribe=One-Click).
// ?email=...&token=...

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
  return res.json();
}

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Georgia,serif;max-width:560px;margin:80px auto;padding:0 24px;color:#2A2521;text-align:center;"><h1 style="font-weight:normal;">${title}</h1><p style="color:#6F665B;">${body}</p></body></html>`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";
  if (!email || !token) {
    return new Response(page("Link not valid", "That unsubscribe link is missing information. Reply to any Tend email and we will remove you."), {
      headers: { "content-type": "text/html" },
    });
  }
  try {
    const rows = await db(
      `nurture_leads?email=eq.${encodeURIComponent(email)}&unsub_token=eq.${encodeURIComponent(token)}&select=id,unsubscribed_at`
    );
    const lead = Array.isArray(rows) ? rows[0] : null;
    if (!lead) {
      return new Response(page("Link not valid", "We could not find that subscription. Reply to any Tend email and we will remove you."), {
        headers: { "content-type": "text/html" },
      });
    }
    if (!lead.unsubscribed_at) {
      await db(`nurture_leads?id=eq.${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
      });
    }
    return new Response(page("You are unsubscribed", "You will not get any more Tend emails. If this was a mistake, just try the demo again."), {
      headers: { "content-type": "text/html" },
    });
  } catch (e) {
    console.error("unsubscribe failed", e);
    return new Response(page("Something went wrong", "Please try again, or reply to any Tend email and we will remove you."), {
      headers: { "content-type": "text/html" },
    });
  }
});
