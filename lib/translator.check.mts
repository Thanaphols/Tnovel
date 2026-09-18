// Run: node --experimental-strip-types lib/translator.check.mts
// Offline: covers the guard that keeps a bad Gemini reply from shifting paragraphs out of line.
import assert from 'node:assert';
import { parsePolishedBatch } from './translator.ts';

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

console.log('translator: all checks passed');
