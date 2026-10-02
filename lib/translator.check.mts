// Run: npx jiti lib/translator.check.mts   (jiti resolves translator.ts's extensionless imports)
// Offline: covers the guard that keeps a bad Gemini reply from shifting paragraphs out of line.
import assert from 'node:assert';
import { parsePolishedBatch } from './translator';

const draft = ['ชื่อตอน', 'อัศวินยกดาบของเขา', '', 'ฝนตก'];

assert.deepStrictEqual(
  parsePolishedBatch('["ชื่อตอนใหม่","อัศวินชูดาบขึ้น","แทรกมั่ว","สายฝนโปรยปราย"]', draft),
  ['ชื่อตอนใหม่', 'อัศวินชูดาบขึ้น', '', 'สายฝนโปรยปราย'],
  'aligned reply is accepted; blank draft paragraph stays blank'
);
assert.strictEqual(parsePolishedBatch('["a","b","c"]', draft), null, 'too few paragraphs -> keep draft');
assert.strictEqual(parsePolishedBatch('["a","b","c","d","e"]', draft), null, 'too many paragraphs -> keep draft');
assert.strictEqual(parsePolishedBatch('not json', draft), null, 'bad JSON -> keep draft');
assert.strictEqual(parsePolishedBatch('[1,2,3,4]', draft), null, 'non-strings -> keep draft');
assert.deepStrictEqual(parsePolishedBatch('["x","  ","","y"]', draft), ['x', 'อัศวินยกดาบของเขา', '', 'y'], 'empty polish falls back per paragraph');

// Model merged two middle paragraphs: 9 of 10 back must NOT be index-mapped (would shift 3..10).
const ten = Array.from({ length: 10 }, (_, i) => `ร่าง${i + 1}`);
assert.strictEqual(parsePolishedBatch(JSON.stringify(ten.slice(0, 9)), ten), null, 'one paragraph short -> keep draft');

console.log('translator: all checks passed');
