/**
 * Scope-Based English Leak Detector
 * Detects English proper nouns and glossary terms leaked into Thai text.
 * Safely ignores standard acronyms, system terms (HP, MP, EXP, USB, Wi-Fi), and units.
 */

export interface LeakItem {
  term: string;
  paragraphIndex: number;
}

export interface LeakDetectionResult {
  hasLeak: boolean;
  leaks: LeakItem[];
  repairedParagraphs?: string[];
}

// Universal abbreviations and gaming/fantasy terms that are intentionally kept in English
const ALLOWED_ACRONYMS = new Set([
  'HP', 'MP', 'SP', 'AP', 'EXP', 'LV', 'LVL', 'STR', 'AGI', 'INT', 'DEX', 'VIT',
  'NPC', 'PC', 'AI', 'UI', 'GUI', 'ID', 'VIP', 'OK', 'KO', 'BOSS', 'DPS', 'DOT',
  'GPU', 'CPU', 'RAM', 'VRAM', 'USB', 'SSD', 'HDD', 'SMS', 'URL', 'IP', 'WIFI',
  'WI-FI', 'DNA', 'RNA', 'FBI', 'CIA', 'NASA', 'PDF', 'APP', 'PIN', '3D', '2D',
  'VR', 'AR', 'MMO', 'RPG', 'MMORPG', 'PVP', 'PVE', 'AOE', 'CD', 'BUFF', 'DEBUFF'
]);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detects whether any entity or glossary term remains untranslated in the Thai paragraphs.
 * If glossary mapping exists for the leaked term, optionally repairs the text in-place.
 */
export function detectEnglishLeak(
  paragraphs: string[],
  glossary: Array<{ canonicalEn: string; canonicalTh: string }>
): LeakDetectionResult {
  if (!paragraphs || paragraphs.length === 0) {
    return { hasLeak: false, leaks: [] };
  }

  const leaks: LeakItem[] = [];
  const glossaryMap = new Map<string, string>();

  for (const g of glossary) {
    if (g.canonicalEn?.trim() && g.canonicalTh?.trim()) {
      glossaryMap.set(g.canonicalEn.trim().toLowerCase(), g.canonicalTh.trim());
    }
  }

  const repaired = [...paragraphs];

  paragraphs.forEach((text, pIdx) => {
    // 1. Check for specific glossary terms leaking
    for (const [enLower, thTarget] of glossaryMap.entries()) {
      if (ALLOWED_ACRONYMS.has(enLower.toUpperCase())) continue;

      const pattern = new RegExp(`\\b${escapeRegex(enLower)}\\b`, 'i');
      if (pattern.test(text)) {
        leaks.push({ term: enLower, paragraphIndex: pIdx });
        // Repair in repaired copy
        repaired[pIdx] = repaired[pIdx].replace(new RegExp(`\\b${escapeRegex(enLower)}\\b`, 'gi'), thTarget);
      }
    }

    // 2. Check for multi-word Capitalized English Names (e.g. "Sagres Greengrass")
    const capitalizedNamePattern = /\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/g;
    let match: RegExpExecArray | null;
    while ((match = capitalizedNamePattern.exec(text)) !== null) {
      const leakedName = match[1];
      if (!ALLOWED_ACRONYMS.has(leakedName.toUpperCase())) {
        if (!leaks.some((l) => l.paragraphIndex === pIdx && l.term.toLowerCase() === leakedName.toLowerCase())) {
          leaks.push({ term: leakedName, paragraphIndex: pIdx });
        }
      }
    }
  });

  return {
    hasLeak: leaks.length > 0,
    leaks,
    repairedParagraphs: repaired,
  };
}
