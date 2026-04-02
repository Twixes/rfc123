import { extname } from "node:path";

/**
 * Prefer sniffing file contents; fall back to extension only when unknown.
 * Extension alone is unreliable (wrong extension, no extension, double extensions).
 */

function mimeFromMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // BMP
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return "image/bmp";
  }

  // ICO / CUR: ICONDIR
  if (
    buffer.length >= 4 &&
    buffer[0] === 0 &&
    buffer[1] === 0 &&
    (buffer[2] === 1 || buffer[2] === 2) &&
    buffer[3] === 0
  ) {
    return "image/x-icon";
  }

  // AVIF: ISO BMFF ftyp ... avif / mif1+miaf
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "mif1" || brand === "msf1") {
      return "image/avif";
    }
  }

  return null;
}

function mimeFromSvgText(buffer: Buffer): string | null {
  const n = Math.min(512, buffer.length);
  const head = buffer.subarray(0, n).toString("utf8").trimStart();
  if (head.startsWith("<svg")) {
    return "image/svg+xml";
  }
  if (/^<\?xml/i.test(head) && buffer.includes("<svg")) {
    return "image/svg+xml";
  }
  return null;
}

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".apng": "image/apng",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".pjpeg": "image/jpeg",
  ".pjp": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".svgz": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function mimeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export function contentTypeForAsset(buffer: Buffer, filePath: string): string {
  return (
    mimeFromMagicBytes(buffer) ??
    mimeFromSvgText(buffer) ??
    mimeFromPath(filePath)
  );
}
