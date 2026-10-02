import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { imageDir, isStoredImageUrl, storeImageFromUrl } from '../lib/imageStore';

// Run: npx tsx scripts/compress-existing-images.ts
// One-off backfill: swaps remote novel covers / fandom card images for stored, compressed copies.
// Rows whose image can't be downloaded keep their remote URL. Writes the old→new mapping next to
// the images (image-backfill-<timestamp>.json) so the original links are not lost.
async function main() {
  const log: Array<{ table: string; id: string; from: string; to: string | null; error?: string }> = [];

  const novels = await prisma.novel.findMany({
    where: { coverUrl: { startsWith: 'http' } },
    select: { id: true, titleEn: true, coverUrl: true, sourceUrl: true },
  });
  for (const n of novels) {
    try {
      const to = await storeImageFromUrl(n.coverUrl!, 'cover', n.sourceUrl);
      await prisma.novel.update({ where: { id: n.id }, data: { coverUrl: to } });
      log.push({ table: 'Novel', id: n.id, from: n.coverUrl!, to });
      console.log(`✅ ${n.titleEn}`);
    } catch (err: any) {
      log.push({ table: 'Novel', id: n.id, from: n.coverUrl!, to: null, error: err.message });
      console.warn(`⚠️  ${n.titleEn}: ${err.message} (kept remote)`);
    }
  }

  const terms = await prisma.fandomGlossary.findMany({
    where: { imageUrl: { startsWith: 'http' } },
    select: { id: true, canonicalEn: true, imageUrl: true },
  });
  for (const t of terms) {
    try {
      const to = await storeImageFromUrl(t.imageUrl!, 'avatar');
      await prisma.fandomGlossary.update({ where: { id: t.id }, data: { imageUrl: to } });
      log.push({ table: 'FandomGlossary', id: t.id, from: t.imageUrl!, to });
      console.log(`✅ ${t.canonicalEn}`);
    } catch (err: any) {
      log.push({ table: 'FandomGlossary', id: t.id, from: t.imageUrl!, to: null, error: err.message });
      console.warn(`⚠️  ${t.canonicalEn}: ${err.message} (kept remote)`);
    }
  }

  if (log.length > 0) {
    const file = path.join(imageDir(), `image-backfill-${Date.now()}.json`);
    await fs.mkdir(imageDir(), { recursive: true });
    await fs.writeFile(file, JSON.stringify(log, null, 2));
    console.log(`Mapping saved to ${file}`);
  }
  const done = log.filter((l) => l.to && isStoredImageUrl(l.to)).length;
  console.log(`Done: ${done}/${log.length} images compressed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
