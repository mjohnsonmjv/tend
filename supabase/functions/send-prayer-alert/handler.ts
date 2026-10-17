type Config = {
  supabaseUrl: string;
  publicKey: string;
  resendKey: string;
  from: string;
  inboxUrl: string;
};
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

const validEmail = (v: unknown) =>
  typeof v === "string" && v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function createHandler(config: Config, dependencies: Dependencies = {}) {
  const fetcher = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  // Log only error categories and HTTP statuses, never recipients or prayer text.
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
      log("prayer_alert_public_config_missing");
      return reply(503, { error: "configuration_unavailable" });
    }

    let context: Record<string, unknown>;
    try {
      const result = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/tend_prepare_prayer_alert`, {
        method: "POST",
        headers: { apikey: config.publicKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_prayer_id: id, p_issued_at: issued, p_signature: signature, p_dry_run: dryRun }),
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) {
        log("prayer_alert_lookup_failed", result.status);
        return reply(502, { error: "lookup_failed" });
      }
      context = await result.json();
    } catch {
      log("prayer_alert_lookup_unavailable");
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
      log("prayer_alert_church_lookup_failed");
      return reply(502, { error: "church_lookup_failed" });
    }
    const recipients = Array.isArray(context.recipients)
      ? context.recipients.filter(validEmail).slice(0, 50)
      : [];
    if (recipients.length === 0) {
      log("prayer_alert_no_recipients");
      return reply(200, { ok: true, skipped: true });
    }
    if (!config.resendKey) {
      log("prayer_alert_sender_config_missing");
      return reply(503, { error: "configuration_unavailable" });
    }

    const church = context.church_name as string;
    const excerpt = typeof context.prayer_excerpt === "string" ? context.prayer_excerpt : "";
    const subject = `New prayer request for ${church}`;
    // The team sees the full text in the inbox; the email carries only a short excerpt.
    const text = `A new prayer request just came in for ${church}.` +
      (excerpt ? `\n\n"${excerpt}${excerpt.length >= 140 ? "..." : ""}"` : "") +
      `\n\nView it in your inbox: ${config.inboxUrl}\n\nWith care,\nThe Tend team`;
    const html = `<p>A new prayer request just came in for <strong>${escapeHtml(church)}</strong>.</p>` +
      (excerpt ? `<p>&ldquo;${escapeHtml(excerpt)}${excerpt.length >= 140 ? "..." : ""}&rdquo;</p>` : "") +
      `<p><a href="${escapeHtml(config.inboxUrl)}">View it in your inbox</a></p>` +
      `<p>With care,<br/>The Tend team</p>`;

    let sent = 0;
    const failures: string[] = [];
    for (let i = 0; i < recipients.length; i++) {
      try {
        const res = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.resendKey}`, "Content-Type": "application/json",
            "Idempotency-Key": `tend-prayer-alert/${id}/${i}`,
          },
          body: JSON.stringify({ from: config.from, to: recipients[i], subject, text, html }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) { sent++; }
        else { failures.push(`recipient_${i}:${res.status}`); log("prayer_alert_delivery_failed", res.status); }
      } catch {
        failures.push(`recipient_${i}:unavailable`); log("prayer_alert_delivery_unavailable");
      }
    }
    if (sent === 0) return reply(502, { error: "delivery_failed", failures });
    return reply(200, { ok: true, sent, failed: failures.length });
  };
}
