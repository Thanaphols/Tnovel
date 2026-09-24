import { prisma } from './prisma';
import { EntityType, ValidationStatus } from './enums';
import { translateParagraphsGoogle } from './googleTranslate';
import {
  escapeRegex,
  protectTerms,
  replaceTermsInParagraphs,
  replaceTermsInString,
  type GlossaryReplaceItem,
} from './nameReplacer';
import { preTranslateNormalize } from './preTranslate';

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

/** Where a glossary comes from: a novel (plus its fandom), or a fandom alone (model-test page). */
export type GlossarySource = string | { novelId?: string | null; fandomId?: string | null };

export interface GlossaryTerm {
  canonicalEn: string;
  canonicalTh: string;
  entityType: string;
  isLocked: boolean;
  category: string | null;
  aliases: string[];
  confidence: number;
}

const termKey = (t: { canonicalEn: string }) => t.canonicalEn.trim().toLowerCase();

/**
 * Precedence: novel locked > fandom > novel unlocked. A fic can deliberately override a fandom
 * name by locking it, but auto-discovered (unlocked) Google transliterations never beat curated
 * fandom terms.
 */
export function mergeGlossary(novelTerms: GlossaryTerm[], fandomTerms: GlossaryTerm[]): GlossaryTerm[] {
  const byKey = new Map<string, GlossaryTerm>();
  for (const t of novelTerms) if (!t.isLocked) byKey.set(termKey(t), t);
  for (const t of fandomTerms) byKey.set(termKey(t), t);
  for (const t of novelTerms) if (t.isLocked) byKey.set(termKey(t), t);
  return [...byKey.values()];
}

export async function loadGlossary(source: GlossarySource): Promise<GlossaryTerm[]> {
  const { novelId, fandomId: explicitFandomId } = typeof source === 'string' ? { novelId: source } : source;
  let fandomId = explicitFandomId ?? null;
  let novelTerms: GlossaryTerm[] = [];

  if (novelId) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { fandomId: true, glossaries: { include: { aliases: true } } },
    });
    fandomId = fandomId ?? novel?.fandomId ?? null;
    novelTerms = (novel?.glossaries ?? []).map((g) => ({
      canonicalEn: g.canonicalEn,
      canonicalTh: g.canonicalTh,
      entityType: g.entityType,
      isLocked: g.isLocked,
      category: g.category,
      aliases: g.aliases.map((a) => a.aliasEn),
      confidence: g.modelConfidence,
    }));
  }

  const fandomTerms: GlossaryTerm[] = fandomId
    ? (await prisma.fandomGlossary.findMany({ where: { fandomId } })).map((g) => ({
        canonicalEn: g.canonicalEn,
        canonicalTh: g.canonicalTh,
        entityType: g.entityType,
        isLocked: true, // curated, so it ranks with locked novel terms
        category: g.category,
        aliases: [],
        confidence: 1,
      }))
    : [];

  return mergeGlossary(novelTerms, fandomTerms);
}

/**
 * Filter and rank glossary terms (novel + its fandom) that actually appear in the chapter.
 * Word-boundary match, so short fandom names like "Lee" or "Sai" don't hit "sleep"/"said".
 * Caps at maxTerms to prevent LLM context explosion.
 */
export async function getRelevantGlossary(
  source: GlossarySource,
  paragraphsEn: string[],
  maxTerms: number = 20
): Promise<GlossaryTerm[]> {
  const all = await loadGlossary(source);
  if (all.length === 0) return [];

  const fullText = paragraphsEn.join('\n');
  const appears = (term: string) =>
    term.trim().length > 0 && new RegExp(`\\b${escapeRegex(term.trim())}\\b`, 'i').test(fullText);

  const matched = all.filter((g) => appears(g.canonicalEn) || g.aliases.some(appears));

  // Rank: locked/curated first, then multi-word, then confidence.
  matched.sort((a, b) => {
    if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1;
    const aMulti = a.canonicalEn.includes(' ');
    const bMulti = b.canonicalEn.includes(' ');
    if (aMulti !== bMulti) return aMulti ? -1 : 1;
    return b.confidence - a.confidence;
  });

  return matched.slice(0, maxTerms);
}

/** Polish-prompt shape of a glossary. */
export function toPromptGlossary(terms: GlossaryTerm[]) {
  return terms.map((g) => ({ termEn: g.canonicalEn, termTh: g.canonicalTh, category: g.category }));
}

const PROMPT_TERM_CAP = 30;

/**
 * Post-MT Validation Step: checks alignment, placeholder zero-leakage, and anti-bot responses.
 */
export function validatePostMtDraft(
  inputParagraphs: string[],
  translatedDraft: string[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (translatedDraft.length !== inputParagraphs.length) {
    errors.push(
      `Paragraph count mismatch: input has ${inputParagraphs.length}, draft has ${translatedDraft.length}`
    );
  }

  for (let i = 0; i < translatedDraft.length; i++) {
    const text = translatedDraft[i];
    const input = inputParagraphs[i];

    // Check placeholder token leak (e.g. ZXQ0, ZXQ1)
    if (/\bZXQ\d+\b/i.test(text)) {
      errors.push(`Token leak detected in paragraph ${i}: placeholder remained unmasked`);
    }

    // Check anti-bot response
    if (/(?:automated queries|unusual traffic|captcha)/i.test(text)) {
      errors.push(`Bot block indicator detected in paragraph ${i}`);
    }

    // Check non-empty: if input had characters, output should not be empty
    if (input && input.trim().length > 0 && (!text || text.trim().length === 0)) {
      errors.push(`Empty translation for non-empty paragraph ${i}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Google-translates paragraphs with every relevant glossary term locked to its Thai form, and
 * returns the (capped) relevant glossary for the polish prompt. Only the copy sent to Google is
 * substituted; callers keep storing the original English.
 */
export async function translateWithGlossary(
  source: GlossarySource | null,
  paragraphs: string[],
  onChunkProgress?: (done: number, total: number) => void
): Promise<{ draft: string[]; glossary: GlossaryTerm[] }> {
  const relevant = source ? await getRelevantGlossary(source, paragraphs, Infinity) : [];

  // Stage 2: Semantic Pre-translation normalization (Context Classification & Safety Gate)
  const { normalized, summary } = preTranslateNormalize(paragraphs, relevant);
  if (summary.normalizedCount > 0) {
    console.log(
      `[PreTranslate] Applied ${summary.normalizedCount} normalization(s) (${summary.normalizerVersion}):`,
      summary.decisions.map(
        (d) => `${d.ruleId}: "${d.originalText.slice(0, 40)}..." -> "${(d.transformedText || '').slice(0, 40)}..."`
      )
    );
  }

  // Stage 3: Glossary Protection (ZXQ tokens)
  const { protectedText, restore } = protectTerms(normalized, relevant);

  // Stage 4: Google Translate
  const rawDraft = await translateParagraphsGoogle(protectedText, onChunkProgress);
  const draft = restore(rawDraft);

  // Stage 4.5: Post-MT Validation Step
  const validation = validatePostMtDraft(paragraphs, draft);
  if (!validation.isValid) {
    console.warn(`[PreTranslate] Post-MT Validation warnings (${validation.errors.length}):`, validation.errors);
  }

  return { draft, glossary: relevant.slice(0, PROMPT_TERM_CAP) };
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

    // Novel + fandom terms: never shadow a curated fandom term with a Google transliteration.
    const existingSet = new Set((await loadGlossary(novelId)).map(termKey));
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

export interface ApplyGlossaryOptions {
  novelId: string;
  chapterIds?: string[];
  rangeStart?: number;
  rangeEnd?: number;
  customReplacements?: Array<{ from: string; to: string }>;
  onProgress?: (processed: number, total: number, replacedCount: number) => void;
}

export interface ApplyGlossaryResult {
  totalChapters: number;
  updatedChapters: number;
  totalReplacements: number;
  details: Array<{ chapterNumber: number; titleTh: string; replacements: number }>;
}

/**
 * Scan and replace glossary terms across translated chapters of a novel without re-translating.
 * Updates titleTh, contentTh, contentThGoogle, and contentThPolished in place.
 */
export async function applyGlossaryToNovelChapters(
  opts: ApplyGlossaryOptions
): Promise<ApplyGlossaryResult> {
  const { novelId, chapterIds, rangeStart, rangeEnd, customReplacements, onProgress } = opts;

  // 1. Load all glossary terms (novel + fandom)
  const allTerms = await loadGlossary(novelId);
  const replaceTerms: GlossaryReplaceItem[] = allTerms.map((t) => ({
    canonicalEn: t.canonicalEn,
    canonicalTh: t.canonicalTh,
    entityType: t.entityType,
    isLocked: t.isLocked,
  }));

  // Build list of aliases as additional custom replacements
  const effectiveCustomReplacements: Array<{ from: string; to: string }> = [
    ...(customReplacements || []),
  ];

  for (const t of allTerms) {
    if (t.aliases && t.aliases.length > 0) {
      for (const a of t.aliases) {
        if (a && a.trim() && a.trim() !== t.canonicalTh.trim()) {
          effectiveCustomReplacements.push({ from: a.trim(), to: t.canonicalTh.trim() });
        }
      }
    }
  }

  // 2. Fetch target chapters
  const whereClause: any = {
    novelId,
    deletedAt: null,
    contentTh: { not: null },
  };

  if (chapterIds && chapterIds.length > 0) {
    whereClause.id = { in: chapterIds };
  } else if (rangeStart !== undefined && rangeEnd !== undefined) {
    whereClause.chapterNumber = { gte: rangeStart, lte: rangeEnd };
  }

  const chapters = await prisma.chapter.findMany({
    where: whereClause,
    orderBy: { chapterNumber: 'asc' },
    select: {
      id: true,
      chapterNumber: true,
      titleTh: true,
      contentTh: true,
      contentThGoogle: true,
      contentThPolished: true,
      status: true,
    },
  });

  const details: Array<{ chapterNumber: number; titleTh: string; replacements: number }> = [];
  let updatedChapters = 0;
  let totalReplacements = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chap = chapters[i];
    let chapReplacements = 0;

    // A. Replace in titleTh
    let newTitleTh = chap.titleTh;
    if (chap.titleTh) {
      const res = replaceTermsInString(chap.titleTh, replaceTerms, effectiveCustomReplacements);
      newTitleTh = res.text;
      chapReplacements += res.count;
    }

    // B. Replace in contentTh
    let newContentThJson = chap.contentTh;
    if (chap.contentTh) {
      try {
        const paras: string[] = JSON.parse(chap.contentTh);
        if (Array.isArray(paras) && paras.length > 0) {
          const res = replaceTermsInParagraphs(paras, replaceTerms, effectiveCustomReplacements);
          if (res.count > 0) {
            newContentThJson = JSON.stringify(res.paragraphs);
            chapReplacements += res.count;
          }
        }
      } catch {}
    }

    // C. Replace in contentThGoogle
    let newContentThGoogleJson = chap.contentThGoogle;
    if (chap.contentThGoogle) {
      try {
        const paras: string[] = JSON.parse(chap.contentThGoogle);
        if (Array.isArray(paras) && paras.length > 0) {
          const res = replaceTermsInParagraphs(paras, replaceTerms, effectiveCustomReplacements);
          if (res.count > 0) {
            newContentThGoogleJson = JSON.stringify(res.paragraphs);
            chapReplacements += res.count;
          }
        }
      } catch {}
    }

    // D. Replace in contentThPolished
    let newContentThPolishedJson = chap.contentThPolished;
    if (chap.contentThPolished) {
      try {
        const paras: string[] = JSON.parse(chap.contentThPolished);
        if (Array.isArray(paras) && paras.length > 0) {
          const res = replaceTermsInParagraphs(paras, replaceTerms, effectiveCustomReplacements);
          if (res.count > 0) {
            newContentThPolishedJson = JSON.stringify(res.paragraphs);
            chapReplacements += res.count;
          }
        }
      } catch {}
    }

    if (chapReplacements > 0) {
      await prisma.chapter.update({
        where: { id: chap.id },
        data: {
          titleTh: newTitleTh,
          contentTh: newContentThJson,
          contentThGoogle: newContentThGoogleJson,
          contentThPolished: newContentThPolishedJson,
        },
      });

      updatedChapters++;
      totalReplacements += chapReplacements;

      const io = (global as any).io;
      if (io) {
        io.emit('chapter:updated', {
          chapterId: chap.id,
          novelId,
          titleTh: newTitleTh,
          status: chap.status,
        });
      }
    }

    details.push({
      chapterNumber: chap.chapterNumber,
      titleTh: newTitleTh,
      replacements: chapReplacements,
    });

    if (onProgress) {
      onProgress(i + 1, chapters.length, totalReplacements);
    }
  }

  return {
    totalChapters: chapters.length,
    updatedChapters,
    totalReplacements,
    details,
  };
}


/**
 * Moves novel terms into the novel's fandom (upsert; promoted spelling wins) and deletes the
 * novel copies in one transaction, so a term lives in exactly one place. Ids not belonging to
 * this novel are ignored. Returns the moved terms.
 */
export async function promoteNovelTerms(novelId: string, fandomId: string, glossaryIds: string[]) {
  const terms = await prisma.novelGlossary.findMany({ where: { id: { in: glossaryIds }, novelId } });
  if (terms.length === 0) return terms;

  await prisma.$transaction([
    ...terms.map((t) =>
      prisma.fandomGlossary.upsert({
        where: { fandomId_canonicalEn: { fandomId, canonicalEn: t.canonicalEn } },
        create: { fandomId, canonicalEn: t.canonicalEn, canonicalTh: t.canonicalTh, category: t.category, entityType: t.entityType },
        update: { canonicalTh: t.canonicalTh, category: t.category, entityType: t.entityType },
      })
    ),
    prisma.novelGlossary.deleteMany({ where: { id: { in: terms.map((t) => t.id) } } }),
  ]);
  return terms;
}
