import assert from 'node:assert';
import { prisma } from '../lib/prisma';
import { applyGlossaryToNovelChapters } from '../lib/glossaryService';

async function main() {
  console.log('🧪 Starting Glossary Edit & Chapter Replace Tests...\n');

  const tag = `test-${Date.now()}`;
  const novel = await prisma.novel.create({
    data: {
      titleEn: `Novel ${tag}`,
      titleTh: `นิยาย ${tag}`,
      sourceUrl: `test:${tag}`,
    },
  });

  const chapter = await prisma.chapter.create({
    data: {
      novelId: novel.id,
      chapterNumber: 1,
      titleEn: 'Chapter 1: The Meeting with Keith',
      titleTh: 'ตอนที่ 1: การพบกับ Keith',
      originalUrl: `test:${tag}/1`,
      contentEn: JSON.stringify(['When Keith arrived at the gate.', 'He met Arthur.']),
      contentTh: JSON.stringify(['เมื่อ Keith มาถึงประตูเมือง', 'คีธได้พบกับ Arthur']),
      contentThGoogle: JSON.stringify(['เมื่อ Keith มาถึงประตูเมือง', 'คีธได้พบกับ Arthur']),
      status: 'TRANSLATED_GT',
    },
  });

  try {
    // 1. Create novel glossary terms
    await prisma.novelGlossary.createMany({
      data: [
        {
          novelId: novel.id,
          canonicalEn: 'Keith',
          canonicalTh: 'คีธ',
          isLocked: true,
        },
        {
          novelId: novel.id,
          canonicalEn: 'Arthur',
          canonicalTh: 'อาร์เธอร์',
          isLocked: true,
        },
      ],
    });

    // 2. Test initial apply: Keith and Arthur (English left behind in Thai text) should become Thai
    console.log('Test 1: Replacing English names left in Thai text with glossary terms...');
    const result1 = await applyGlossaryToNovelChapters({ novelId: novel.id });
    assert.strictEqual(result1.updatedChapters, 1, 'Expected 1 chapter to be updated');
    assert.ok(result1.totalReplacements >= 3, `Expected at least 3 replacements, got ${result1.totalReplacements}`);

    const updatedChapter1 = await prisma.chapter.findUnique({ where: { id: chapter.id } });
    assert.ok(updatedChapter1, 'Chapter must exist');
    assert.strictEqual(updatedChapter1.titleTh, 'ตอนที่ 1: การพบกับ คีธ');

    const paras1: string[] = JSON.parse(updatedChapter1.contentTh || '[]');
    assert.strictEqual(paras1[0], 'เมื่อ คีธ มาถึงประตูเมือง');
    assert.strictEqual(paras1[1], 'คีธได้พบกับ อาร์เธอร์');
    console.log('✅ Test 1 Passed: English names successfully replaced with glossary terms.');

    // 3. Test term edit: user edits "Keith" from "คีธ" -> "เคธ"
    console.log('\nTest 2: Editing glossary term from "คีธ" to "เคธ" with custom replacement...');
    const result2 = await applyGlossaryToNovelChapters({
      novelId: novel.id,
      customReplacements: [{ from: 'คีธ', to: 'เคธ' }],
    });

    assert.strictEqual(result2.updatedChapters, 1, 'Expected 1 chapter to be updated');
    const updatedChapter2 = await prisma.chapter.findUnique({ where: { id: chapter.id } });
    assert.ok(updatedChapter2, 'Chapter must exist');
    assert.strictEqual(updatedChapter2.titleTh, 'ตอนที่ 1: การพบกับ เคธ');

    const paras2: string[] = JSON.parse(updatedChapter2.contentTh || '[]');
    assert.strictEqual(paras2[0], 'เมื่อ เคธ มาถึงประตูเมือง');
    assert.strictEqual(paras2[1], 'เคธได้พบกับ อาร์เธอร์');
    console.log('✅ Test 2 Passed: Old Thai spelling "คีธ" cleanly replaced with new spelling "เคธ".');

    console.log('\n🎉 ALL GLOSSARY APPLY & EDIT TESTS PASSED (100% SUCCESS)!');
  } finally {
    // Cleanup
    await prisma.novelGlossary.deleteMany({ where: { novelId: novel.id } });
    await prisma.chapter.deleteMany({ where: { novelId: novel.id } });
    await prisma.novel.delete({ where: { id: novel.id } });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
