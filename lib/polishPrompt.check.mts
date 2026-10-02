// Run: npx jiti lib/polishPrompt.check.mts   (jiti resolves translator.ts's extensionless imports)
// Glossary terms are grouped under Thai category headings so the model knows "Green Grace" is a
// person, not a phrase; an unknown/missing category lands under "other".
import assert from 'node:assert';
import { buildPolishPrompt } from './translator';

const prompt = buildPolishPrompt({
  glossary: [
    { termEn: 'Green Grace', termTh: 'กรีนเกรซ', category: 'name' },
    { termEn: 'Hokage', termTh: 'โฮคาเงะ', category: 'title' },
    { termEn: 'Mystery', termTh: 'มิสเทอรี', category: null },
  ],
});
const at = (s: string) => prompt.indexOf(s);

assert.ok(at('[ชื่อตัวละคร]') >= 0 && at('[ชื่อตัวละคร]') < at('"Green Grace"'), 'name heading precedes its term');
assert.ok(at('"Green Grace"') < at('[ตำแหน่ง/ยศ]') && at('[ตำแหน่ง/ยศ]') < at('"Hokage"'), 'title group after name group');
assert.ok(at('[คำเฉพาะอื่นๆ]') >= 0 && at('[คำเฉพาะอื่นๆ]') < at('"Mystery"'), 'uncategorised term falls under other');
assert.ok(prompt.includes('ห้ามแปลตามความหมายของคำ'), 'rule against literal translation of glossary terms');
assert.ok(!prompt.includes('[สถานที่]'), 'empty categories are omitted');

console.log('polishPrompt ok');
