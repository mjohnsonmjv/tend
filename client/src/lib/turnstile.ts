/** Cloudflare Turnstile (invisible) helpers, shared by the prayer form and phone sign-in. */

export const TURNSTILE_SITE_KEY = "0x4AAAAAAFFHL0Ua9nyooYhz"; // public site key

declare global {
  interface Window { turnstile?: any }
}

/** Hard ceiling: a challenge must never hang the UI forever. */
const TURNSTILE_TIMEOUT_MS = 25000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), TURNSTILE_TIMEOUT_MS);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("captcha unavailable"));
  if (window.turnstile) return Promise.resolve();
  return withTimeout(new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("captcha unavailable")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("captcha unavailable"));
    document.head.appendChild(s);
  }), "captcha unavailable");
}

/**
 * Runs one invisible Turnstile challenge and resolves with the token.
 * Renders into the element with the given id, which must exist in the DOM.
 * Each token is single-use: call again for each protected request.
 */
export function turnstileToken(holderId = "turnstile-holder"): Promise<string> {
  return withTimeout(new Promise<string>((resolve, reject) => {
    const t = window.turnstile;
    if (!t) { reject(new Error("captcha unavailable")); return; }
    let id: string | undefined;
    const cleanup = () => { try { if (id) t.remove(id); } catch { /* already gone */ } };
    try {
      id = t.render(`#${holderId}`, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        callback: (token: string) => { cleanup(); resolve(token); },
        "error-callback": () => { cleanup(); reject(new Error("verification failed")); },
        "expired-callback": () => { cleanup(); reject(new Error("verification expired")); },
        "timeout-callback": () => { cleanup(); reject(new Error("verification timed out")); },
      });
      t.execute(id);
    } catch {
      cleanup();
      reject(new Error("verification failed"));
    }
  }), "verification timed out");
}
