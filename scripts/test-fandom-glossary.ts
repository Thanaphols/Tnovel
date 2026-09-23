import assert from 'node:assert';
import { prisma } from '../lib/prisma';
import { getRelevantGlossary, loadGlossary, promoteNovelTerms } from '../lib/glossaryService';
import { protectTerms } from '../lib/nameReplacer';

// Run: npx tsx scripts/test-fandom-glossary.ts
// Verifies fandom/novel glossary merge precedence, word-boundary relevance, promote (move),
// and that pre-Google placeholders round-trip. Creates and deletes its own rows.
async function main() {
  const tag = `test-${Date.now()}`;
  const fandom = await prisma.fandom.create({ data: { name: `Fandom ${tag}` } });
  const novel = await prisma.novel.create({
    data: { titleEn: `Novel ${tag}`, titleTh: `นิยาย ${tag}`, sourceUrl: `test:${tag}`, fandomId: fandom.id },
  });

  try {
    await prisma.fandomGlossary.createMany({
      data: [
        { fandomId: fandom.id, canonicalEn: 'Naruto', canonicalTh: 'นารูโตะ' },
        { fandomId: fandom.id, canonicalEn: 'Sasuke', canonicalTh: 'ซาสึเกะ' },
        { fandomId: fandom.id, canonicalEn: 'Lee', canonicalTh: 'ลี' },
      ],
    });
    await prisma.novelGlossary.createMany({
      data: [
        // unlocked auto-discovered junk must NOT beat the fandom term
        { novelId: novel.id, canonicalEn: 'Naruto', canonicalTh: 'นารุโตะผิด', isLocked: false },
        // locked novel override MUST beat the fandom term
        { novelId: novel.id, canonicalEn: 'Sasuke', canonicalTh: 'ซาสุเกะ(ฟิคนี้)', isLocked: true },
        { novelId: novel.id, canonicalEn: 'Kurama', canonicalTh: 'คุรามะ', isLocked: true },
      ],
    });

    // 1. Merge precedence: novel locked > fandom > novel unlocked
    const all = await loadGlossary(novel.id);
    const th = (en: string) => all.find((t) => t.canonicalEn === en)?.canonicalTh;
    assert.strictEqual(th('Naruto'), 'นารูโตะ', 'fandom beats unlocked novel term');
    assert.strictEqual(th('Sasuke'), 'ซาสุเกะ(ฟิคนี้)', 'locked novel term beats fandom');
    assert.strictEqual(th('Kurama'), 'คุรามะ', 'novel-only term kept');
    assert.strictEqual(all.length, 4, 'merged by key, no duplicates');

    // 2. Relevance is word-boundary: "Lee" must not match "sleep"
    const relevant = await getRelevantGlossary(novel.id, ['Naruto could not sleep.'], 30);
    assert.deepStrictEqual(relevant.map((t) => t.canonicalEn), ['Naruto'], 'only terms really in the text');

    // 3. Fandom-only source (model-test page)
    const fandomOnly = await getRelevantGlossary({ fandomId: fandom.id }, ['Sasuke met Lee.'], 30);
    assert.deepStrictEqual(fandomOnly.map((t) => t.canonicalTh).sort(), ['ซาสึเกะ', 'ลี'].sort());

    // 4. Placeholders round-trip; original English untouched
    const en = ['Naruto hit Sasuke. Naruto laughed.'];
    const { protectedText, restore } = protectTerms(en, relevant.concat(all.filter((t) => t.canonicalEn === 'Sasuke')));
    assert.ok(!/Naruto|Sasuke/.test(protectedText[0]), `terms hidden from Google: ${protectedText[0]}`);
    assert.strictEqual(en[0], 'Naruto hit Sasuke. Naruto laughed.', 'input not mutated');
    const back = restore(protectedText.map((s) => s.replace('hit', 'ตี')));
    assert.strictEqual(back[0], 'นารูโตะ ตี ซาสุเกะ(ฟิคนี้). นารูโตะ laughed.');

    // 5. Promote = move: lands in fandom (overwriting), gone from novel, foreign ids ignored
    const kurama = await prisma.novelGlossary.findFirstOrThrow({ where: { novelId: novel.id, canonicalEn: 'Kurama' } });
    const moved = await promoteNovelTerms(novel.id, fandom.id, [kurama.id, 'not-a-real-id']);
    assert.strictEqual(moved.length, 1);
    assert.ok(await prisma.fandomGlossary.findUnique({ where: { fandomId_canonicalEn: { fandomId: fandom.id, canonicalEn: 'Kurama' } } }));
    assert.strictEqual(await prisma.novelGlossary.count({ where: { id: kurama.id } }), 0, 'novel copy deleted');

    console.log('✅ test-fandom-glossary: merge, relevance, placeholders, promote');
  } finally {
    await prisma.novel.delete({ where: { id: novel.id } }); // cascades novel glossary
    await prisma.fandom.delete({ where: { id: fandom.id } }); // cascades fandom glossary
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
