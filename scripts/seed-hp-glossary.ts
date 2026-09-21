import { prisma } from '../lib/prisma';

async function seedHpGlossary() {
  const novelId = '55b4e9f2-9d4b-4aad-89b2-a3b0f3700ede';
  const terms = [
    { canonicalEn: 'Sagres Greengrass', canonicalTh: 'ซาเกรส กรีนกราส', entityType: 'CHARACTER', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Sagres', canonicalTh: 'ซาเกรส', entityType: 'CHARACTER', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Greengrass', canonicalTh: 'กรีนกราส', entityType: 'CHARACTER', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Azkaban', canonicalTh: 'อัซคาบัน', entityType: 'LOCATION', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Dementor', canonicalTh: 'ผู้คุมวิญญาณ', entityType: 'CREATURE', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Dementors', canonicalTh: 'ผู้คุมวิญญาณ', entityType: 'CREATURE', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Dumbledore', canonicalTh: 'ดัมเบิลดอร์', entityType: 'CHARACTER', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Albus Dumbledore', canonicalTh: 'อัลบัส ดัมเบิลดอร์', entityType: 'CHARACTER', isLocked: true, validationStatus: 'APPROVED' },
    { canonicalEn: 'Hogwarts', canonicalTh: 'ฮอกวอตส์', entityType: 'LOCATION', isLocked: true, validationStatus: 'APPROVED' }
  ];

  for (const t of terms) {
    await prisma.novelGlossary.upsert({
      where: { novelId_canonicalEn: { novelId, canonicalEn: t.canonicalEn } },
      create: { novelId, ...t },
      update: { canonicalTh: t.canonicalTh, isLocked: true, validationStatus: 'APPROVED' }
    });
  }

  const count = await prisma.novelGlossary.count({ where: { novelId } });
  console.log(`Successfully seeded HP Glossary! Total terms for novel: ${count}`);
}

seedHpGlossary()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
