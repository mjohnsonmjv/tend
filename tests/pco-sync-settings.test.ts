import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePcoSyncReturn,
  stripPcoSyncReturn,
  summarizeSyncResults,
  pcoErrorMessage,
  connectUrl,
} from "../client/src/lib/pcoSync.ts";

test("parsePcoSyncReturn reads a successful connect", () => {
  assert.deepEqual(parsePcoSyncReturn("#/church/4/settings?pco=connected"), {
    connected: true,
    error: null,
  });
});

test("parsePcoSyncReturn reads an error code", () => {
  assert.deepEqual(parsePcoSyncReturn("#/church/4/settings?pco_error=access_denied"), {
    connected: false,
    error: "access_denied",
  });
});

test("parsePcoSyncReturn ignores unrelated params and empty hashes", () => {
  assert.deepEqual(parsePcoSyncReturn("#/church/4/settings"), { connected: false, error: null });
  assert.deepEqual(parsePcoSyncReturn("#/church/4/settings?tab=1"), { connected: false, error: null });
  assert.deepEqual(parsePcoSyncReturn(""), { connected: false, error: null });
});

test("parsePcoSyncReturn truncates overlong error codes", () => {
  const long = "x".repeat(200);
  const parsed = parsePcoSyncReturn(`#/church/4/settings?pco_error=${long}`);
  assert.equal(parsed.error?.length, 64);
});

test("stripPcoSyncReturn removes only the PCO params", () => {
  assert.equal(
    stripPcoSyncReturn("#/church/4/settings?pco=connected"),
    "#/church/4/settings",
  );
  assert.equal(
    stripPcoSyncReturn("#/church/4/settings?tab=2&pco_error=exchange_failed"),
    "#/church/4/settings?tab=2",
  );
  assert.equal(stripPcoSyncReturn("#/church/4/settings"), "#/church/4/settings");
});

test("summarizeSyncResults counts synced and failed with friendly reasons", () => {
  const summary = summarizeSyncResults({
    attempted: 4,
    results: [
      { prayer_id: 1, synced: true, card_id: "9" },
      { prayer_id: 2, synced: true, deduped: true, card_id: "8" },
      { prayer_id: 3, synced: false, reason: "no_workflow" },
      { prayer_id: 4, synced: false, reason: "pco_error", error: "boom" },
    ],
  });
  assert.equal(summary.attempted, 4);
  assert.equal(summary.synced, 2);
  assert.equal(summary.failed, 2);
  assert.deepEqual(summary.failureReasons, [
    "no workflow chosen yet",
    "Planning Center returned an error",
  ]);
});

test("summarizeSyncResults handles empty and malformed input", () => {
  assert.deepEqual(summarizeSyncResults({ attempted: 0, results: [] }), {
    attempted: 0,
    synced: 0,
    failed: 0,
    failureReasons: [],
  });
  assert.deepEqual(summarizeSyncResults(null), {
    attempted: 0,
    synced: 0,
    failed: 0,
    failureReasons: [],
  });
  assert.deepEqual(summarizeSyncResults({ results: [{ prayer_id: 1 }] }), {
    attempted: 1,
    synced: 0,
    failed: 1,
    failureReasons: ["an unexpected error"],
  });
});

test("pcoErrorMessage covers known codes with a default fallback", () => {
  assert.ok(pcoErrorMessage("access_denied").toLowerCase().includes("cancelled"));
  assert.ok(pcoErrorMessage("invalid_state").toLowerCase().includes("expired"));
  assert.ok(pcoErrorMessage("exchange_failed").length > 10);
  assert.ok(pcoErrorMessage("bogus_code").toLowerCase().includes("try again"));
  assert.ok(pcoErrorMessage(null).toLowerCase().includes("try again"));
});

test("pco error messages contain no em dashes", () => {
  for (const code of [
    "access_denied",
    "invalid_callback",
    "invalid_state",
    "exchange_failed",
    "server_error",
    "unauthorized",
    "not_connected",
    "invalid_workflow_id",
    null,
    "bogus",
  ]) {
    assert.ok(!pcoErrorMessage(code).includes("—"), `message for ${code} has an em dash`);
  }
});

test("connectUrl requests the authorize URL as JSON", () => {
  const url = connectUrl(4);
  assert.ok(url.includes("/functions/v1/pco-prayer-sync/connect"));
  assert.ok(url.includes("church_id=4"));
  assert.ok(url.includes("format=json"));
});
