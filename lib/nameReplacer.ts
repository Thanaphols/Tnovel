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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  // Filter and sort terms: Longest Match First
  const validTerms = glossary
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
