// Glossary term categories, shared by the admin editors and the polish prompt.
// Client-safe: no server imports.

export const CATEGORY_OPTIONS = [
  { id: 'name', labelTh: 'ชื่อตัวละคร', labelEn: 'Character Name' },
  { id: 'place', labelTh: 'สถานที่', labelEn: 'Location/Place' },
  { id: 'org', labelTh: 'องค์กร/กลุ่ม', labelEn: 'Organization/Group' },
  { id: 'title', labelTh: 'ตำแหน่ง/ยศ', labelEn: 'Title/Rank' },
  { id: 'skill', labelTh: 'ทักษะ/วิชา', labelEn: 'Skill/Technique' },
  { id: 'item', labelTh: 'สิ่งของ/อาวุธ', labelEn: 'Item/Weapon' },
  { id: 'other', labelTh: 'คำเฉพาะอื่นๆ', labelEn: 'Other Term' },
];

// Auto-discovered terms only carry entityType (lib/enums.ts EntityType), not a category.
export const ENTITY_TO_CATEGORY: Record<string, string> = {
  CHARACTER: 'name',
  LOCATION: 'place',
  ORGANIZATION: 'org',
  ITEM: 'item',
  SKILL: 'skill',
  CUSTOM: 'other',
};
