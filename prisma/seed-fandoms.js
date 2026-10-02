const fs = require('fs');
const path = require('path');

// Seeds shared fandom glossaries from prisma/fandoms/*.json.
// File shape: { name, terms: { <group>: { "English": <entry> } }, review?: [terms to double-check] }
// where <entry> is "ไทย" or a card { "th": "ไทย", "image"?: "https://...", "aliases"?: { "English": "ไทย" } }.
// Aliases become the card's variants (FandomGlossary.parentId) and share its group.
// Create-only: Thai/category an admin edited in /admin/fandoms is never overwritten. The only
// change to existing rows is linking a still-standalone term under its card, and filling a
// missing card image.
// Run alone: node prisma/seed-fandoms.js   (also runs as part of npm run db:seed)

// group -> [GlossaryEditor category id, EntityType]
const GROUPS = {
  name: ['name', 'CHARACTER'],
  place: ['place', 'LOCATION'],
  org: ['other', 'ORGANIZATION'],
  title: ['title', 'CUSTOM'],
  skill: ['skill', 'SKILL'],
  item: ['item', 'ITEM'],
  other: ['other', 'CUSTOM'],
};

const DIR = path.join(__dirname, 'fandoms');

// Flattens a fandom file into rows (cards first, then variants with parentEn); throws on unknown
// groups, empty values, or a term listed twice (glossary keys compare case-insensitively).
function loadFandomFile(file) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  if (!data.name) throw new Error(`${file}: missing "name"`);
  const seen = new Set();
  const cards = [];
  const variants = [];
  const add = (list, en, th, extra) => {
    const key = en.trim().toLowerCase();
    if (!key || typeof th !== 'string' || !th.trim()) throw new Error(`${file}: empty term "${en}"`);
    if (seen.has(key)) throw new Error(`${file}: duplicate term "${en}"`);
    seen.add(key);
    list.push({ canonicalEn: en.trim(), canonicalTh: th.trim(), ...extra });
  };

  for (const [group, terms] of Object.entries(data.terms || {})) {
    if (!GROUPS[group]) throw new Error(`${file}: unknown group "${group}"`);
    const [category, entityType] = GROUPS[group];
    for (const [en, entry] of Object.entries(terms)) {
      const card = typeof entry === 'string' ? { th: entry } : entry;
      add(cards, en, card.th, { category, entityType, imageUrl: card.image || null });
      for (const [aliasEn, aliasTh] of Object.entries(card.aliases || {})) {
        add(variants, aliasEn, aliasTh, { category, entityType, parentEn: en.trim() });
      }
    }
  }
  for (const r of data.review || []) {
    if (!seen.has(r.toLowerCase())) throw new Error(`${file}: review entry "${r}" is not a term`);
  }
  return { name: data.name, cards, variants };
}

async function seedFandoms(prisma) {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const { name, cards, variants } = loadFandomFile(file);
    const fandom = await prisma.fandom.upsert({ where: { name }, update: {}, create: { name } });
    const find = (canonicalEn) =>
      prisma.fandomGlossary.findUnique({ where: { fandomId_canonicalEn: { fandomId: fandom.id, canonicalEn } } });
    const idByEn = new Map();
    let created = 0;
    let linked = 0;

    for (const { imageUrl, ...r } of cards) {
      let row = await find(r.canonicalEn);
      if (!row) {
        row = await prisma.fandomGlossary.create({ data: { fandomId: fandom.id, ...r, imageUrl } });
        created++;
      } else if (imageUrl && !row.imageUrl && !row.parentId) {
        await prisma.fandomGlossary.update({ where: { id: row.id }, data: { imageUrl } });
      }
      idByEn.set(r.canonicalEn, row.parentId ? null : row.id);
    }

    for (const { parentEn, ...r } of variants) {
      const parentId = idByEn.get(parentEn);
      if (!parentId) continue; // admin turned the card into a variant elsewhere; leave it be
      const row = await find(r.canonicalEn);
      if (!row) {
        await prisma.fandomGlossary.create({ data: { fandomId: fandom.id, ...r, parentId } });
        created++;
      } else if (!row.parentId && (await prisma.fandomGlossary.count({ where: { parentId: row.id } })) === 0) {
        await prisma.fandomGlossary.update({ where: { id: row.id }, data: { parentId, imageUrl: null } });
        linked++;
      }
    }

    console.log(
      `✅ Fandom "${name}": ${cards.length} cards / ${cards.length + variants.length} terms (${created} new, ${linked} linked)`
    );
  }
}

module.exports = { seedFandoms, loadFandomFile };

if (require.main === module) {
  require('@next/env').loadEnvConfig(process.cwd());
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  seedFandoms(prisma)
    .catch((e) => {
      console.error('❌ Fandom seed error:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
