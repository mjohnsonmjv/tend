import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWebsite,
  assertPublicUrl,
  extractLogoCandidates,
  sniffDimensions,
} from "../api/detect-logo";
import { logoBox, tendMarkDataUrl } from "../client/src/lib/churchQr";

/* ---------- normalizeWebsite ---------- */

test("normalizeWebsite adds https when the scheme is missing", () => {
  assert.equal(normalizeWebsite("frontierchurch.org"), "https://frontierchurch.org");
  assert.equal(normalizeWebsite("  http://example.com/ "), "http://example.com/");
});

test("normalizeWebsite rejects empty input", () => {
  assert.throws(() => normalizeWebsite("   "), /Enter your church website/);
});

/* ---------- assertPublicUrl: SSRF guards, no network needed for literals ---------- */

test("assertPublicUrl rejects non-http schemes", async () => {
  await assert.rejects(() => assertPublicUrl("javascript:alert(1)"), /Only http/);
  await assert.rejects(() => assertPublicUrl("ftp://example.com/x.png"), /Only http/);
});

test("assertPublicUrl rejects private IPv4 literals", async () => {
  await assert.rejects(() => assertPublicUrl("http://10.0.0.5/logo.png"), /not reachable publicly/);
  await assert.rejects(() => assertPublicUrl("http://192.168.1.10/"), /not reachable publicly/);
  await assert.rejects(() => assertPublicUrl("http://127.0.0.1:3000/"), /not reachable publicly/);
  await assert.rejects(() => assertPublicUrl("http://169.254.169.254/latest"), /not reachable publicly/);
});

test("assertPublicUrl rejects localhost and private IPv6", async () => {
  await assert.rejects(() => assertPublicUrl("http://localhost/logo.png"), /not reachable publicly/);
  await assert.rejects(() => assertPublicUrl("http://[::1]/logo.png"), /not reachable publicly/);
  await assert.rejects(() => assertPublicUrl("http://[fe80::1]/"), /not reachable publicly/);
});

/* ---------- extractLogoCandidates ---------- */

const BASE = new URL("https://examplechurch.org/about");

test("apple-touch-icon outranks og:image, relative URLs resolve", () => {
  const html = `
    <html><head>
      <meta property="og:image" content="https://cdn.example.org/banner.jpg">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
    </head></html>`;
  const c = extractLogoCandidates(html, BASE);
  assert.ok(c.length >= 3);
  assert.equal(c[0].url, "https://examplechurch.org/apple-touch-icon.png");
  assert.ok(c[0].score > c[1].score);
});

test("larger icon sizes score higher", () => {
  const html = `
    <link rel="icon" sizes="16x16" href="/s16.png">
    <link rel="icon" sizes="192x192" href="/s192.png">`;
  const c = extractLogoCandidates(html, BASE);
  assert.equal(c[0].url, "https://examplechurch.org/s192.png");
});

test("JSON-LD logo and logo-ish img tags are picked up", () => {
  const html = `
    <script type="application/ld+json">{"@type":"Church","logo":"https://examplechurch.org/logo.png"}</script>
    <img class="site-logo" src="/assets/logo.svg" alt="Example Church logo">`;
  const c = extractLogoCandidates(html, BASE);
  const urls = c.map((x) => x.url);
  assert.ok(urls.includes("https://examplechurch.org/logo.png"));
  assert.ok(urls.includes("https://examplechurch.org/assets/logo.svg"));
});

test("data: URLs and tiny tracking pixels are skipped", () => {
  const html = `
    <link rel="icon" href="data:image/png;base64,AAAA">
    <img src="/pixel.gif" width="1" height="1" class="logo-pixel" alt="logo">`;
  const c = extractLogoCandidates(html, BASE);
  assert.equal(c.length, 0);
});

test("duplicate logo URLs keep the best score", () => {
  const html = `
    <meta property="og:image" content="/logo.png">
    <link rel="apple-touch-icon" href="/logo.png">`;
  const c = extractLogoCandidates(html, BASE);
  assert.equal(c.filter((x) => x.url === "https://examplechurch.org/logo.png").length, 1);
  assert.ok(c[0].score >= 100);
});

/* ---------- sniffDimensions ---------- */

function pngBuffer(w: number, h: number): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  return buf;
}

test("sniffDimensions reads PNG size", () => {
  const d = sniffDimensions(pngBuffer(180, 180));
  assert.deepEqual(d, { width: 180, height: 180, type: "png" });
});

test("sniffDimensions reads JPEG SOF size", () => {
  // SOI + SOF0 segment: FF D8, FF C0 len=11, precision=8, h=100, w=200
  const buf = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x01, 0x01, 0x11, 0x00,
  ]);
  const d = sniffDimensions(buf);
  assert.deepEqual(d, { width: 200, height: 100, type: "jpeg" });
});

test("sniffDimensions reads SVG viewBox", () => {
  const buf = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"><rect/></svg>`);
  const d = sniffDimensions(buf);
  assert.deepEqual(d, { width: 300, height: 120, type: "svg" });
});

test("sniffDimensions returns null for unknown bytes", () => {
  assert.equal(sniffDimensions(Buffer.from("hello world, this is text")), null);
});

/* ---------- churchQr helpers ---------- */

test("logoBox centers a ~26% backdrop", () => {
  const b = logoBox(1024);
  assert.equal(b.size, 266); // Math.round(1024 * 0.26)
  assert.equal(b.x, (1024 - 266) / 2);
  assert.equal(b.y, (1024 - 266) / 2);
  assert.ok(b.radius > 0 && b.pad > 0);
});

test("tendMarkDataUrl is a parseable SVG data URL", () => {
  const url = tendMarkDataUrl();
  assert.ok(url.startsWith("data:image/svg+xml,"));
  const svg = decodeURIComponent(url.slice("data:image/svg+xml,".length));
  assert.ok(svg.includes('width="160"') && svg.includes("<svg"));
});
