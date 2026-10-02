import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

// One place every image enters the system (scraped covers, fandom card pictures, future uploads):
// download → resize → re-encode as WebP → store by content hash → serve from /api/images/<hash>.webp.
// Re-encoding also strips EXIF and turns SVG/HTML-ish payloads into plain pixels.

export type ImageKind = 'cover' | 'avatar';

// Max box per kind; images are only ever shrunk, never enlarged.
const PRESETS: Record<ImageKind, { width: number; height: number; quality: number }> = {
  cover: { width: 600, height: 900, quality: 80 },
  avatar: { width: 320, height: 320, quality: 80 },
};

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export const IMAGE_URL_PREFIX = '/api/images/';
export const IMAGE_FILE_RE = /^[a-f0-9]{64}\.webp$/;

export function imageDir(): string {
  return process.env.IMAGE_STORAGE_DIR || path.join(process.cwd(), 'storage', 'images');
}

export function isStoredImageUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith(IMAGE_URL_PREFIX) && IMAGE_FILE_RE.test(url.slice(IMAGE_URL_PREFIX.length)));
}

async function download(url: string, referer?: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) image URLs are allowed');

  const res = await fetch(u, {
    // Many novel sites block hotlinking unless the request looks like it came from their pages.
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*', ...(referer ? { Referer: referer } : {}) },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Image download failed: HTTP ${res.status}`);
  if (Number(res.headers.get('content-length') || 0) > MAX_DOWNLOAD_BYTES) throw new Error('Image is too large');
  if (!res.body) throw new Error('Image response has no body');

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_DOWNLOAD_BYTES) throw new Error('Image is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Compresses image bytes to WebP and stores them; returns the public URL. Throws if not an image. */
export async function storeImageBuffer(input: Buffer, kind: ImageKind): Promise<string> {
  const { width, height, quality } = PRESETS[kind];
  const webp = await sharp(input, { animated: false, limitInputPixels: 50_000_000 })
    .rotate() // honour EXIF orientation before metadata is dropped
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();

  const file = `${crypto.createHash('sha256').update(webp).digest('hex')}.webp`;
  const dir = imageDir();
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, file);
  // ponytail: content-addressed, so identical images share one file. Replaced images leave
  // orphans behind; add a sweep (files not referenced by Novel/FandomGlossary) if disk matters.
  await fs.access(dest).catch(() => fs.writeFile(dest, webp));
  return IMAGE_URL_PREFIX + file;
}

/** Downloads a remote image and stores a compressed copy. Already-stored URLs pass through. */
export async function storeImageFromUrl(url: string, kind: ImageKind, referer?: string): Promise<string> {
  if (isStoredImageUrl(url)) return url;
  return storeImageBuffer(await download(url, referer), kind);
}

/**
 * Best-effort variant for background flows (scraping): never throws, falls back to the original
 * URL so an import never fails over a cover picture.
 */
export async function tryStoreImageFromUrl(
  url: string | null | undefined,
  kind: ImageKind,
  referer?: string
): Promise<string | null> {
  if (!url) return null;
  try {
    return await storeImageFromUrl(url, kind, referer);
  } catch (err: any) {
    console.warn(`[imageStore] Keeping remote ${kind} ${url}: ${err.message || err}`);
    return url;
  }
}
