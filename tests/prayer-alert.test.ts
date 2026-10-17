import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../supabase/functions/send-prayer-alert/handler.ts";

const config = {
  supabaseUrl: "https://project.example",
  publicKey: "public-fixture",
  resendKey: "fixture-only",
  from: "Tend <support@tendpray.com>",
  inboxUrl: "https://tendpray.com/#/app",
};
const timestamp = 1790000000;
const signature = "a".repeat(64);
const context = {
  authorized: true,
  recipients: ["owner@example.invalid", "teammate@example.invalid"],
  church_name: "Grace & Hope",
  church_id: 7,
  prayer_excerpt: "Please pray for <Mom>",
  is_anonymous: false,
};
function request(body: unknown = { prayer_id: "123", issued_at: timestamp }, sig = signature) {
  return new Request("https://function.example", { method: "POST", headers: { "x-tend-signature": sig }, body: JSON.stringify(body) });
}
function fixture(answer: unknown = context, rpcStatus = 200, sendStatus = 200, configOverride: Record<string, unknown> = {}) {
  const calls: Array<{url: string; init: RequestInit}> = [];
  const logs: unknown[] = [];
  const handler = createHandler({ ...config, ...configOverride }, {
    now: () => timestamp * 1000,
    log: (...args) => logs.push(args),
    fetch: (async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return String(url).includes("/rpc/")
        ? new Response(JSON.stringify(answer), { status: rpcStatus })
        : new Response('{"id":"fixture-email"}', { status: sendStatus });
    }) as typeof fetch,
  });
  return { handler, calls, logs };
}
test("unsigned and malformed signatures fail before any network request", async () => {
  const f = fixture();
  for (const sig of ["", "bad", "a".repeat(65)]) assert.equal((await f.handler(request({}, sig))).status, 401);
  assert.equal(f.calls.length, 0);
});
test("stale or future signed requests are rejected before lookup", async () => {
  const f = fixture();
  for (const issued of [timestamp - 601, timestamp + 61]) {
    assert.equal((await f.handler(request({ prayer_id: "1", issued_at: issued }))).status, 401);
  }
  assert.equal(f.calls.length, 0);
});
test("database authorization failure sends nothing", async () => {
  const f = fixture({ authorized: false });
  assert.equal((await f.handler(request())).status, 401);
  assert.equal(f.calls.length, 1);
});
test("recipients come only from authenticated database context", async () => {
  const f = fixture();
  const res = await f.handler(request({ prayer_id: "123", issued_at: timestamp, recipients: ["attacker@example.invalid"] }));
  assert.equal(res.status, 200);
  const sends = f.calls.filter((c) => !String(c.url).includes("/rpc/"));
  assert.equal(sends.length, 2);
  const bodies = sends.map((c) => JSON.parse(c.init.body as string));
  assert.deepEqual(bodies.map((b) => b.to).sort(), ["owner@example.invalid", "teammate@example.invalid"]);
  assert.ok(!JSON.stringify(f.calls).includes("attacker@example"));
  assert.match(bodies[0].text, /Grace & Hope/);
  assert.match(bodies[0].html, /Grace &amp; Hope/);
  assert.match(bodies[0].html, /&lt;Mom&gt;/);
  assert.match(bodies[0].text, /https:\/\/tendpray\.com\/#\/app/);
  assert.equal((sends[0].init.headers as Record<string,string>)["Idempotency-Key"], "tend-prayer-alert/123/0");
  assert.equal((sends[1].init.headers as Record<string,string>)["Idempotency-Key"], "tend-prayer-alert/123/1");
});
test("signed dry run checks lookup without sending", async () => {
  const f = fixture({ authorized: true, church_lookup_ok: true });
  const response = await f.handler(request({ prayer_id: "0", issued_at: timestamp, dry_run: true }));
  assert.deepEqual(await response.json(), { ok: true, dry_run: true, church_lookup_ok: true, sender_configured: true });
  assert.equal(f.calls.length, 1);
});
test("missing prayer or no recipients skip delivery", async () => {
  for (const answer of [{ authorized: true, skip: true }, { ...context, recipients: [] }]) {
    const f = fixture(answer);
    const res = await f.handler(request());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, skipped: true });
    assert.equal(f.calls.length, 1);
  }
});
test("database and church lookup errors do not silently send generic email", async () => {
  for (const f of [fixture({}, 500), fixture({ authorized: true, error: "church_lookup_failed" })]) {
    assert.equal((await f.handler(request())).status, 502);
    assert.equal(f.calls.length, 1);
    assert.ok(f.logs.length);
  }
});
test("invalid recipients and missing sender configuration fail closed", async () => {
  const f = fixture({ ...context, recipients: ["bad\naddress"] });
  assert.equal((await f.handler(request())).status, 200); // filtered to zero -> skipped
  assert.equal(f.calls.length, 1);
  const { handler } = fixture(context, 200, 200, { resendKey: "" });
  assert.equal((await handler(request())).status, 503);
});
test("partial delivery reports sent and failed counts", async () => {
  let n = 0;
  const handler = createHandler(config, {
    now: () => timestamp * 1000,
    log: () => {},
    fetch: (async (url: unknown) => {
      if (String(url).includes("/rpc/")) return new Response(JSON.stringify(context), { status: 200 });
      n++;
      return n === 1
        ? new Response('{"id":"ok"}', { status: 200 })
        : new Response("nope", { status: 500 });
    }) as typeof fetch,
  });
  const res = await handler(request());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, sent: 1, failed: 1 });
});
test("total delivery failure returns 502", async () => {
  const f = fixture(context, 200, 500);
  assert.equal((await f.handler(request())).status, 502);
});
