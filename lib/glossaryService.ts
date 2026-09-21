import { prisma } from './prisma';
import { EntityType, ValidationStatus } from './enums';
import { translateParagraphsGoogle } from './googleTranslate';

const COMMON_PRONOUNS_AND_STOPWORDS = new Set([
  'he', 'she', 'they', 'it', 'we', 'you', 'i', 'him', 'her', 'them', 'his', 'hers',
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which', 'what', 'there', 'here',
  'doctor', 'captain', 'master', 'lord', 'king', 'queen', 'prince', 'mr', 'mrs', 'ms',
  'after', 'before', 'then', 'when', 'while', 'suddenly', 'meanwhile', 'however', 'although',
  'chapter', 'part', 'page', 'book', 'one', 'two', 'three', 'first', 'second', 'third'
]);

const ALLOWED_ACRONYMS = new Set([
  'HP', 'MP', 'SP', 'AP', 'EXP', 'LV', 'LVL', 'STR', 'AGI', 'INT', 'DEX', 'VIT',
  'NPC', 'PC', 'AI', 'UI', 'GUI', 'ID', 'VIP', 'OK', 'KO', 'BOSS', 'DPS', 'DOT',
  'GPU', 'CPU', 'RAM', 'VRAM', 'USB', 'SSD', 'HDD', 'SMS', 'URL', 'IP', 'WIFI',
  'WI-FI', 'DNA', 'RNA', 'FBI', 'CIA', 'NASA', 'PDF', 'APP', 'PIN', '3D', '2D'
]);

export interface NewDiscoveredEntity {
  source: string;
  translation: string;
  type?: string;
  confidence?: number;
}

export function validateNewEntity(entity: NewDiscoveredEntity): {
  isValid: boolean;
  status: ValidationStatus;
  reason?: string;
} {
  const source = entity.source?.trim() || '';
  const translation = entity.translation?.trim() || '';

  if (!source || !translation) {
    return { isValid: false, status: ValidationStatus.REJECTED, reason: 'Empty source or translation' };
  }

  if (source.length < 2 || translation.length < 2) {
    return { isValid: false, status: ValidationStatus.REJECTED, reason: 'Length too short (< 2 chars)' };
  }

  const lowerSource = source.toLowerCase();
  if (COMMON_PRONOUNS_AND_STOPWORDS.has(lowerSource)) {
    return { isValid: false, status: ValidationStatus.REJECTED, reason: 'Common pronoun or standalone title' };
  }

  const conf = entity.confidence ?? 0.9;
  const isMultiWord = source.includes(' ');

  if (conf >= 0.85 && (isMultiWord || source.length >= 4)) {
    return { isValid: true, status: ValidationStatus.AUTO_APPROVED };
  }

  return { isValid: true, status: ValidationStatus.REVIEW_REQUIRED };
}

/**
 * Filter and rank relevant glossary terms that actually appear in the chapter content.
 * Caps at 20 terms to prevent LLM context explosion.
 */
export async function getRelevantGlossary(
  novelId: string,
  paragraphsEn: string[],
  maxTerms: number = 20
): Promise<Array<{ canonicalEn: string; canonicalTh: string; entityType: string; isLocked: boolean }>> {
  const allGlossaries = await prisma.novelGlossary.findMany({
    where: { novelId },
    include: { aliases: true },
  });

  if (allGlossaries.length === 0) return [];

  const fullText = paragraphsEn.join(' ').toLowerCase();

  const matched = allGlossaries.filter((g) => {
    const term = g.canonicalEn.trim().toLowerCase();
    if (fullText.includes(term)) return true;

    // Check aliases
    for (const a of g.aliases) {
      if (fullText.includes(a.aliasEn.trim().toLowerCase())) return true;
    }
    return false;
  });

  // Rank matches:
  // 1. isLocked (Priority 1)
  // 2. Multi-word (Priority 2)
  // 3. High confidence
  matched.sort((a, b) => {
    if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1;
    const aMulti = a.canonicalEn.includes(' ');
    const bMulti = b.canonicalEn.includes(' ');
    if (aMulti !== bMulti) return aMulti ? -1 : 1;
    return b.modelConfidence - a.modelConfidence;
  });

  return matched.slice(0, maxTerms).map((g) => ({
    canonicalEn: g.canonicalEn,
    canonicalTh: g.canonicalTh,
    entityType: g.entityType,
    isLocked: g.isLocked,
  }));
}

/**
 * Persist newly discovered entities from AI into the database.
 * Never overwrites locked terms.
 */
export async function saveDiscoveredGlossaryEntities(
  novelId: string,
  entities: NewDiscoveredEntity[]
): Promise<number> {
  if (!entities || entities.length === 0) return 0;

  let savedCount = 0;
  for (const item of entities) {
    const validation = validateNewEntity(item);
    if (!validation.isValid) continue;

    const source = item.source.trim();
    const translation = item.translation.trim();

    // Check if term already exists
    const existing = await prisma.novelGlossary.findUnique({
      where: { novelId_canonicalEn: { novelId, canonicalEn: source } },
    });

    if (existing) {
      // If locked, NEVER overwrite
      if (existing.isLocked) continue;

      // If pending and new confidence is higher, update
      if (existing.validationStatus === ValidationStatus.PENDING && (item.confidence ?? 0.9) > existing.modelConfidence) {
        await prisma.novelGlossary.update({
          where: { id: existing.id },
          data: {
            canonicalTh: translation,
            modelConfidence: item.confidence ?? existing.modelConfidence,
            validationStatus: validation.status,
          },
        });
      }
    } else {
      // Insert new term
      let entityType = EntityType.CHARACTER;
      if (item.type && Object.values(EntityType).includes(item.type as any)) {
        entityType = item.type as any;
      }

      await prisma.novelGlossary.create({
        data: {
          novelId,
          canonicalEn: source,
          canonicalTh: translation,
          entityType,
          modelConfidence: item.confidence ?? 0.9,
          validationStatus: validation.status,
          isLocked: false,
        },
      });
      savedCount++;
    }
  }

  return savedCount;
}

/**
 * Extracts potential proper noun entities (characters, locations, etc.) from English text paragraphs.
 */
export function extractCandidateEntities(paragraphsEn: string[]): string[] {
  const candidates = new Set<string>();
  const wordFreq = new Map<string, number>();

  for (const text of paragraphsEn) {
    if (!text) continue;

    // 1. Multi-word Capitalized Proper Nouns (e.g. "Sagres Greengrass", "Albus Dumbledore")
    const multiPattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\b/g;
    let match: RegExpExecArray | null;
    while ((match = multiPattern.exec(text)) !== null) {
      const phrase = match[1].trim();
      const lower = phrase.toLowerCase();
      const words = lower.split(' ');
      if (!words.some((w) => COMMON_PRONOUNS_AND_STOPWORDS.has(w))) {
        candidates.add(phrase);
      }
    }

    // 2. Single-word capitalized words (mid-sentence, preceded by lowercase or punctuation)
    const midSentencePattern = /(?:[a-z,;:\"\'\“]\s+)([A-Z][a-z]{3,})\b/g;
    while ((match = midSentencePattern.exec(text)) !== null) {
      const word = match[1].trim();
      const lower = word.toLowerCase();
      if (!COMMON_PRONOUNS_AND_STOPWORDS.has(lower) && !ALLOWED_ACRONYMS.has(word.toUpperCase())) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }
  }

  // Add frequent single-word proper nouns (frequency >= 2)
  for (const [word, freq] of wordFreq.entries()) {
    if (freq >= 2) {
      candidates.add(word);
    }
  }

  return Array.from(candidates);
}

/**
 * Automatically discovers new character & location entities from English paragraphs,
 * transliterates them via Google Translate, and persists them into NovelGlossary.
 * Never overwrites locked terms.
 */
export async function autoDiscoverAndSaveGlossary(
  novelId: string,
  paragraphsEn: string[]
): Promise<number> {
  if (!paragraphsEn || paragraphsEn.length === 0) return 0;

  try {
    const candidates = extractCandidateEntities(paragraphsEn);
    if (candidates.length === 0) return 0;

    const existingGlossaries = await prisma.novelGlossary.findMany({
      where: { novelId },
      select: { canonicalEn: true },
    });
    const existingSet = new Set(existingGlossaries.map((g) => g.canonicalEn.toLowerCase()));
    const newCandidates = candidates.filter((c) => !existingSet.has(c.toLowerCase()));

    if (newCandidates.length === 0) return 0;

    // Limit to top 25 candidates per chapter to keep transliteration fast (< 500ms)
    const toProcess = newCandidates.slice(0, 25);
    const transliterated = await translateParagraphsGoogle(toProcess);

    const entitiesToSave: NewDiscoveredEntity[] = toProcess.map((en, i) => {
      const th = transliterated[i]?.trim();
      const isMulti = en.includes(' ');
      let type: EntityType = EntityType.CHARACTER;
      const lower = en.toLowerCase();
      if (
        lower.includes('prison') ||
        lower.includes('castle') ||
        lower.includes('school') ||
        lower.includes('sea') ||
        lower.includes('island') ||
        lower.includes('hall') ||
        lower.includes('tower') ||
        lower.includes('forest')
      ) {
        type = EntityType.LOCATION;
      }
      return {
        source: en,
        translation: th || en,
        type,
        confidence: isMulti ? 0.95 : 0.85,
      };
    });

    const saved = await saveDiscoveredGlossaryEntities(novelId, entitiesToSave);
    if (saved > 0) {
      console.log(`[GlossaryAutoDiscover] Novel ${novelId}: Discovered and saved ${saved} new entities.`);
    }
    return saved;
  } catch (err: any) {
    console.warn('[GlossaryAutoDiscover] Failed to discover entities:', err.message || err);
    return 0;
  }
}

