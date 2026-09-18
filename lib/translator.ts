import { GoogleGenerativeAI } from '@google/generative-ai';

// MTPE: Google Translate gives a complete, aligned Thai draft; Gemini only edits the prose.
const POLISH_PROMPT = `คุณคือบรรณาธิการเกลาสำนวนนิยายแปลภาษาไทยมืออาชีพ
Input คือ JSON Array ของ object {"en": ต้นฉบับภาษาอังกฤษ, "th": ร่างคำแปลจาก Google Translate} เรียงตามย่อหน้า (ย่อหน้าแรกคือชื่อตอน)

กฎ:
1. ยึดความหมายจาก "en" เป็นหลัก แก้จุดที่ร่าง "th" แปลผิดหรือแปลคำต่อคำ
2. เกลา "th" ให้เป็นภาษาวรรณกรรมไทยที่อ่านลื่นไหล เป็นธรรมชาติ ไม่แข็งทื่อ
3. ใช้สรรพนามให้เข้ากับตัวละครและแนวเรื่อง (เช่น ข้า-เจ้า, ฉัน-นาย) และคงไว้สม่ำเสมอ
4. แปลงสำนวนหรือสแลงอังกฤษเป็นสำนวนไทยที่ความหมายเทียบเท่า
5. ห้ามตัด ห้ามสรุป ห้ามรวมหรือแยกย่อหน้า ห้ามเพิ่มเนื้อหาที่ไม่มีในต้นฉบับ
6. ตอบกลับเป็น JSON Array ของ String เท่านั้น จำนวนสมาชิกต้องเท่ากับ input พอดี ห้ามมีข้อความอื่น`;

const BATCH_SIZE = 75;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
}

async function callGeminiWithRetry(model: any, prompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await model.generateContent(prompt);
      return response.response.text();
    } catch (err: any) {
      const isRateLimit =
        err.message?.includes('429') ||
        err.message?.includes('Quota exceeded') ||
        err.message?.includes('Too Many Requests') ||
        err.status === 429;

      // The API says how long to wait. A per-day quota never clears inside a retry loop, so
      // fail fast instead of burning 30s of backoff per call.
      const retryMatch = /retry in ([\d.]+)s/i.exec(err.message || '');
      const suggestedMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : attempt * 5000;

      if (isRateLimit && attempt < maxRetries && suggestedMs <= 60000) {
        console.warn(`[Gemini 429] Retrying in ${Math.round(suggestedMs / 1000)}s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, suggestedMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Gemini API quota exceeded after retries.');
}

/**
 * Accepts Gemini's reply only if it lines up 1:1 with the draft; otherwise returns null so the
 * caller keeps the draft. Blank draft paragraphs stay blank so alignment with contentEn holds.
 */
export function parsePolishedBatch(rawText: string, draft: string[]): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== draft.length) return null;
  if (!parsed.every((p) => typeof p === 'string')) return null;
  return parsed.map((p: string, i) => (draft[i].trim() === '' ? draft[i] : p.trim() || draft[i]));
}

/**
 * Polishes a Google Translate draft with Gemini, batch by batch. A batch that fails (quota,
 * bad JSON, paragraph count drift) keeps its draft, so the result is always readable Thai.
 */
export async function polishParagraphs(
  en: string[],
  thDraft: string[]
): Promise<{ paragraphs: string[]; failedBatches: number; totalBatches: number }> {
  const genAI = getGeminiClient();
  if (!genAI) throw new Error('ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์');

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  });

  const paragraphs: string[] = [];
  let failedBatches = 0;
  const totalBatches = Math.ceil(thDraft.length / BATCH_SIZE);

  for (let start = 0; start < thDraft.length; start += BATCH_SIZE) {
    const draft = thDraft.slice(start, start + BATCH_SIZE);
    const pairs = draft.map((th, i) => ({ en: en[start + i] ?? '', th }));

    let polished: string[] | null = null;
    try {
      const rawText = await callGeminiWithRetry(model, `${POLISH_PROMPT}\n\n${JSON.stringify(pairs)}`);
      polished = parsePolishedBatch(rawText, draft);
      if (!polished) console.warn(`[Polish] batch at ${start} came back misaligned, keeping draft`);
    } catch (err: any) {
      console.error(`[Polish] batch at ${start} failed:`, err.message || err);
    }

    if (!polished) failedBatches++;
    paragraphs.push(...(polished ?? draft));
  }

  return { paragraphs, failedBatches, totalBatches };
}
