import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSiteEventPath, isLoggablePath } from "../client/src/lib/siteEventsCore.ts";

describe("parseSiteEventPath", () => {
  it("keeps plain paths and strips query strings", () => {
    assert.deepEqual(parseSiteEventPath("/pricing?utm_source=x"), { path: "/pricing", slug: null });
    assert.deepEqual(parseSiteEventPath("/"), { path: "/", slug: null });
  });

  it("extracts the public slug from church, gift, and watch paths", () => {
    assert.deepEqual(parseSiteEventPath("/c/fhbcgr"), { path: "/c/fhbcgr", slug: "fhbcgr" });
    assert.deepEqual(parseSiteEventPath("/c/fhbcgr/wall"), { path: "/c/fhbcgr/wall", slug: "fhbcgr" });
    assert.deepEqual(parseSiteEventPath("/gift/fhbcgr"), { path: "/gift/fhbcgr", slug: "fhbcgr" });
    assert.deepEqual(parseSiteEventPath("/w/spring-watch"), { path: "/w/spring-watch", slug: "spring-watch" });
  });

  it("rejects malformed slug segments", () => {
    assert.equal(parseSiteEventPath("/c/Bad_Slug!").slug, null);
    assert.equal(parseSiteEventPath("/c/").slug, null);
  });
});

describe("isLoggablePath", () => {
  it("logs public and auth-entry paths", () => {
    for (const p of ["/", "/pricing", "/c/demo", "/gift/fhbcgr", "/login", "/signup", "/text"]) {
      assert.equal(isLoggablePath(p), true, p);
    }
  });

  it("never logs dashboard paths that carry church ids", () => {
    for (const p of ["/app", "/church/2/dashboard", "/church/2/settings", "/billing/checkout"]) {
      assert.equal(isLoggablePath(p), false, p);
    }
  });
});
