const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Seed Developer Admin Account
  const devEmail = 'dev@mail.com';
  const devPassword = await bcrypt.hash('123456', 10);
  const devUser = await prisma.user.upsert({
    where: { email: devEmail },
    update: {
      password: devPassword,
      role: 'ADMIN',
      name: 'Admin Developer',
    },
    create: {
      email: devEmail,
      name: 'Admin Developer',
      password: devPassword,
      role: 'ADMIN',
    },
  });

  // 2. Seed Primary Admin Account
  const primaryEmail = 'cupteo254504@gmail.com';
  const primaryPassword = await bcrypt.hash('123456', 10);
  const primaryUser = await prisma.user.upsert({
    where: { email: primaryEmail },
    update: {
      role: 'ADMIN',
      name: 'Primary Admin',
    },
    create: {
      email: primaryEmail,
      name: 'Primary Admin',
      password: primaryPassword,
      role: 'ADMIN',
    },
  });

  // 3. Seed Whitelist for both accounts
  await prisma.whitelistedEmail.upsert({
    where: { email: devEmail },
    update: { note: 'Developer Account', role: 'ADMIN' },
    create: { email: devEmail, note: 'Developer Account', role: 'ADMIN' },
  });

  await prisma.whitelistedEmail.upsert({
    where: { email: primaryEmail },
    update: { note: 'Primary Admin Account', role: 'ADMIN' },
    create: { email: primaryEmail, note: 'Primary Admin Account', role: 'ADMIN' },
  });

  console.log('✅ Admins & Whitelist seeded:');
  console.log(`   - ${devEmail} (Role: ADMIN, Password: 123456)`);
  console.log(`   - ${primaryEmail} (Role: ADMIN, Password: 123456)`);

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
      createdById: devUser.id,
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
