// Run: npx jiti lib/chineseSource.check.mts
// Chinese source text: glossary terms must match without \b (no word boundaries in Chinese),
// 2-char names count, and the polish prompt switches to a "zh" source key.
import assert from 'node:assert';
import { isChineseText, isThaiText } from './thaiUtils';
import { applySafeNameReplacer, protectTerms, termRegex } from './nameReplacer';
import { buildPolishPrompt } from './translator';

const zh = ['第1章 林动', '林动看着萧炎，冷笑道：“你以为你是谁？”'];
assert.ok(isChineseText(zh), 'detects Chinese');
assert.ok(!isChineseText(['The gate opened.', 'He stepped through.']), 'English is not Chinese');
assert.ok(!isThaiText(zh), 'Chinese is not Thai');

const glossary = [
  { canonicalEn: '林动', canonicalTh: 'หลินต้ง' },
  { canonicalEn: '萧炎', canonicalTh: 'เซียวเหยียน' },
  { canonicalEn: 'Dumbledore', canonicalTh: 'ดัมเบิลดอร์' },
];

const { protectedText, restore } = protectTerms(zh, glossary);
assert.equal(protectedText[1], 'ZXQ0看着ZXQ1，冷笑道：“你以为你是谁？”', 'Chinese names become tokens');
assert.deepEqual(restore(['ZXQ0 มองไปที่ ZXQ1']), ['หลินต้ง มองไปที่ เซียวเหยียน']);

// Leaked Chinese inside the Thai output gets swapped too.
assert.deepEqual(applySafeNameReplacer(['林动ยิ้ม'], glossary), ['หลินต้งยิ้ม']);

// English keeps whole-word matching.
assert.ok(!termRegex('Lee').test('sleep'), 'English still needs word boundaries');
assert.ok(termRegex('Dumbledore').test('Dumbledore said'), 'English whole word matches');

const zhPrompt = buildPolishPrompt(undefined, 'zh');
assert.ok(zhPrompt.includes('{"zh": ต้นฉบับภาษาจีน'), 'zh prompt names the zh key');
assert.ok(zhPrompt.includes('ศิษย์พี่'), 'zh prompt carries Chinese address terms');
assert.ok(buildPolishPrompt().includes('{"en": ต้นฉบับภาษาอังกฤษ'), 'default prompt stays English');

console.log('chineseSource ok');
