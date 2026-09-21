const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function calculateSourceHash(contentEn) {
  if (!contentEn) return null;
  try {
    let paragraphs = [];
    if (contentEn.startsWith('[')) {
      paragraphs = JSON.parse(contentEn);
    } else {
      paragraphs = contentEn.split('\n');
    }
    const normalized = paragraphs
      .map(p => (typeof p === 'string' ? p.trim() : ''))
      .filter(p => p.length > 0)
      .join('\n');
    if (!normalized) return null;
    return crypto.createHash('sha256').update(normalized).digest('hex');
  } catch {
    return crypto.createHash('sha256').update(contentEn.trim()).digest('hex');
  }
}

async function main() {
  console.log('Starting chapter data backfill migration...');
  const chapters = await prisma.chapter.findMany();
  console.log(`Found ${chapters.length} chapters to inspect.`);

  let updatedCount = 0;
  for (const chap of chapters) {
    const isPolished = !!chap.polishedAt;
    const status = isPolished ? 'POLISHED' : (chap.contentTh ? 'TRANSLATED_GT' : 'TOC_ONLY');
    const contentThGoogle = chap.contentThGoogle || chap.contentTh || null;
    const contentThPolished = chap.contentThPolished || (isPolished ? chap.contentTh : null);
    const sourceHash = chap.sourceHash || calculateSourceHash(chap.contentEn);

    await prisma.chapter.update({
      where: { id: chap.id },
      data: {
        status,
        contentThGoogle,
        contentThPolished,
        sourceHash,
        errorCode: chap.errorCode || 'NONE',
        translationVersion: chap.translationVersion || 1,
      },
    });
    updatedCount++;
  }

  console.log(`Successfully backfilled ${updatedCount} chapters.`);
}

main()
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
