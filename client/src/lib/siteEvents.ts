// First-party site events: page views and not-founds recorded in our own
// database (public.tend_site_events via the tend_log_site_event RPC), so
// product decisions can be made from data we can actually query, not only
// from GA4. Privacy rules mirror the GA rules in analytics.ts: anonymous
// counts and page paths only. Never prayer text, names, emails, phone
// numbers, or any pastoral-care content. Paths are stripped of query
// strings, and dashboard paths (which contain church ids) are not logged.

import { supabase } from "./supabase";
import { currentHashPath } from "./analytics";
import { parseSiteEventPath, isLoggablePath } from "./siteEventsCore";

export type SiteEventType = "page_view" | "not_found";

function sessionId(): string | null {
  try {
    let id = sessionStorage.getItem("tend_session_id");
    if (!id) {
      id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("tend_session_id", id);
    }
    return id;
  } catch {
    return null;
  }
}

function utmParams(): { source: string | null; medium: string | null; campaign: string | null } {
  try {
    let raw = sessionStorage.getItem("tend_utm");
    if (raw === null) {
      const q = new URLSearchParams(window.location.search);
      raw = JSON.stringify({
        source: q.get("utm_source"),
        medium: q.get("utm_medium"),
        campaign: q.get("utm_campaign"),
      });
      sessionStorage.setItem("tend_utm", raw);
    }
    const parsed = JSON.parse(raw);
    return {
      source: parsed.source || null,
      medium: parsed.medium || null,
      campaign: parsed.campaign || null,
    };
  } catch {
    return { source: null, medium: null, campaign: null };
  }
}

function referrerHost(): string | null {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    return host && host !== window.location.hostname ? host : null;
  } catch {
    return null;
  }
}

function deviceClass(): "mobile" | "desktop" {
  try {
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768
      ? "mobile"
      : "desktop";
  } catch {
    return "desktop";
  }
}

/**
 * Fire-and-forget event write. Never throws and never blocks the UI:
 * analytics must not be able to break the product.
 */
export function logSiteEvent(type: SiteEventType, hashPath?: string): void {
  try {
    if (typeof window === "undefined") return;
    const { path, slug } = parseSiteEventPath(hashPath ?? currentHashPath());
    if (type === "page_view" && !isLoggablePath(path)) return;
    const utm = utmParams();
    void supabase
      .rpc("tend_log_site_event", {
        p_type: type,
        p_path: path,
        p_slug: slug,
        p_referrer_host: referrerHost(),
        p_utm_source: utm.source,
        p_utm_medium: utm.medium,
        p_utm_campaign: utm.campaign,
        p_device: deviceClass(),
        p_session_id: sessionId(),
      })
      .then(undefined, () => undefined);
  } catch {
    /* logging must never break the page */
  }
}
