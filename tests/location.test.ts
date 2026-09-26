import {test} from "node:test";
import assert from "node:assert/strict";
import {stripHashQuery,pageQuery} from "../client/src/lib/location";

function withLocation(hash: string, search: string, fn: () => void) {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g.window;
  g.window = { location: { hash, search } };
  try { fn() } finally { if (prev === undefined) delete g.window; else g.window = prev; }
}

test("stripHashQuery removes query strings from hash paths", () => {
  assert.equal(stripHashQuery("/billing/success?church=4&session_id=cs_123"), "/billing/success");
  assert.equal(stripHashQuery("/pricing"), "/pricing");
  assert.equal(stripHashQuery(""), "/");
});

test("pageQuery reads params inside the hash fragment (Stripe redirects)", () => {
  withLocation("#/billing/success?church=4&session_id=cs_123", "", () => {
    const q = pageQuery();
    assert.equal(q.get("church"), "4");
    assert.equal(q.get("session_id"), "cs_123");
  });
});

test("pageQuery reads params from location.search (wouter internal nav)", () => {
  withLocation("#/billing/checkout", "?plan=starter&interval=month", () => {
    const q = pageQuery();
    assert.equal(q.get("plan"), "starter");
    assert.equal(q.get("interval"), "month");
  });
});

test("pageQuery is empty with no params anywhere", () => {
  withLocation("#/pricing", "", () => {
    assert.equal([...pageQuery().keys()].length, 0);
  });
});

test("pageQuery works without a window", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g.window;
  delete g.window;
  try { assert.equal([...pageQuery().keys()].length, 0); }
  finally { if (prev !== undefined) g.window = prev; }
});
