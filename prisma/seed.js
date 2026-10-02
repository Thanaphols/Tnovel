const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Same loader as server.js, so .env.local is honoured when run via `npm run db:seed`.
require('@next/env').loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

// Upserts an ADMIN user plus its ADMIN whitelist row. password = null keeps the existing one
// (or none, i.e. Google-login only).
async function seedAdmin(email, name, note, password) {
  const hashed = password ? await bcrypt.hash(password, 10) : undefined;
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', ...(hashed ? { password: hashed } : {}) },
    create: { email, name, role: 'ADMIN', password: hashed ?? null },
  });
  await prisma.whitelistedEmail.upsert({
    where: { email },
    update: { note, role: 'ADMIN' },
    create: { email, note, role: 'ADMIN' },
  });
  return user;
}

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Developer admin (dev@mail.com / 123456) — local only, never in production.
  let devUser = null;
  if (process.env.NODE_ENV !== 'production') {
    devUser = await seedAdmin('dev@mail.com', 'Admin Developer', 'Developer Account', '123456');
    console.log('✅ Dev admin seeded: dev@mail.com (Password: 123456)');
  }

  // 2. Primary admin from env. Password optional: without it the account signs in with Google.
  const primaryEmail = process.env.PRIMARY_ADMIN_EMAIL?.trim().toLowerCase();
  if (primaryEmail) {
    await seedAdmin(
      primaryEmail,
      'Primary Admin',
      'Primary Admin Account',
      process.env.PRIMARY_ADMIN_PASSWORD || null
    );
    console.log(
      `✅ Primary admin seeded: ${primaryEmail}${process.env.PRIMARY_ADMIN_PASSWORD ? ' (password from env)' : ' (Google login)'}`
    );
  } else {
    console.warn('⚠️  PRIMARY_ADMIN_EMAIL not set — skipping primary admin.');
  }

  // 3b. Seed AI provider defaults (create-only: never clobber an admin's runtime change)
  const aiDefaults = [
    { key: 'ai.provider', value: 'gemini' },
    { key: 'ai.ollamaModel', value: 'qwen2.5:7b' },
    { key: 'ai.geminiModel', value: 'gemini-3.6-flash' },
  ];
  for (const s of aiDefaults) {
    await prisma.appSetting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
  console.log('✅ AI settings seeded (default provider: gemini)');

  // 3c. Shared fandom glossaries (prisma/fandoms/*.json, create-only)
  await require('./seed-fandoms').seedFandoms(prisma);

  // 4. Seed Sample Author
  const author = await prisma.author.upsert({
    where: { name: 'I Eat Tomatoes (我吃西红柿)' },
    update: {},
    create: {
      name: 'I Eat Tomatoes (我吃西红柿)',
      bio: 'นักเขียนนิยายแฟนตาซีกำลังภายในชื่อดัง เจ้าของผลงาน Coiling Dragon, Stellar Transformations, Lord Xue Ying',
    },
  });

  // 5. Seed Sample Novel & Chapters
  const sampleNovel = await prisma.novel.upsert({
    where: { id: 'sample-novel-lord-xue-ying' },
    update: {},
    create: {
      id: 'sample-novel-lord-xue-ying',
      titleEn: 'Lord Xue Ying',
      titleTh: 'อินทรีหิมะเสวี่ยอิง',
      description: 'ในดินแดนอันกว้างใหญ่ที่เต็มไปด้วยเหล่าผู้ฝึกตนและสิ่งมีชีวิตโบราณ ดงเสวี่ยอิง ชายหนุ่มผู้ถือครองสายเลือดโบราณ เพื่อปกป้องครอบครัวและคนที่เขารัก เขาจึงต้องฝึกฝนตนเองเพื่อก้าวข้ามขีดจำกัดสู่ความเป็นพระเจ้า!',
      coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=600',
      sourceUrl: 'https://www.wuxiaworld.com/novel/lord-xue-ying',
      category: 'Fantasy / Action / Xianxia',
      totalChapters: 2,
      translationStatus: 'COMPLETED',
      viewCount: 128,
      likeCount: 15,
      authorId: author.id,
      createdById: devUser?.id,
      chapters: {
        create: [
          {
            chapterNumber: 1,
            titleEn: 'Chapter 1: The Bloodline Awakens',
            titleTh: 'บทที่ 1: การตื่นขึ้นของสายเลือด',
            contentEn: JSON.stringify([
              'Deep in the tranquil valley of the Snow Eagle Territory, a young boy stood clutching a heavy iron spear under the scorching sun.',
              'Sweat dripped continuously from his chin, soaking into the dry soil beneath him, yet his gaze remained sharper than an eagle eyeing its prey.',
              'No matter how difficult the journey is, I will master the spear and protect my family, Xue Ying whispered with unyielding conviction.',
              'Suddenly, a mysterious warm sensation stirred within his chest, sending ripples of boundless power through his meridians.'
            ]),
            contentTh: JSON.stringify([
              'ลึกเข้าไปในหุบเขาอันเงียบสงบแห่งดินแดนอินทรีหิมะ เด็กหนุ่มคนหนึ่งยืนถือหอกเหล็กหนักอึ้งอยู่ใต้แสงแดดอันแผดเผา',
              'หยาดเหงื่อไหลหยดลงมาจากคางของเขาอย่างไม่ขาดสาย ซึมลงสู่ผืนดินแห้งผากเบื้องล่าง ทว่าแววตาของเขายังคงคมกริบยิ่งกว่าพญาอินทรียามจ้องมองเหยื่อ',
              'ไม่ว่าหนทางจะยากลำบากเพียงใด ข้าจะต้องฝึกฝนวิชาหอกให้เชี่ยวชาญและปกป้องครอบครัวของข้าให้ได้ เสวี่ยอิงพึมพำด้วยความมุ่งมั่นที่ไม่สั่นคลอน',
              'ทันใดนั้น ความอบอุ่นลึกลับสายหนึ่งก็พลันปะทุขึ้นภายในทรวงอก ส่งระลอกคลื่นแห่งพลังอันไร้ขอบเขตแล่นพล่านไปทั่วเส้นชีพจรของเขา'
            ]),
            originalUrl: 'https://www.wuxiaworld.com/novel/lord-xue-ying/chapter-1',
          },
          {
            chapterNumber: 2,
            titleEn: 'Chapter 2: Spear of the Cold Moon',
            titleTh: 'บทที่ 2: หอกจันทราเหมันต์',
            contentEn: JSON.stringify([
              'Under the silver moonlight, the spear whistled through the night air like a howling wind.',
              'Each thrust carried with it the freezing chill of winter, shattering stone boulders into fragments.',
              'The elders of the clan watched from a distance in utter astonishment at the prodigy before them.'
            ]),
            contentTh: JSON.stringify([
              'ภายใต้แสงจันทร์สีเงิน หอกเหล็กแหวกผ่านอากาศยามค่ำคืนดั่งสายลมหวีดหวิว',
              'ทุกกระบวนท่าแทงแฝงไปด้วยไอเย็นยะเยือกแห่งเหมันต์ บดขยี้ก้อนหินผาจนแตกละเอียดเป็นเสี่ยงๆ',
              'เหล่าผู้อาวุโสของตระกูลที่เฝ้ามองอยู่ห่างๆ ต่างตกตะลึงกับความสามารถอันน่าเหลือเชื่อของอัจฉริยะรุ่นเยาว์ตรงหน้า'
            ]),
            originalUrl: 'https://www.wuxiaworld.com/novel/lord-xue-ying/chapter-2',
          },
        ],
      },
    },
  });

  console.log('✅ Sample novel & chapters seeded:');
  console.log(`   - "${sampleNovel.titleTh}" (${sampleNovel.titleEn}) with 2 chapters`);
  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
