export interface NovelCategory {
  id: string;
  nameTh: string;
  nameEn: string;
  badgeClass: string;
}

export const NOVEL_CATEGORIES: NovelCategory[] = [
  {
    id: 'fantasy',
    nameTh: 'แฟนตาซี',
    nameEn: 'Fantasy',
    badgeClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  },
  {
    id: 'wuxia',
    nameTh: 'กำลังภายใน / เซียน',
    nameEn: 'Wuxia / Xianxia',
    badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'action',
    nameTh: 'แอ็กชัน / ผจญภัย',
    nameEn: 'Action / Adventure',
    badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
  {
    id: 'isekai',
    nameTh: 'เกิดใหม่ / ต่างโลก',
    nameEn: 'Isekai / Reincarnation',
    badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'system',
    nameTh: 'ระบบ / เกมออนไลน์',
    nameEn: 'System / LitRPG',
    badgeClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'romance',
    nameTh: 'โรแมนติก / รัก',
    nameEn: 'Romance',
    badgeClass: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  },
  {
    id: 'scifi',
    nameTh: 'ไซไฟ / โลกอนาคต',
    nameEn: 'Sci-Fi',
    badgeClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  },
  {
    id: 'thriller',
    nameTh: 'ระทึกขวัญ / สยองขวัญ',
    nameEn: 'Thriller / Horror',
    badgeClass: 'text-red-400 bg-red-500/10 border-red-500/20',
  },
  {
    id: 'mystery',
    nameTh: 'สืบสวนสอบสวน',
    nameEn: 'Mystery',
    badgeClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  },
  {
    id: 'slice_of_life',
    nameTh: 'ชีวิตประจำวัน / คอมเมดี้',
    nameEn: 'Slice of Life / Comedy',
    badgeClass: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  },
  {
    id: 'historical',
    nameTh: 'ประวัติศาสตร์ / สงคราม',
    nameEn: 'Historical',
    badgeClass: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
  {
    id: 'other',
    nameTh: 'อื่นๆ',
    nameEn: 'Other',
    badgeClass: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  },
];

export function getCategoryById(id?: string | null): NovelCategory | undefined {
  if (!id) return undefined;
  return NOVEL_CATEGORIES.find((c) => c.id === id || c.nameTh === id || c.nameEn === id);
}

export function getCategoryLabel(id?: string | null, lang: 'th' | 'en' = 'th'): string {
  const cat = getCategoryById(id);
  if (!cat) return id || '';
  return lang === 'en' ? cat.nameEn : cat.nameTh;
}

export function getCategoryBadgeClass(id?: string | null): string {
  const cat = getCategoryById(id);
  return cat ? cat.badgeClass : 'text-slate-400 bg-slate-500/10 border-slate-500/20';
}
