// Pure helpers for first-party site events (see siteEvents.ts). Kept free of
// browser and Supabase imports so they can be unit-tested in node.

const SLUG_PREFIXES = ["/c/", "/gift/", "/w/"];

/** Derive the stored path and public slug from a hash path. */
export function parseSiteEventPath(hashPath: string): { path: string; slug: string | null } {
  const path = (hashPath.split("?")[0].split("#")[0] || "/").slice(0, 200);
  for (const prefix of SLUG_PREFIXES) {
    if (path.startsWith(prefix)) {
      const slug = path.slice(prefix.length).split("/")[0];
      if (/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return { path, slug };
      return { path, slug: null };
    }
  }
  return { path, slug: null };
}

/** Authed/dashboard paths carry church ids, so they are never logged. */
export function isLoggablePath(path: string): boolean {
  return !(
    path.startsWith("/app") ||
    path.startsWith("/church/") ||
    path.startsWith("/billing")
  );
}
