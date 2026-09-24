import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../supabase/functions/send-prayer-confirmation/handler.ts";

const config = { supabaseUrl: "https://project.example", publicKey: "public-fixture", resendKey: "fixture-only", from: "Tend <support@tendpray.com>" };
const timestamp = 1790000000;
const signature = "a".repeat(64);
const context = { authorized: true, recipient: "fixture@example.invalid", church_name: "Grace & Hope", greeting_message: "<Welcome>", pastor_name: "Pastor Example" };
function request(body: unknown = { prayer_id: "123", issued_at: timestamp }, sig = signature) {
  return new Request("https://function.example", { method: "POST", headers: { "x-tend-signature": sig }, body: JSON.stringify(body) });
}
function fixture(answer: unknown = context, rpcStatus = 200, sendStatus = 200) {
  const calls: Array<{url: string; init: RequestInit}> = [];
  const logs: unknown[] = [];
  const handler = createHandler(config, {
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
test("recipient and church come only from authenticated database context", async () => {
  const f = fixture();
  assert.equal((await f.handler(request({ prayer_id: "123", issued_at: timestamp, record: {submitter_email:"attacker@example.invalid",message:"PRIVATE PRAYER"}, church_name:"forged" }))).status, 200);
  const body = JSON.parse(f.calls[1].init.body as string);
  assert.equal(body.to, context.recipient);
  assert.match(body.text, /Grace & Hope/);
  assert.match(body.html, /Grace &amp; Hope/);
  assert.match(body.html, /&lt;Welcome&gt;/);
  assert.ok(!JSON.stringify(f.calls).includes("PRIVATE PRAYER"));
  assert.ok(!JSON.stringify(f.calls).includes("attacker@example"));
  assert.equal((f.calls[1].init.headers as Record<string,string>)["Idempotency-Key"], "tend-prayer-confirmation/123");
});
test("signed dry run checks lookup without sending or exposing recipient", async () => {
  const f = fixture({ authorized: true, church_lookup_ok: true });
  const response = await f.handler(request({ prayer_id: "0", issued_at: timestamp, dry_run: true }));
  assert.deepEqual(await response.json(), { ok:true,dry_run:true,church_lookup_ok:true,sender_configured:true });
  assert.equal(f.calls.length, 1);
});
test("anonymous or deleted submissions skip delivery", async () => {
  const f = fixture({ authorized: true, skip: true });
  assert.equal((await f.handler(request())).status, 200);
  assert.equal(f.calls.length, 1);
});
test("database and church lookup errors do not silently send generic email", async () => {
  for (const f of [fixture({},500), fixture({authorized:true,error:"church_lookup_failed"})]) {
    assert.equal((await f.handler(request())).status, 502);
    assert.equal(f.calls.length, 1);
    assert.ok(f.logs.length);
  }
});
test("invalid recipient and missing sender configuration fail closed", async () => {
  const f = fixture({...context,recipient:"bad\\naddress"});
  assert.equal((await f.handler(request())).status, 422);
  assert.equal(f.calls.length, 1);
  const handler = createHandler({...config,publicKey:""}, {now:()=>timestamp*1000,log:()=>{}});
  assert.equal((await handler(request())).status,503);
});
test("oversized and invalid payloads are rejected", async () => {
  const f = fixture();
  assert.equal((await f.handler(request({padding:"x".repeat(3000)}))).status,413);
  for (const id of ["-1", "9223372036854775808", 1]) {
    assert.equal((await f.handler(request({prayer_id:id,issued_at:timestamp}))).status,400);
  }
  assert.equal(f.calls.length,0);
});
test("delivery failure logs only status, not recipient or provider response", async () => {
  const f=fixture(context,200,429);
  assert.equal((await f.handler(request())).status,502);
  assert.deepEqual(f.logs,[["confirmation_delivery_failed",429]]);
});
