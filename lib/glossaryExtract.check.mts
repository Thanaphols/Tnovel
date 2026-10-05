// Run: npx jiti lib/glossaryExtract.check.mts
// Name detection and pre-Google term locking must read capitals in context: a capital at the
// start of a sentence says nothing, and a word also used in lowercase is an ordinary word.
import assert from 'node:assert';
import { extractCandidateEntities } from './glossaryService';
import { protectTerms } from './nameReplacer';

const chapter = [
  'Because Kiyoshi was late, the class waited for him.',
  'Even Tenten laughed when she saw Kiyoshi trip again.',
  'Both Lee and Tenten ran to Kiyoshi and his friend Tenten.',
  'They met Professor Sprout in the hall. Professor Sprout nodded.',
  'He used the Body Flicker to dodge. His body ached afterwards.',
  'The Earth trembled. He fell to the earth, kissed the earth and saw Earth and the earth again.',
];
const found = extractCandidateEntities(chapter);

for (const junk of ['Because Kiyoshi', 'Even Tenten', 'Both Lee', 'Body', 'Earth']) {
  assert.ok(!found.includes(junk), `junk "${junk}" not extracted (got ${JSON.stringify(found)})`);
}
assert.ok(found.includes('Kiyoshi'), 'name freed from "Because Kiyoshi" is still found');
assert.ok(found.includes('Tenten'), 'Tenten found');
assert.ok(found.includes('Professor Sprout'), 'title + name kept (title is capitalized mid-sentence)');
assert.ok(found.includes('Body Flicker'), 'technique name kept');

// Pre-Google locking: "Hand" (a curated term) only at a mid-sentence capital, not at sentence start.
const { protectedText, restore } = protectTerms(
  ['Hand shaking, he bowed to the Hand.', 'The Hand smiled at Kakashi.', 'He raised his hand.'],
  [
    { canonicalEn: 'Hand', canonicalTh: 'หัตถ์' },
    { canonicalEn: 'Kakashi', canonicalTh: 'คาคาชิ' },
  ]
);
assert.equal(protectedText[0], 'Hand shaking, he bowed to the ZXQ0.', 'sentence-start "Hand" left for Google');
assert.equal(protectedText[1], 'The ZXQ0 smiled at ZXQ1.');
assert.deepEqual(restore(['ZXQ1']), ['คาคาชิ']);

// A name never used in lowercase is locked even at the start of a sentence.
assert.equal(protectTerms(['Kakashi sighed.'], [{ canonicalEn: 'Kakashi', canonicalTh: 'คาคาชิ' }]).protectedText[0], 'ZXQ0 sighed.');

console.log('glossaryExtract ok');
