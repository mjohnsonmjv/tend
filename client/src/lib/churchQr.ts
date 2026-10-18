import QRCode from "qrcode";

export interface ChurchQrOptions {
  /**
   * Logo drawn in the center of the code.
   * - undefined (default): the Tend mark, for free tiers.
   * - a data URL or same-origin URL: the church's own logo, for paid tiers.
   * - null: a clean code with no center logo.
   */
  centerLogo?: string | null;
}

/**
 * The Tend mark as a standalone SVG data URL, for the center of free-tier
 * QR codes. Charcoal on transparent; the compositor puts it on a white
 * rounded backdrop so it reads on any surface. Width/height attributes are
 * set so canvas can measure it (SVG without intrinsic size reports 0).
 */
const TEND_MARK_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 40 40" fill="none">` +
  `<path d="M31 9A15 15 0 1 0 31 31" stroke="#2A2521" stroke-width="4.5" stroke-linecap="round"/>` +
  `<circle cx="20" cy="15" r="3.3" fill="#2A2521"/>` +
  `<path d="M20 23v5m-6-7 6 2 6-2" stroke="#2A2521" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` +
  `</svg>`;

export function tendMarkDataUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(TEND_MARK_SVG)}`;
}

/**
 * Convert a data URL to a Blob without fetch(), so Content-Security-Policy
 * connect-src never comes into play. Pure function: unit tested.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  const mime = header.match(/data:([^;,]+)/)?.[1] || "application/octet-stream";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Pure geometry for the center-logo backdrop: easy to unit test. */
export function logoBox(qrSize: number): { x: number; y: number; size: number; radius: number; pad: number } {
  const size = Math.round(qrSize * 0.26);
  return {
    x: (qrSize - size) / 2,
    y: (qrSize - size) / 2,
    size,
    radius: Math.round(size * 0.22),
    pad: Math.round(size * 0.14),
  };
}

/**
 * Generate a church prayer-page QR code as a PNG data URL.
 * Generated locally; no third-party QR service receives church URLs.
 * High error correction ("H", ~30% damage tolerance) so a center logo
 * never breaks scanning.
 */
export async function generateChurchQr(publicUrl: string, opts: ChurchQrOptions = {}): Promise<string> {
  const qrUrl = await QRCode.toDataURL(publicUrl, {
    width: 1024,
    margin: 4,
    errorCorrectionLevel: "H",
  });
  const logo = opts.centerLogo === undefined ? tendMarkDataUrl() : opts.centerLogo;
  if (!logo) return qrUrl;
  return addCenterLogo(qrUrl, logo);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("qr image load failed"));
    img.src = src;
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // Fallback for older browsers: plain rect.
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

async function addCenterLogo(qrUrl: string, logoSrc: string): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrUrl; // canvas unavailable: fall back to the bare code
  const [qrImg, logoImg] = await Promise.all([loadImage(qrUrl), loadImage(logoSrc)]);
  const S = qrImg.naturalWidth;
  canvas.width = S;
  canvas.height = S;
  ctx.drawImage(qrImg, 0, 0);

  const box = logoBox(S);
  ctx.fillStyle = "#FFFFFF";
  roundRectPath(ctx, box.x, box.y, box.size, box.size, box.radius);
  ctx.fill();

  // Fit the logo inside the backdrop with padding. SVG data URLs without
  // intrinsic size report 0, so fall back to the max box in that case.
  const maxW = box.size - box.pad * 2;
  const maxH = box.size - box.pad * 2;
  const lw = logoImg.naturalWidth || maxW;
  const lh = logoImg.naturalHeight || maxH;
  const scale = Math.min(maxW / lw, maxH / lh, 1);
  const w = Math.round(lw * scale);
  const h = Math.round(lh * scale);
  ctx.drawImage(logoImg, Math.round(box.x + (box.size - w) / 2), Math.round(box.y + (box.size - h) / 2), w, h);
  return canvas.toDataURL("image/png");
}
