/**
 * GET /api/detect-logo?url=<church website>
 *
 * Finds a church's logo from its website and returns it as a data URL the
 * client can composite into the center of a QR code (data URLs never taint
 * a canvas, so the PNG download keeps working).
 *
 * Deployed as a Vercel serverless function. SSRF-guarded: http(s) only, no
 * private/loopback IPs (DNS is re-resolved on every redirect hop), tight
 * timeouts and byte caps.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

interface VercelReq {
  query: Record<string, string | string[] | undefined>;
}
interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_IMG_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const MIN_LOGO_PX = 48;

export interface LogoCandidate {
  url: string;
  score: number;
}

export interface DetectedLogo {
  ok: true;
  logoUrl: string;
  width: number;
  height: number;
  type: string;
  dataUrl: string;
}

/* ---------------- URL safety ---------------- */

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254)
  );
}

function isPrivateIPv6(ip: string): boolean {
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  // ipv4-mapped: check the embedded v4 part
  const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    low.startsWith("fe80:") ||
    low.startsWith("fec0:") ||
    low.startsWith("fc") ||
    low.startsWith("fd")
  );
}

/** Throws unless the URL is a public http(s) destination. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  // URL.hostname keeps brackets on IPv6 literals ("[::1]"); strip them for isIP.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const version = isIP(host);
  const addresses: string[] = [];
  if (version === 4) addresses.push(host);
  else if (version === 6) addresses.push(host);
  else {
    if (host === "localhost") throw new Error("That URL is not reachable publicly.");
    const records = await lookup(host, { all: true });
    for (const r of records) addresses.push(r.address);
  }
  if (addresses.length === 0) throw new Error("Could not resolve that website.");
  for (const addr of addresses) {
    const v = isIP(addr);
    if ((v === 4 && isPrivateIPv4(addr)) || (v === 6 && isPrivateIPv6(addr))) {
      throw new Error("That URL is not reachable publicly.");
    }
  }
  return url;
}

/** Normalize a pasted website value: add https:// when the scheme is missing. */
export function normalizeWebsite(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter your church website address.");
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/* ---------------- guarded fetch ---------------- */

async function readCapped(res: Response, cap: number): Promise<Buffer> {
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > cap) throw new Error("Response too large.");
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      reader.cancel().catch(() => undefined);
      throw new Error("Response too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Fetch with manual redirect handling so every hop is SSRF-checked. */
async function fetchPublic(rawUrl: string, cap: number): Promise<{ url: URL; res: Response; buf: Buffer }> {
  let url = await assertPublicUrl(rawUrl);
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
      headers: { "user-agent": "TendLogoBot/1.0 (+https://tendpray.com)" },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.arrayBuffer().catch(() => undefined);
      url = await assertPublicUrl(new URL(loc, url).toString());
      continue;
    }
    const buf = await readCapped(res, cap);
    return { url, res, buf };
  }
  throw new Error("Too many redirects.");
}

/* ---------------- logo candidate extraction ---------------- */

export function extractLogoCandidates(html: string, base: URL): LogoCandidate[] {
  const out: LogoCandidate[] = [];
  const push = (raw: string | null | undefined, score: number) => {
    if (!raw) return;
    const u = raw.trim();
    if (!u || u.startsWith("data:") || u.startsWith("blob:")) return;
    try {
      const abs = new URL(u, base);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      out.push({ url: abs.toString(), score });
    } catch {
      /* ignore unparseable hrefs */
    }
  };

  // <link rel="icon" / "apple-touch-icon">, bigger sizes win
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    const rel = (tag.match(/\brel\s*=\s*["']([^"']*)["']/i)?.[1] || "").toLowerCase();
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || !/\bicon\b/.test(rel)) continue;
    const sizes = tag.match(/\bsizes\s*=\s*["'](\d+)\s*x\s*(\d+)/i);
    const area = sizes ? Number(sizes[1]) * Number(sizes[2]) : 0;
    const bonus = Math.min(area / 1000, 60);
    push(href, rel.includes("apple-touch-icon") ? 100 + bonus : 88 + bonus);
  }

  // JSON-LD "logo"
  const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html))) {
    try {
      const parsed: unknown = JSON.parse(m[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const logo = (item as { logo?: unknown } | null)?.logo;
        if (typeof logo === "string") push(logo, 80);
        else if (logo && typeof logo === "object" && typeof (logo as { url?: unknown }).url === "string") {
          push((logo as { url: string }).url, 80);
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  // <img> with logo-ish markers
  const imgRe = /<img\b[^>]*>/gi;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const cls = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const id = tag.match(/\bid\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    if (!/logo/i.test(`${alt} ${cls} ${id} ${src}`)) continue;
    const w = Number(tag.match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1] || 0);
    const h = Number(tag.match(/\bheight\s*=\s*["']?(\d+)/i)?.[1] || 0);
    if ((w && w < 24) || (h && h < 24)) continue; // tracking pixels need not apply
    push(src, 70);
  }

  // og:image, last resort (often a banner, not a logo)
  const ogTag = html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i)?.[0];
  push(ogTag?.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1], 45);

  // Dedupe by URL, keep the best score, sort high to low.
  const best = new Map<string, number>();
  for (const c of out) best.set(c.url, Math.max(best.get(c.url) || 0, c.score));
  return [...best.entries()]
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score);
}

/* ---------------- image dimension sniffing ---------------- */

export interface SniffedImage {
  width: number;
  height: number;
  type: string;
}

export function sniffDimensions(buf: Buffer): SniffedImage | null {
  if (buf.length < 12) return null;
  // PNG: width/height at bytes 16..23 (IHDR)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf.length >= 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  // JPEG: scan segments for a Start Of Frame marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), type: "jpeg" };
      }
      i += 2 + len;
    }
    return null;
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf.length >= 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: "gif" };
  }
  // SVG (text): width/height attrs or viewBox; vector so any size works
  const head = buf.toString("utf8", 0, Math.min(buf.length, 4000));
  if (/<svg[\s>]/.test(head)) {
    const w = Number(head.match(/(?:^|[\s;])width\s*=\s*["']?(\d+(?:\.\d+)?)/i)?.[1] || 0);
    const h = Number(head.match(/(?:^|[\s;])height\s*=\s*["']?(\d+(?:\.\d+)?)/i)?.[1] || 0);
    if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h), type: "svg" };
    const vb = head.match(/viewBox\s*=\s*["']\s*-?[\d.]+\s+-?[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    if (vb) return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])), type: "svg" };
    return { width: 0, height: 0, type: "svg" };
  }
  return null;
}

function mimeFor(type: string, contentType: string | null): string {
  if (contentType && contentType.startsWith("image/")) return contentType.split(";")[0].trim();
  const map: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };
  return map[type] || "application/octet-stream";
}

/* ---------------- handler ---------------- */

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  res.setHeader("cache-control", "no-store");
  const rawParam = req.query.url;
  const raw = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  if (!raw || !raw.trim()) {
    res.status(400).json({ ok: false, error: "Missing url parameter." });
    return;
  }

  try {
    const page = await fetchPublic(normalizeWebsite(raw), MAX_HTML_BYTES);
    const html = page.buf.toString("utf8");
    const candidates = extractLogoCandidates(html, page.url).slice(0, 5);
    if (candidates.length === 0) {
      res.status(422).json({ ok: false, error: "Could not find a logo on that website." });
      return;
    }

    const tried: string[] = [];
    for (const c of candidates) {
      try {
        const img = await fetchPublic(c.url, MAX_IMG_BYTES);
        const sniffed = sniffDimensions(img.buf);
        const mime = sniffed ? mimeFor(sniffed.type, img.res.headers.get("content-type")) : img.res.headers.get("content-type")?.split(";")[0].trim() || "";
        if (!mime.startsWith("image/")) continue;
        const w = sniffed?.width || 0;
        const h = sniffed?.height || 0;
        const scalable = sniffed?.type === "svg";
        if (!scalable && (w < MIN_LOGO_PX || h < MIN_LOGO_PX)) continue;
        const found: DetectedLogo = {
          ok: true,
          logoUrl: c.url,
          width: w,
          height: h,
          type: sniffed?.type || "unknown",
          dataUrl: `data:${mime};base64,${img.buf.toString("base64")}`,
        };
        res.status(200).json(found);
        return;
      } catch {
        tried.push(c.url);
      }
    }
    res.status(422).json({ ok: false, error: "Found logo candidates but none could be downloaded." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read that website.";
    const status = /not reachable publicly|Only http|valid URL|Enter your/i.test(message) ? 400 : 422;
    res.status(status).json({ ok: false, error: message });
  }
}
