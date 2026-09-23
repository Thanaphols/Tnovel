export interface GlossaryReplaceItem {
  canonicalEn: string;
  canonicalTh: string;
  entityType?: string;
  isLocked?: boolean;
}

// Common English words that double as names, verbs, or common nouns
// These MUST NOT be replaced by naive regex to prevent semantic destruction
const AMBIGUOUS_SINGLE_WORDS = new Set([
  'will', 'chase', 'rose', 'may', 'can', 'bill', 'bob', 'mark', 'jack',
  'page', 'hope', 'grace', 'faith', 'summer', 'autumn', 'spring', 'winter',
  'grant', 'miles', 'cook', 'baker', 'butler', 'smith', 'hunter', 'fisher',
  'dean', 'king', 'lord', 'queen', 'prince', 'knight', 'major', 'general',
  'august', 'march', 'short', 'long', 'brown', 'black', 'white', 'gray',
  'stone', 'wood', 'glen', 'cliff', 'ford', 'dale', 'brook', 'river'
]);

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Terms safe to substitute blindly, longest first so "Albus Dumbledore" wins over "Dumbledore". */
function selectSafeTerms(glossary: GlossaryReplaceItem[]): GlossaryReplaceItem[] {
  return glossary
    .filter((g) => {
      if (!g.canonicalEn?.trim() || !g.canonicalTh?.trim()) return false;
      const termLower = g.canonicalEn.trim().toLowerCase();
      const isMultiWord = termLower.includes(' ');

      // Multi-word entities are safe
      if (isMultiWord) return true;

      // Single-word terms: Skip if ambiguous common English word
      if (AMBIGUOUS_SINGLE_WORDS.has(termLower)) {
        return false;
      }

      // Allow unambiguous single words if length >= 3
      return termLower.length >= 3;
    })
    .sort((a, b) => b.canonicalEn.trim().length - a.canonicalEn.trim().length);
}

/**
 * Semantic-Safe Name Replacer
 * Operates on string[] (paragraphs) only.
 * Applies Longest-Match-First sorting, Word Boundary (\b), and skips ambiguous single words.
 */
export function applySafeNameReplacer(
  paragraphs: string[],
  glossary: GlossaryReplaceItem[]
): string[] {
  if (!paragraphs || paragraphs.length === 0 || !glossary || glossary.length === 0) {
    return paragraphs;
  }

  const validTerms = selectSafeTerms(glossary);

  if (validTerms.length === 0) {
    return paragraphs;
  }

  return paragraphs.map((paragraph) => {
    let replaced = paragraph;

    for (const item of validTerms) {
      const en = item.canonicalEn.trim();
      const th = item.canonicalTh.trim();

      // Use Word Boundary \b for ASCII words
      const pattern = new RegExp(`\\b${escapeRegex(en)}\\b`, 'g');
      replaced = replaced.replace(pattern, th);
    }

    return replaced;
  });
}

const PLACEHOLDER = /ZXQ(\d+)/g;

/**
 * Shields glossary terms from Google Translate. Thai inserted straight into the English gets
 * rewritten by Google ("ดัมเบิลดอร์" -> "ดัมพอร์ตดอร์"), but an opaque token like ZXQ0 passes
 * through untouched, so terms become tokens before Google and are swapped to Thai after.
 * Same safety filter as applySafeNameReplacer (word boundary, case-sensitive, no ambiguous words).
 */
export function protectTerms(
  paragraphs: string[],
  glossary: GlossaryReplaceItem[]
): { protectedText: string[]; restore: (translated: string[]) => string[] } {
  const terms = selectSafeTerms(glossary).map((t) => ({
    th: t.canonicalTh.trim(),
    pattern: new RegExp(`\\b${escapeRegex(t.canonicalEn.trim())}\\b`, 'g'),
  }));
  const tokens: string[] = []; // token index -> Thai term

  const protectedText = paragraphs.map((p) => {
    let out = p;
    for (const t of terms) {
      out = out.replace(t.pattern, () => {
        let i = tokens.indexOf(t.th);
        if (i === -1) i = tokens.push(t.th) - 1;
        return `ZXQ${i}`;
      });
    }
    return out;
  });

  const restore = (translated: string[]) =>
    translated.map((s) => s.replace(PLACEHOLDER, (m, n) => tokens[Number(n)] ?? m));

  return { protectedText, restore };
}
