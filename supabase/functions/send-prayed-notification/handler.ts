type Config = { supabaseUrl: string; publicKey: string; resendKey: string; from: string };

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function createHandler(config: Config) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return reply(400, { error: "invalid_request" });
    }
    const prayerId = payload.prayerId;
    if (typeof prayerId !== "number" || !Number.isSafeInteger(prayerId) || prayerId <= 0) {
      return reply(400, { error: "invalid_request" });
    }
    if (!config.supabaseUrl || !config.publicKey) {
      console.error("prayed_notification_config_missing");
      return reply(503, { error: "configuration_unavailable" });
    }

    // The RPC enforces: shared (not private), not anonymous, has email,
    // and no notification in the last 24h. Returns zero rows when skipping.
    let rows: Array<{ send_to: string; church_name: string; pray_count: number }>;
    try {
      const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/tend_prepare_prayed_notification`, {
        method: "POST",
        headers: { apikey: config.publicKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_prayer_id: prayerId }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.error("prayed_notification_lookup_failed", res.status);
        return reply(502, { error: "lookup_failed" });
      }
      rows = await res.json();
    } catch {
      console.error("prayed_notification_lookup_unavailable");
      return reply(502, { error: "lookup_failed" });
    }
    if (!rows.length) return reply(200, { ok: true, skipped: true });

    const { send_to: to, church_name: church, pray_count: count } = rows[0];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 320) {
      console.error("prayed_notification_recipient_invalid");
      return reply(422, { error: "recipient_invalid" });
    }
    if (!config.resendKey) {
      console.error("prayed_notification_sender_config_missing");
      return reply(503, { error: "configuration_unavailable" });
    }

    const countLine = count === 1
      ? "Someone in your church family just prayed for your request."
      : `${count} people in your church family have prayed for your request.`;
    const text = `${countLine}\n\nYou are not alone in this. Your request was shared with ${church}, and people are lifting it up.\n\nWith care,\nThe Tend team`;
    const html = `<p>${escapeHtml(countLine)}</p>` +
      `<p>You are not alone in this. Your request was shared with <strong>${escapeHtml(church)}</strong>, and people are lifting it up.</p>` +
      `<p>With care,<br/>The Tend team</p><p style="color:#888;font-size:12px">Mark Johnson Ventures LLC, 551 Settlers Drive, Suite 200, Ada, MI 49301</p>`;

    try {
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `tend-prayed-notification/${prayerId}/${Date.now()}`,
        },
        body: JSON.stringify({ from: config.from, to, subject: "Someone prayed for your request", text, html }),
        signal: AbortSignal.timeout(15000),
      });
      if (!sent.ok) {
        console.error("prayed_notification_delivery_failed", sent.status);
        return reply(502, { error: "delivery_failed" });
      }
    } catch {
      console.error("prayed_notification_delivery_unavailable");
      return reply(502, { error: "delivery_failed" });
    }
    return reply(200, { ok: true, sent: true });
  };
}
