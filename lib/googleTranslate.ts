// ponytail: this is the endpoint Chrome's built-in translator uses, not a documented public
// API — no key, no daily quota, ~1.6s for a whole chapter. It can be rate-limited or pulled
// at any time; move to Google Cloud Translation API (paid) if that starts happening.
const ENDPOINT = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex';

// Without a browser UA the endpoint answers "Sorry... automated queries" instead of JSON.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Measured ceiling: 400 items / 69k chars still returned 1:1 in one request. Stay well under it.
const MAX_ITEMS_PER_REQUEST = 150;
const MAX_CHARS_PER_REQUEST = 30000;
const DELAY_BETWEEN_REQUESTS_MS = 200;

function chunk(items: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let chars = 0;

  for (const item of items) {
    if (current.length > 0 && (current.length >= MAX_ITEMS_PER_REQUEST || chars + item.length > MAX_CHARS_PER_REQUEST)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function translateChunk(texts: string[], attempt = 1): Promise<string[]> {
  const body = texts.map((t) => 'q=' + encodeURIComponent(t)).join('&');

  try {
    const res = await fetch(ENDPOINT + '&sl=en&tl=th', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`Google Translate returned HTTP ${res.status}`);

    const parsed = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) throw new Error('Google Translate returned an unexpected shape');

    // Each entry is normally a plain string, but the endpoint sometimes wraps it in an array.
    const out = parsed.map((entry: any) => (Array.isArray(entry) ? String(entry[0] ?? '') : String(entry ?? '')));

    if (out.length !== texts.length) {
      throw new Error(`Google Translate returned ${out.length} items for ${texts.length} inputs`);
    }
    return out;
  } catch (err: any) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500));
      return translateChunk(texts, attempt + 1);
    }
    // Deliberately no English fallback: a caller that silently stores the source text as the
    // translation is how "[แปลผิดพลาด] ..." ended up saved in the database.
    throw err;
  }
}

/**
 * Translates paragraphs EN -> TH, preserving order and length exactly.
 * Throws if the service fails — callers decide what to do rather than getting fake output.
 */
export async function translateParagraphsGoogle(
  paragraphs: string[],
  onChunkProgress?: (done: number, total: number) => void
): Promise<string[]> {
  // Blank entries must not be sent, or the response shifts out of alignment for the whole chapter.
  const indexed = paragraphs.map((text, index) => ({ text, index })).filter((p) => p.text.trim().length > 0);

  const result = [...paragraphs];
  const chunks = chunk(indexed.map((p) => p.text));

  let done = 0;
  let cursor = 0;

  for (const [i, texts] of chunks.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));

    const translated = await translateChunk(texts);
    for (const text of translated) {
      result[indexed[cursor].index] = text;
      cursor++;
    }

    done += texts.length;
    onChunkProgress?.(done, indexed.length);
  }

  return result;
}

export async function translateTitleGoogle(titleEn: string): Promise<string> {
  const [translated] = await translateParagraphsGoogle([titleEn]);
  return translated || titleEn;
}
