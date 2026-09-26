// Google Analytics 4 helper.
// Privacy rule: never send prayer text, names, emails, phone numbers, or any
// pastoral-care content to Google Analytics. Events below carry only anonymous
// counts and page paths.

export const GA_MEASUREMENT_ID = "G-BXVRYNV9ZR";

type GtagFn = (command: string, target: string, params?: Record<string, unknown>) => void;

function gtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const fn = (window as unknown as Record<string, unknown>).gtag;
  return typeof fn === "function" ? (fn as GtagFn) : null;
}

export function isAnalyticsEnabled(): boolean {
  return gtag() !== null;
}

// Track a page view for hash-based routing. Call on initial load and on every
// hash change. The page_path is the hash route (e.g. /#/pricing); query strings
// are stripped so no form input can leak into analytics.
export function trackPageView(hashPath: string): void {
  const fn = gtag();
  if (!fn) return;
  const cleanPath = hashPath.split("?")[0].split("#")[0] || "/";
  fn("event", "page_view", {
    page_path: `/#${cleanPath}`,
    page_location: `${window.location.origin}/#${cleanPath}`,
  });
}

export function currentHashPath(): string {
  if (typeof window === "undefined") return "/";
  const hash = window.location.hash || "#/";
  return hash.replace(/^#/, "") || "/";
}

// A church signup was started (signup page viewed).
export function trackSignupStarted(): void {
  const fn = gtag();
  if (!fn) return;
  fn("event", "signup_started", { method: "church_signup" });
}

// A church was created and its QR code issued. Uses GA4's recommended sign_up event.
export function trackSignupCompleted(): void {
  const fn = gtag();
  if (!fn) return;
  fn("event", "sign_up", { method: "church_signup" });
}

// A prayer request was submitted through a church's public page.
// Anonymous count only: no request text, name, phone, or church-identifying data.
export function trackPrayerSubmitted(): void {
  const fn = gtag();
  if (!fn) return;
  fn("event", "prayer_request_submitted", {});
}
