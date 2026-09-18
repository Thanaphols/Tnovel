/**
 * Client & server safe utility functions for Thai text processing and Dek-D deobfuscation.
 */

export function isThaiText(text: string | string[] | undefined | null): boolean {
  if (!text) return false;
  const sample = Array.isArray(text) ? text.slice(0, 5).join(' ') : text;
  const thaiChars = (sample.match(/[\u0E00-\u0E7F]/g) || []).length;
  return thaiChars > 10 || (sample.length > 0 && thaiChars / sample.length > 0.15);
}

/**
 * Reverses Dek-D font obfuscation / anti-copy scrambling.
 * Dek-D shifts the first 27 Thai consonants (0x0E01 - 0x0E1B: ก to ป) by +0x64 (+100)
 * into unassigned Unicode code points (0x0E65 - 0x0E7F) and inserts zero-width spaces (\u200B).
 */
export function deobfuscateThaiText(text: string): string {
  if (!text || typeof text !== 'string') return text || '';
  // 1. Remove zero-width spaces (\u200B-\u200D, \uFEFF, &ZeroWidthSpace;, soft hyphen \u00AD)
  let cleaned = text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/&ZeroWidthSpace;/g, '');

  // 2. Decode shifted Thai consonants back to standard Unicode (0x0E65-0x0E7F -> 0x0E01-0x0E1B)
  cleaned = cleaned.replace(/[\u0E65-\u0E7F]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0x64);
  });

  return cleaned;
}
