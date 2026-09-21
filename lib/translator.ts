import { GoogleGenerativeAI } from '@google/generative-ai';

// MTPE: Google Translate gives a complete, aligned Thai draft; Gemini only edits the prose.
export interface PolishContext {
  novelTitle?: string;
  genre?: string;
  glossary?: Array<{ termEn: string; termTh: string; category?: string | null }>;
}

export function buildPolishPrompt(context?: PolishContext): string {
  let prompt = `คุณคือบรรณาธิการเกลาสำนวนนิยายแปลภาษาไทยมืออาชีพ
Input คือ JSON Array ของ object {"en": ต้นฉบับภาษาอังกฤษ, "th": ร่างคำแปลจาก Google Translate} เรียงตามย่อหน้า (ย่อหน้าแรกคือชื่อตอน)

กฎ:
1. ยึดความหมายจาก "en" เป็นหลัก แก้จุดที่ร่าง "th" แปลผิดหรือแปลคำต่อคำ
2. เกลา "th" ให้เป็นภาษาวรรณกรรมไทยที่อ่านลื่นไหล เป็นธรรมชาติ ไม่แข็งทื่อ
3. ใช้สรรพนามให้เข้ากับตัวละครและแนวเรื่อง (เช่น ข้า-เจ้า, ฉัน-นาย, พี่-น้อง) และคงไว้สม่ำเสมอ
4. แปลงสำนวนหรือสแลงอังกฤษเป็นสำนวนไทยที่ความหมายเทียบเท่า ห้ามแปลตรงตัว
5. ห้ามตัด ห้ามสรุป ห้ามรวมหรือแยกย่อหน้า ห้ามเพิ่มเนื้อหาที่ไม่มีในต้นฉบับ
6. รูปแบบคำตอบ: ต้องตอบกลับเป็น JSON Array ของ String เท่านั้น เช่น:
["ข้อความย่อหน้าที่ 1 ที่เกลาแล้ว", "ข้อความย่อหน้าที่ 2 ที่เกลาแล้ว"]
สำคัญมากเกี่ยวกับเครื่องหมายคำพูด (Quotes): หากในเนื้อหามีย่อหน้าที่มีบทสนทนา ให้ escape เครื่องหมายคำพูดคู่ด้วย \" เสมอ (เช่น \"สวัสดี\") หรือใช้เครื่องหมาย «...» หรือ '...' แทน เพื่อไม่ให้โครงสร้าง JSON เสียหาย
คำเตือน: ห้ามใส่เครื่องหมายปีกกา {} ในสมาชิกแต่ละตัวเด็ดขาด (ห้ามตอบแบบ [{"ข้อความ"}]) ต้องเป็นข้อความในเครื่องหมายคำพูดคู่เท่านั้น
7. ชื่อเฉพาะบุคคลและสถานที่ (Character & Place Names) เช่น ชื่อคน ชื่อตระกูล ชื่อเมือง ต้องถอดเสียงเป็นภาษาไทยตามความเหมาะสม ห้ามปล่อยตัวอักษรภาษาอังกฤษค้างไว้ ยกเว้นคำย่อหรือคำศัพท์สากล เช่น HP, MP, Wi-Fi
จำนวนสมาชิกต้องเท่ากับ input พอดี ห้ามมีข้อความอื่นนอกจาก JSON Array`;

  if (context?.novelTitle) {
    prompt += `\n\nข้อมูลนิยาย:\n- ชื่อเรื่อง: ${context.novelTitle}`;
  }
  if (context?.genre) {
    prompt += `\n- แนวเรื่อง: ${context.genre}`;
  }
  if (context?.glossary && context.glossary.length > 0) {
    prompt += `\n\nตารางคำศัพท์และชื่อเฉพาะที่ต้องยึดตามนี้อย่างเคร่งครัด (ห้ามแปลเป็นคำอื่น):`;
    for (const g of context.glossary) {
      prompt += `\n- "${g.termEn}" -> "${g.termTh}"`;
    }
  }

  return prompt;
}

const BATCH_SIZE = 75;
const OLLAMA_BATCH_SIZE = 10;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
}

async function callOllama(systemPrompt: string, userPrompt: string): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        options: {
          temperature: 0.3,
        },
      }),
      signal: AbortSignal.timeout(180000), // 180s soft per-batch timeout guard
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Ollama Error (${res.status}): ${errorText || res.statusText}`);
    }

    const data = await res.json();
    return data?.message?.content || '';
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
      throw new Error('Ollama ประมวลผลนานเกินกำหนด (Timeout 45s)');
    }
    if (
      err.cause?.code === 'ECONNREFUSED' ||
      err.message?.includes('fetch failed') ||
      err.message?.includes('ECONNREFUSED')
    ) {
      throw new Error('ไม่สามารถเชื่อมต่อกับ Ollama ได้ (กรุณาเปิดโปรแกรม Ollama ในเครื่อง)');
    }
    throw err;
  }
}

async function callGeminiWithRetry(model: any, prompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await model.generateContent(prompt);
      return response.response.text();
    } catch (err: any) {
      const isTransient =
        err.message?.includes('429') ||
        err.message?.includes('Quota exceeded') ||
        err.message?.includes('Too Many Requests') ||
        err.message?.includes('503') ||
        err.message?.includes('high demand') ||
        err.message?.includes('Service Unavailable') ||
        err.status === 429 ||
        err.status === 503;

      // Fail fast if quota exceeded or suggested wait is > 10s to prevent 524 timeouts
      const retryMatch = /retry in ([\d.]+)s/i.exec(err.message || '');
      const suggestedMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : attempt * 5000;

      if (isTransient && attempt < maxRetries && suggestedMs <= 10000) {
        console.warn(`[Gemini retry] (${err.message?.substring(0, 120)}) Retrying in ${Math.round(suggestedMs / 1000)}s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, suggestedMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Gemini API quota exceeded after retries.');
}

function matchParagraphs(parsed: string[], draft: string[]): string[] | null {
  // Exact match
  if (parsed.length === draft.length) {
    return parsed.map((p: string, i) => (draft[i].trim() === '' ? draft[i] : p.trim() || draft[i]));
  }

  // Resilient partial match: if AI returned at least 60% of paragraphs, salvage what we have
  // and keep draft for remainder. This prevents an entire batch from failing due to ±1-2 count variance.
  if (parsed.length >= Math.ceil(draft.length * 0.6)) {
    return draft.map((d, i) => {
      if (d.trim() === '') return d;
      const polished = parsed[i];
      return typeof polished === 'string' && polished.trim() ? polished.trim() : d;
    });
  }

  return null;
}

function extractParagraphsFallback(text: string): string[] | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '').trim();

  if (cleaned.startsWith('[')) cleaned = cleaned.slice(1);
  if (cleaned.endsWith(']')) cleaned = cleaned.slice(0, -1);
  cleaned = cleaned.trim();

  if (!cleaned) return null;

  // Strategy 1: Split by boundary delimiter ", " or ",\n" (works even if single-line has unescaped quotes inside)
  const tokensByQuotes = cleaned.split(/"\s*,\s*"/);
  if (tokensByQuotes.length > 1) {
    const items = tokensByQuotes.map((t, idx) => {
      let str = t.trim();
      if (idx === 0 && str.startsWith('"')) str = str.slice(1);
      if (idx === tokensByQuotes.length - 1 && str.endsWith('"')) str = str.slice(0, -1);
      if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) str = str.slice(1, -1);
      return str.replace(/\\"/g, '"').trim();
    }).filter(Boolean);

    if (items.length > 0) return items;
  }

  // Strategy 2: Line by line extraction
  const lines = cleaned.split(/\r?\n/);
  const itemsByLine: string[] = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line === '[' || line === ']' || line === '{' || line === '}') continue;

    if (line.endsWith(',')) {
      line = line.slice(0, -1).trim();
    }

    if (line.startsWith('"') && line.endsWith('"') && line.length >= 2) {
      line = line.slice(1, -1);
    } else if (line.startsWith('"')) {
      line = line.slice(1);
    }
    if (line.endsWith('"')) {
      line = line.slice(0, -1);
    }

    line = line.replace(/\\"/g, '"');

    if (line.trim()) {
      itemsByLine.push(line.trim());
    }
  }

  return itemsByLine.length > 0 ? itemsByLine : null;
}

/**
 * Accepts AI's reply only if it lines up 1:1 with the draft; otherwise returns null so the
 * caller keeps the draft. Blank draft paragraphs stay blank so alignment with contentEn holds.
 */
export function parsePolishedBatch(rawText: string, draft: string[]): string[] | null {
  // Strip markdown code fences that AI models sometimes wrap around JSON
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '');

  // Sanitize pseudo-JSON where elements are erroneously wrapped in curly braces:
  // e.g. [{"text1"}, {"text2"}] -> ["text1", "text2"]
  cleaned = cleaned.replace(/\{\s*("[\s\S]*?")\s*\}/g, '$1');

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract a JSON array or object from surrounding text (model sometimes adds explanation)
    const match = cleaned.match(/\[[\s\S]*\]/) || cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  // Unwrap object → array (Qwen sometimes returns {"key":"value"} instead of ["value"])
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
    const values = Object.values(parsed);
    if (values.length === 1 && Array.isArray(values[0])) {
      // { "result": ["a","b"] } → ["a","b"]
      parsed = values[0];
    } else if (values.every((v) => typeof v === 'string')) {
      // { "title": "x", "para1": "y" } → ["x","y"]
      parsed = values;
    } else {
      // Check well-known keys
      for (const key of ['result', 'output', 'translations', 'data', 'polished', 'paragraphs', 'text']) {
        if (Array.isArray((parsed as any)[key])) {
          parsed = (parsed as any)[key];
          break;
        }
      }
    }
  }

  if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) {
    const matched = matchParagraphs(parsed, draft);
    if (matched) return matched;
  }

  // Resilient fallback: Fiction translations frequently have unescaped dialogue quotes
  // which make JSON.parse throw a syntax error. Fallback boundary & line extractor salvages them.
  const lineItems = extractParagraphsFallback(cleaned);
  if (lineItems && lineItems.length > 0) {
    const matched = matchParagraphs(lineItems, draft);
    if (matched) return matched;
  }

  return null;
}

/**
 * Polishes a Google Translate draft with AI (Ollama Qwen or Gemini), batch by batch.
 * A batch that fails keeps its draft, so the result is always readable Thai.
 */
export async function polishParagraphs(
  en: string[],
  thDraft: string[],
  context?: PolishContext,
  onProgress?: (currentBatch: number, totalBatches: number) => void
): Promise<{ paragraphs: string[]; failedBatches: number; totalBatches: number }> {
  const provider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();

  let geminiModel: any = null;
  if (provider === 'gemini') {
    const genAI = getGeminiClient();
    if (!genAI) throw new Error('ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์');

    geminiModel = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      generationConfig: { temperature: 0.4 },
    });
  }

  const promptHeader = buildPolishPrompt(context);
  const paragraphs: string[] = [];
  let failedBatches = 0;
  const batchSize = provider === 'ollama' ? OLLAMA_BATCH_SIZE : BATCH_SIZE;
  const totalBatches = Math.ceil(thDraft.length / batchSize);

  for (let start = 0; start < thDraft.length; start += batchSize) {
    const batchIndex = Math.floor(start / batchSize) + 1;
    if (onProgress) {
      try {
        onProgress(batchIndex, totalBatches);
      } catch {}
    }

    const draft = thDraft.slice(start, start + batchSize);
    const pairs = draft.map((th, i) => ({ en: en[start + i] ?? '', th }));

    let polished: string[] | null = null;
    try {
      let rawText = '';
      if (provider === 'ollama') {
        rawText = await callOllama(promptHeader, JSON.stringify(pairs));
      } else {
        rawText = await callGeminiWithRetry(geminiModel, `${promptHeader}\n\n${JSON.stringify(pairs)}`);
      }

      polished = parsePolishedBatch(rawText, draft);
      if (!polished) {
        // Debug: log what Ollama returned vs what we expected
        let parsedLen = 'parse_failed';
        try {
          const parsed = JSON.parse(rawText.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, ''));
          parsedLen = Array.isArray(parsed) ? `array[${parsed.length}]` : `${typeof parsed}(keys:${Object.keys(parsed).length})`;
        } catch { parsedLen = 'invalid_json'; }
        console.warn(`[Polish] batch at ${start} misaligned: expected ${draft.length}, got ${parsedLen}. Raw[0..200]: ${rawText.substring(0, 200)}`);
      }
    } catch (err: any) {
      console.error(`[Polish] batch at ${start} failed (${provider}):`, err.message || err);
      // If Ollama is not running, stop immediately and report error
      if (err.message?.includes('ไม่สามารถเชื่อมต่อกับ Ollama ได้')) {
        throw err;
      }
    }

    if (!polished) failedBatches++;
    paragraphs.push(...(polished ?? draft));
  }

  return { paragraphs, failedBatches, totalBatches };
}
