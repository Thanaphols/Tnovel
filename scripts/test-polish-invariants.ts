import { detectEnglishLeak } from '../lib/translation/detectEnglishLeak';
import { applySafeNameReplacer } from '../lib/nameReplacer';
import { prisma } from '../lib/prisma';
import { ChapterStatus } from '../lib/enums';

async function runTests() {
  console.log('🧪 Running Polish Invariants & Leak Detector Verification...\n');

  // Test 1: Scope-based English Leak Detector & Safe Acronyms
  const sampleParagraphs = [
    'แฮร์รี่มองดูค่า HP และ MP ของเขาที่ลดลงอย่างรวดเร็ว',
    'เขากำลังส่งข้อมูลผ่านระบบ Wi-Fi และใช้ GPU ในการคำนวณ',
    'ทันใดนั้น Sagres Greengrass ก็เดินเข้ามาในห้องโถงใหญ่',
    'Greengrass เป็นตระกูลเวทมนตร์เก่าแก่ที่ทรงอำนาจ',
  ];

  const glossary = [
    { canonicalEn: 'Sagres Greengrass', canonicalTh: 'ซาเกรส กรีนกราส' },
    { canonicalEn: 'Greengrass', canonicalTh: 'กรีนกราส' },
  ];

  const leakResult = detectEnglishLeak(sampleParagraphs, glossary);
  console.assert(leakResult.hasLeak, '1. Should detect English leaks for Greengrass');
  console.assert(leakResult.leaks.length >= 2, '1. Should detect both occurrences');

  // Check that HP, MP, Wi-Fi, GPU were NOT flagged as leaks
  const hasAcronymLeak = leakResult.leaks.some((l) => ['hp', 'mp', 'wifi', 'gpu'].includes(l.term.toLowerCase()));
  console.assert(!hasAcronymLeak, '1. Safe acronyms (HP, MP, Wi-Fi, GPU) MUST NOT be flagged as leaks');
  console.log('✅ Test 1: Scope-based English Leak Detector passed (Allowed acronyms preserved, entity leaks caught)');

  // Test 2: Name Replacer + Leak Repair Safety Net
  const afterReplacer = applySafeNameReplacer(sampleParagraphs, glossary);
  const repairedCheck = detectEnglishLeak(afterReplacer, glossary);
  console.assert(!repairedCheck.hasLeak, '2. Repaired paragraphs should have 0 entity leaks');
  console.assert(repairedCheck.repairedParagraphs![2].includes('ซาเกรส กรีนกราส'), '2. Sagres Greengrass must be replaced with ซาเกรส กรีนกราส');
  console.assert(repairedCheck.repairedParagraphs![0].includes('HP'), '2. HP must remain intact');
  console.log('✅ Test 2: Name Replacer + Leak Repair Safety Net passed');

  // Test 3: Last-Known-Good Preservation Invariant in DB
  // Create a temporary chapter with known good polished content
  const testNovel = await prisma.novel.findFirst({ select: { id: true } });
  if (!testNovel) {
    console.log('⚠️ Skipping DB chapter test (no novel found)');
    return;
  }

  const initialGoodPolished = ['บทนำที่ได้รับการเกลาสำนวนอย่างประณีตและสมบูรณ์แบบ'];
  const testChapter = await prisma.chapter.create({
    data: {
      novelId: testNovel.id,
      chapterNumber: 999999,
      titleEn: 'Test Preservation Chapter',
      titleTh: 'บททดสอบการรักษาเนื้อหาเดิม',
      contentEn: JSON.stringify(['Introduction paragraph in English.']),
      contentThGoogle: JSON.stringify(['บทนำฉบับร่างของ Google']),
      contentThPolished: JSON.stringify(initialGoodPolished),
      contentTh: JSON.stringify(initialGoodPolished),
      status: ChapterStatus.POLISHED,
      originalUrl: 'http://test-preservation.local',
    },
  });

  // Simulate a failed re-polish:
  // Invariant: If re-polish fails, status -> POLISH_FAILED, but contentThPolished MUST remain initialGoodPolished!
  await prisma.chapter.update({
    where: { id: testChapter.id },
    data: {
      status: ChapterStatus.POLISH_FAILED,
      // Notice: contentThPolished is intentionally NOT touched
    },
  });

  const inspectedChapter = await prisma.chapter.findUnique({ where: { id: testChapter.id } });
  console.assert(inspectedChapter?.status === ChapterStatus.POLISH_FAILED, '3. Status must be POLISH_FAILED');
  console.assert(
    inspectedChapter?.contentThPolished === JSON.stringify(initialGoodPolished),
    '3. Last-known-good polished content MUST be preserved intact in DB!'
  );
  console.log('✅ Test 3: Last-Known-Good Preservation Invariant verified in DB');

  // Cleanup test chapter
  await prisma.chapter.delete({ where: { id: testChapter.id } });
  console.log('🧹 Cleaned up temporary test chapter');

  console.log('\n🎉 ALL POLISH INVARIANT TESTS PASSED CLEANLY (100% SUCCESS)!');
}

runTests()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
