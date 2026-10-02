import { supabase } from "./supabase";

/** Events the auth flow reports. Keep the list in sync with the
 *  auth_events table check constraint (migration 20261002_auth_events). */
export type AuthEvent =
  | "oauth_start" | "oauth_authorize_ok" | "oauth_authorize_fail"
  | "oauth_return" | "oauth_exchange_ok" | "oauth_exchange_fail"
  | "oauth_fallback_redeem"
  | "email_signup_ok" | "email_signup_fail"
  | "email_signin_ok" | "email_signin_fail"
  | "session_expired";

export type AuthProvider = "google" | "microsoft" | "azure" | "email";
export type AuthPlatform = "ios" | "android" | "desktop";
export type AuthFlow = "popup" | "solo";

export interface AuthEventData {
  provider?: AuthProvider;
  platform?: AuthPlatform;
  flow?: AuthFlow;
  /** Machine-readable code only (e.g. VERIFIER_MISSING). Never a message
   *  that could contain PII, and never a code/verifier/token/email. */
  error_code?: string;
  duration_ms?: number;
}

function detectPlatform(): AuthPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** Best-effort auth telemetry. Fire-and-forget: never rejects, never throws,
 *  never blocks the sign-in flow. Privacy: only the allowlisted fields in
 *  AuthEventData are sent — no emails, codes, verifiers, tokens, or user IDs. */
export function logAuthEvent(event: AuthEvent, data: AuthEventData = {}): void {
  try {
    const payload = {
      event,
      provider: data.provider ?? null,
      platform: data.platform ?? detectPlatform(),
      flow: data.flow ?? null,
      error_code: data.error_code ?? null,
      duration_ms: data.duration_ms ?? null,
      // Vercel-injected commit SHA when available; falls back to "web".
      app_version: (import.meta as any).env?.VITE_VERCEL_GIT_COMMIT_SHA ?? "web",
    };
    // Do not await: telemetry must never delay sign-in.
    void supabase.from("auth_events").insert(payload).then(
      () => undefined,
      () => undefined, // Swallow: logging failure is never a sign-in failure.
    );
  } catch {
    // Never let telemetry break auth.
  }
}

/** Map a caught error to a stable machine-readable code for telemetry. */
export function authErrorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/code verifier/i.test(msg)) return "VERIFIER_MISSING";
  if (/popup|blocked/i.test(msg)) return "POPUP_BLOCKED";
  if (/already open/i.test(msg)) return "ALREADY_OPEN";
  if (/not available|not configured/i.test(msg)) return "PROVIDER_UNAVAILABLE";
  if (/expired/i.test(msg)) return "CODE_EXPIRED";
  if (/network|fetch|timeout|Failed to fetch/i.test(msg)) return "NETWORK_ERROR";
  return "UNKNOWN_ERROR";
}
