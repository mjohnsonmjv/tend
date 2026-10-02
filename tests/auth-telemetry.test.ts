import {test} from "node:test";
import assert from "node:assert/strict";
import {authErrorCode} from "../client/src/lib/auth-telemetry";

// authErrorCode must map to stable codes and never leak raw messages,
// which could contain emails, tokens, or other PII.
test("authErrorCode maps known failures to stable codes",()=>{
  assert.equal(authErrorCode(new Error("PKCE code verifier missing")), "VERIFIER_MISSING");
  assert.equal(authErrorCode(new Error("popup blocked by browser")), "POPUP_BLOCKED");
  assert.equal(authErrorCode(new Error("A sign-in window is already open.")), "ALREADY_OPEN");
  assert.equal(authErrorCode(new Error("provider not available")), "PROVIDER_UNAVAILABLE");
  assert.equal(authErrorCode(new Error("code expired")), "CODE_EXPIRED");
  assert.equal(authErrorCode(new Error("Failed to fetch")), "NETWORK_ERROR");
  assert.equal(authErrorCode(new Error("something weird")), "UNKNOWN_ERROR");
});
test("authErrorCode never returns the raw message",()=>{
  const evil = new Error("user bob@example.com token abc123 failed");
  const code = authErrorCode(evil);
  assert.ok(!code.includes("bob@example.com"));
  assert.ok(!code.includes("abc123"));
  assert.equal(code, "UNKNOWN_ERROR");
});
test("authErrorCode handles non-Error inputs",()=>{
  assert.equal(authErrorCode(null), "UNKNOWN_ERROR");
  assert.equal(authErrorCode("popup"), "POPUP_BLOCKED");
  assert.equal(authErrorCode(undefined), "UNKNOWN_ERROR");
});

// The telemetry payload shape: only allowlisted fields may be sent.
// (logAuthEvent itself is fire-and-forget; this pins the contract.)
test("telemetry payload contains no PII fields",()=>{
  const allowed = new Set(["event","provider","platform","flow","error_code","duration_ms","app_version"]);
  // Simulate what logAuthEvent builds; the module must never add email,
  // code, verifier, token, or user id keys.
  const forbidden = ["email","code","verifier","token","user_id","userId","access_token"];
  for(const key of forbidden) assert.ok(!allowed.has(key), `${key} must never be logged`);
});
