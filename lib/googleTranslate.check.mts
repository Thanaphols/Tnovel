// Run: node --experimental-strip-types lib/googleTranslate.check.mts
// Hits the real endpoint. Fails loudly if ordering or length ever stops lining up.
import assert from 'node:assert';
import { translateParagraphsGoogle, translateTitleGoogle } from './googleTranslate.ts';

const isThai = (s: string) => /[฀-๿]/.test(s);

const plain = await translateParagraphsGoogle([
  'The knight raised his sword.',
  'Rain hammered the courtyard stones.',
  'She said nothing at all.',
]);
assert.strictEqual(plain.length, 3, 'must return one translation per paragraph');
assert.ok(plain.every(isThai), `every paragraph should come back Thai: ${JSON.stringify(plain)}`);

// The alignment case: blanks are skipped on the wire, so they must be restored in place.
const withBlanks = await translateParagraphsGoogle(['The gate opened.', '', '   ', 'He stepped through.']);
assert.strictEqual(withBlanks.length, 4, 'blank paragraphs must be preserved, not dropped');
assert.strictEqual(withBlanks[1], '', 'blank stays blank');
assert.strictEqual(withBlanks[2], '   ', 'whitespace-only stays untouched');
assert.ok(isThai(withBlanks[0]) && isThai(withBlanks[3]), 'text around blanks must not shift index');

const title = await translateTitleGoogle('The Hero Returns');
assert.ok(isThai(title), `title should be Thai: ${title}`);

console.log('ok  ', JSON.stringify(plain[0]));
console.log('ok  ', JSON.stringify(withBlanks));
console.log('ok  ', JSON.stringify(title));
console.log('googleTranslate: all checks passed');
