import QRCode from "qrcode";

export interface ChurchQrOptions {
  /** Bake the "tendpray.com" attribution caption under the code. Default true.
   *  Paid tiers can pass false for a clean, unbranded download. */
  branded?: boolean;
}

const CAPTION = "tendpray.com";

/**
 * Generate a church prayer-page QR code as a PNG data URL.
 * Generated locally; no third-party QR service receives church URLs.
 * When branded, the caption is baked into the image under the code so the
 * attribution survives wherever the PNG travels (bulletins, slides).
 */
export async function generateChurchQr(publicUrl: string, opts: ChurchQrOptions = {}): Promise<string> {
  const qrUrl = await QRCode.toDataURL(publicUrl, {
    width: 1024,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  if (opts.branded === false) return qrUrl;
  return addCaption(qrUrl, CAPTION);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("qr image load failed"));
    img.src = src;
  });
}

async function addCaption(qrUrl: string, caption: string): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrUrl; // canvas unavailable: fall back to the bare code
  const img = await loadImage(qrUrl);
  try {
    await document.fonts.load('500 44px "Instrument Sans"');
  } catch {
    /* fall back to system fonts below */
  }
  const stripH = 120;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight + stripH;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = "#6F665B"; // muted warm gray: present, not loud
  ctx.font = '500 44px "Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, canvas.width / 2, img.naturalHeight + stripH / 2);
  return canvas.toDataURL("image/png");
}
