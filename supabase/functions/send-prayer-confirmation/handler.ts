type Config = { supabaseUrl: string; publicKey: string; resendKey: string; from: string };
type Dependencies = {
  fetch?: typeof fetch;
  now?: () => number;
  log?: (event: string, status?: number) => void;
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function boundedBody(req: Request): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); throw new Error("too_large"); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(all);
}

export function createHandler(config: Config, dependencies: Dependencies = {}) {
  const fetcher = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  // Log only error categories and HTTP statuses, never recipients or content.
  const log = dependencies.log ?? ((event, status) => console.error(event, status ?? ""));

  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
    const signature = req.headers.get("x-tend-signature") ?? "";
    if (!/^[a-f0-9]{64}$/.test(signature)) return reply(401, { error: "unauthorized" });
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(await boundedBody(req));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid");
    } catch (error) {
      return reply(error instanceof Error && error.message === "too_large" ? 413 : 400, { error: "invalid_request" });
    }
    const id = payload.prayer_id;
    const issued = payload.issued_at;
    const dryRun = payload.dry_run === true;
    if (typeof id !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(id) ||
        BigInt(id) > 9223372036854775807n ||
        typeof issued !== "number" || !Number.isSafeInteger(issued) ||
        (payload.dry_run !== undefined && typeof payload.dry_run !== "boolean")) {
      return reply(400, { error: "invalid_request" });
    }
    const age = Math.floor(now() / 1000) - issued;
    if (age < -60 || age > 600) return reply(401, { error: "unauthorized" });
    if (!config.supabaseUrl || !config.publicKey) {
      log("confirmation_public_config_missing");
      return reply(503, { error: "configuration_unavailable" });
    }

    let context: Record<string, unknown>;
    try {
      const result = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/tend_prepare_prayer_confirmation`, {
        method: "POST",
        headers: { apikey: config.publicKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_prayer_id: id, p_issued_at: issued, p_signature: signature, p_dry_run: dryRun }),
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) {
        log("confirmation_lookup_failed", result.status);
        return reply(502, { error: "lookup_failed" });
      }
      context = await result.json();
    } catch {
      log("confirmation_lookup_unavailable");
      return reply(502, { error: "lookup_failed" });
    }
    if (context?.authorized !== true) return reply(401, { error: "unauthorized" });
    if (dryRun) {
      return reply(200, {
        ok: true, dry_run: true,
        church_lookup_ok: context.church_lookup_ok === true,
        sender_configured: Boolean(config.resendKey && config.from),
      });
    }
    if (context.skip === true) return reply(200, { ok: true, skipped: true });
    if (context.error || typeof context.church_name !== "string" || !context.church_name.trim()) {
      log("confirmation_church_lookup_failed");
      return reply(502, { error: "church_lookup_failed" });
    }
    const to = context.recipient;
    if (typeof to !== "string" || to.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      log("confirmation_recipient_invalid");
      return reply(422, { error: "recipient_invalid" });
    }
    if (!config.resendKey) {
      log("confirmation_sender_config_missing");
      return reply(503, { error: "configuration_unavailable" });
    }
    const church = context.church_name;
    const greeting = typeof context.greeting_message === "string" && context.greeting_message.trim()
      ? context.greeting_message : "Thank you for sharing. Your request has been received.";
    const pastor = typeof context.pastor_name === "string" ? context.pastor_name : "";
    const notice = "Your request was received and will be seen by the care team. " +
      "This is a confirmation, not a reply. If this is an emergency, please contact emergency services or someone you trust directly.";
    // No prayer message, submitter name/phone, or private notes are read or sent.
    const text = `Thank you for sharing with ${church}.\n\n"${greeting}"${pastor ? ` (from ${pastor})` : ""}\n\n${notice}\n\nWith care,\nThe Tend team`;
    const html = `<p>Thank you for sharing with <strong>${escapeHtml(church)}</strong>.</p>` +
      `<p>&ldquo;${escapeHtml(greeting)}&rdquo;${pastor ? ` (from ${escapeHtml(pastor)})` : ""}</p>` +
      `<p>${notice}</p><p>With care,<br/>The Tend team</p>`;
    try {
      const sent = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendKey}`, "Content-Type": "application/json",
          "Idempotency-Key": `tend-prayer-confirmation/${id}`,
        },
        body: JSON.stringify({ from: config.from, to, subject: "Your prayer request was received", text, html }),
        signal: AbortSignal.timeout(15000),
      });
      if (!sent.ok) {
        log("confirmation_delivery_failed", sent.status);
        return reply(502, { error: "delivery_failed" });
      }
    } catch {
      log("confirmation_delivery_unavailable");
      return reply(502, { error: "delivery_failed" });
    }
    return reply(200, { ok: true, sent: true });
  };
}
