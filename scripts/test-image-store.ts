import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

// Run: npx tsx scripts/test-image-store.ts
// Verifies images are shrunk to their preset box, re-encoded as WebP, deduplicated by content,
// and that non-images are rejected. Uses a temp dir, touches no real storage.
async function main() {
  process.env.IMAGE_STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'tnovel-img-'));
  const { storeImageBuffer, isStoredImageUrl, imageDir, tryStoreImageFromUrl } = await import('../lib/imageStore');

  try {
    // 2000x3000 PNG (~400 KB), big enough that resize + WebP must shrink it a lot.
    const raw = Buffer.alloc(2000 * 3000 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    const png = await sharp(raw, { raw: { width: 2000, height: 3000, channels: 3 } }).png().toBuffer();

    const url = await storeImageBuffer(png, 'cover');
    assert(isStoredImageUrl(url), `unexpected url ${url}`);
    const file = path.join(imageDir(), url.split('/').pop()!);
    const meta = await sharp(await fs.readFile(file)).metadata();
    assert.equal(meta.format, 'webp');
    assert(meta.width! <= 600 && meta.height! <= 900, `not resized: ${meta.width}x${meta.height}`);
    const stored = (await fs.stat(file)).size;
    assert(stored < png.length / 4, `not compressed: ${stored} vs ${png.length}`);

    // Small images are never enlarged.
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#f80' } }).png().toBuffer();
    const tinyFile = path.join(imageDir(), (await storeImageBuffer(tiny, 'avatar')).split('/').pop()!);
    const tinyMeta = await sharp(await fs.readFile(tinyFile)).metadata();
    assert.equal(tinyMeta.width, 50);

    // Same bytes → same file.
    assert.equal(await storeImageBuffer(png, 'cover'), url);

    // Not an image → throws; best-effort variant falls back instead of throwing.
    await assert.rejects(storeImageBuffer(Buffer.from('<svg onload=alert(1)'), 'avatar'));
    assert.equal(await tryStoreImageFromUrl('ftp://example.com/a.png', 'cover'), 'ftp://example.com/a.png');
    assert.equal(await tryStoreImageFromUrl(url, 'cover'), url); // already stored passes through

    assert(!isStoredImageUrl('/api/images/../../etc/passwd'));
    console.log(`✅ image store ok — ${png.length} B PNG → ${stored} B WebP (${meta.width}x${meta.height})`);
  } finally {
    await fs.rm(process.env.IMAGE_STORAGE_DIR!, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
