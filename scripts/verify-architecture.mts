import assert from 'node:assert';
import crypto from 'node:crypto';
import { applySafeNameReplacer } from '../lib/nameReplacer.ts';
import { validateNewEntity } from '../lib/glossaryService.ts';
import { inFlightLock } from '../lib/inFlightLock.ts';

console.log('================================================================');
console.log('🧪 RUNNING PRODUCTION ARCHITECTURE VERIFICATION TEST SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// Test 1: Semantic-Safe Name Replacer & Subword Collision
// -------------------------------------------------------------
console.log('Test 1: Semantic-Safe Name Replacer & Subword Collision');
{
  const glossary = [
    { canonicalEn: 'Chase Miller', canonicalTh: 'เชส มิลเลอร์', entityType: 'CHARACTER', isLocked: true },
    { canonicalEn: 'Dr. Chase Miller', canonicalTh: 'ดร.เชส มิลเลอร์', entityType: 'CHARACTER', isLocked: true },
    { canonicalEn: 'Will', canonicalTh: 'วิล', entityType: 'CHARACTER', isLocked: false },
    { canonicalEn: 'Chase', canonicalTh: 'เชส', entityType: 'CHARACTER', isLocked: false },
  ];

  const testParagraphs = [
    'William likes to chase dogs, but Chase Miller waited for Dr. Chase Miller.',
    'He said that Will is a friend of William.'
  ];

  const replaced = applySafeNameReplacer(testParagraphs, glossary);

  console.log('  Input [0]:', testParagraphs[0]);
  console.log('  Result[0]:', replaced[0]);
  console.log('  Input [1]:', testParagraphs[1]);
  console.log('  Result[1]:', replaced[1]);

  // 1. "William" must NOT be corrupted into "วิลiam"
  assert(!replaced[0].includes('วิลiam'), 'FAILED: Subword collision corrupted William into วิลiam');
  assert(replaced[0].includes('William'), 'FAILED: William should be preserved intact');

  // 2. "chase dogs" must NOT be converted to "เชส dogs" (semantic safety on ambiguous single word 'chase')
  assert(!replaced[0].includes('เชส dogs'), 'FAILED: Semantic collision converted verb "chase" into name "เชส"');
  assert(replaced[0].includes('chase dogs'), 'FAILED: Verb phrase "chase dogs" should be preserved');

  // 3. Multi-word "Chase Miller" and "Dr. Chase Miller" must be replaced correctly
  assert(replaced[0].includes('เชส มิลเลอร์'), 'FAILED: Chase Miller should be replaced with เชส มิลเลอร์');
  assert(replaced[0].includes('ดร.เชส มิลเลอร์'), 'FAILED: Dr. Chase Miller should be replaced with ดร.เชส มิลเลอร์');

  console.log('  ✅ Test 1 PASSED: Longest-match first, word boundaries, and semantic safety verified.\n');
}

// -------------------------------------------------------------
// Test 2: Relevant Glossary Filter & Context Explosion Guard
// -------------------------------------------------------------
console.log('Test 2: Relevant Glossary Filter & Entity Validator');
{
  // Test pronoun/stopword rejection
  const pronounRes = validateNewEntity({ source: 'He', translation: 'เขา' });
  assert.strictEqual(pronounRes.isValid, false, 'FAILED: Pronoun "He" should be rejected');
  assert.strictEqual(pronounRes.status, 'REJECTED');

  const shortRes = validateNewEntity({ source: 'A', translation: 'เอ' });
  assert.strictEqual(shortRes.isValid, false, 'FAILED: Short entity (<2 chars) should be rejected');

  // Test Auto-approval for high confidence multi-word name
  const validRes = validateNewEntity({ source: 'Lord Silver Wing', translation: 'ลอร์ดปีกเงิน', confidence: 0.95 });
  assert.strictEqual(validRes.isValid, true);
  assert.strictEqual(validRes.status, 'AUTO_APPROVED');

  // Test Review-required for ambiguous low-confidence entity
  const reviewRes = validateNewEntity({ source: 'Shadow', translation: 'เงา', confidence: 0.70 });
  assert.strictEqual(reviewRes.isValid, true);
  assert.strictEqual(reviewRes.status, 'REVIEW_REQUIRED');

  console.log('  ✅ Test 2 PASSED: Entity validation pipeline correctly filters stopwords and classifies confidence.\n');
}

// -------------------------------------------------------------
// Test 3: Layer 1 In-Flight Promise Lock (Single Process Deduplication)
// -------------------------------------------------------------
console.log('Test 3: Layer 1 In-Flight Promise Lock');
async function testInFlightLock() {
  let executionCounter = 0;
  const task = async () => {
    executionCounter++;
    await new Promise((r) => setTimeout(r, 100));
    return 'DONE';
  };

  // Dispatch 5 simultaneous calls with the exact same key
  const results = await Promise.all([
    inFlightLock.runExclusive('test-chapter-100:FETCH', task),
    inFlightLock.runExclusive('test-chapter-100:FETCH', task),
    inFlightLock.runExclusive('test-chapter-100:FETCH', task),
    inFlightLock.runExclusive('test-chapter-100:FETCH', task),
    inFlightLock.runExclusive('test-chapter-100:FETCH', task),
  ]);

  assert.strictEqual(executionCounter, 1, `FAILED: Expected task to execute exactly 1 time, but ran ${executionCounter} times!`);
  assert.deepStrictEqual(results, ['DONE', 'DONE', 'DONE', 'DONE', 'DONE']);
  console.log('  5 concurrent requests coalesced into 1 execution.');
  console.log('  ✅ Test 3 PASSED: In-flight deduplication prevented redundant executions.\n');
}

// -------------------------------------------------------------
// Test 4: Normalized Text Source Hash Calculation
// -------------------------------------------------------------
console.log('Test 4: Normalized Text Source Hash Calculation');
{
  function calculateSourceHash(paragraphs: string[]) {
    const normalized = paragraphs
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p) => p.length > 0)
      .join('\n');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  const p1 = ['  The ancient hall was silent.  ', '\n\nDarkness fell upon the realm. '];
  const p2 = ['The ancient hall was silent.', 'Darkness fell upon the realm.'];

  const hash1 = calculateSourceHash(p1);
  const hash2 = calculateSourceHash(p2);

  assert.strictEqual(hash1, hash2, 'FAILED: Normalized hashes should match regardless of leading/trailing whitespace');
  console.log('  Hash 1:', hash1);
  console.log('  Hash 2:', hash2);
  console.log('  ✅ Test 4 PASSED: Clean text hashing eliminates false positives from whitespace differences.\n');
}

// -------------------------------------------------------------
// Test 5: Safe Manual Paste XSS Sanitization
// -------------------------------------------------------------
console.log('Test 5: Safe Manual Paste Sanitization');
{
  function sanitizeToParagraphs(rawText: string): string[] {
    const cleaned = rawText
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');

    return cleaned
      .split(/\r?\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  const dirtyInput = `
    <script>alert("XSS Attack!");</script>
    <p>Chapter 10: The Secret Scroll</p>
    <iframe src="malicious.site"></iframe>
    He looked at the scroll with wonder.
  `;

  const cleanParagraphs = sanitizeToParagraphs(dirtyInput);
  console.log('  Sanitized output:', cleanParagraphs);

  assert(!cleanParagraphs.some((p) => p.includes('<script>') || p.includes('alert')), 'FAILED: Script was not stripped');
  assert(!cleanParagraphs.some((p) => p.includes('iframe')), 'FAILED: iframe was not stripped');
  assert.strictEqual(cleanParagraphs.length, 2);
  assert.strictEqual(cleanParagraphs[0], 'Chapter 10: The Secret Scroll');
  assert.strictEqual(cleanParagraphs[1], 'He looked at the scroll with wonder.');

  console.log('  ✅ Test 5 PASSED: HTML and XSS tags safely stripped before saving.\n');
}

async function runAll() {
  await testInFlightLock();
  console.log('================================================================');
  console.log('🎉 ALL ARCHITECTURE UNIT & INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

runAll().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
