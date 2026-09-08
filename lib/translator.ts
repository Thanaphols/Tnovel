import { GoogleGenerativeAI } from '@google/generative-ai';

const LITERARY_SYSTEM_PROMPT = `คุณคือคำสั่งแปลวรรณกรรมมืออาชีพ Translate this novel text from English to natural, immersive, and elegant Thai (วรรณกรรมไทยประณีต).

กฎการแปล:
1. แปลให้อ่านลื่นไหล ถ่ายทอดอารมณ์และสำนวนภาษาไทยอย่างเป็นธรรมชาติ ไม่แปลแข็งเป็นคำต่อคำ
2. ถ่ายทอดน้ำเสียง บทสนทนา (Dialogue) ให้เหมาะกับตัวละคร
3. ห้ามข้ามเนื้อหา ห้ามสรุปความ คงรูปแบบย่อหน้าไว้เป็นลำดับ JSON Array ของ String
4. ตอบกลับเฉพาะรูปแบบ JSON Array เท่านั้น ห้ามใส่ข้อความเกริ่นหรือคำอธิบายเพิ่มเติม`;

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
      // fail fast instead of burning 30s of backoff per call and storing fallback text.
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

export async function translateTitle(titleEn: string): Promise<string> {
  const genAI = getGeminiClient();
  if (!genAI) {
    return `[แปล] ${titleEn}`;
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `Translate this web novel title to short, captivating Thai title: "${titleEn}". Return only the Thai title text without quotes.`;
    const rawText = await callGeminiWithRetry(model, prompt);
    return rawText.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    console.error('Title translation error:', err);
    return `[แปล] ${titleEn}`;
  }
}

export async function translateParagraphsInBatches(
  paragraphs: string[],
  onChunkProgress?: (translatedBatch: string[], currentBatch: number, totalBatches: number) => void
): Promise<string[]> {
  const genAI = getGeminiClient();

  if (!genAI) {
    return paragraphs.map(
      (p) =>
        `[ยังไม่ได้ใส่ GEMINI_API_KEY] กรุณานำ Gemini API Key ใส่ในไฟล์ .env.local แล้วรีสตาร์ทเซิร์ฟเวอร์\n\n(ต้นฉบับ: ${p})`
    );
  }

  const BATCH_SIZE = 75;
  const batches: string[][] = [];
  for (let i = 0; i < paragraphs.length; i += BATCH_SIZE) {
    batches.push(paragraphs.slice(i, i + BATCH_SIZE));
  }

  const totalBatches = batches.length;
  const translatedResult: string[] = [];

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    // Check global pause state
    while ((global as any).translationState?.isPaused) {
      if ((global as any).translationState?.isCancelled) break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    // Check global cancel state
    if ((global as any).translationState?.isCancelled) {
      console.log('Translation batch cancelled by user.');
      break;
    }

    const batch = batches[batchIdx];

    const prompt = `${LITERARY_SYSTEM_PROMPT}\n\nTranslate the following array of English paragraphs into a Thai JSON string array:\n${JSON.stringify(
      batch
    )}`;

    try {
      const rawText = await callGeminiWithRetry(model, prompt);
      let parsedBatch: string[] = JSON.parse(rawText);

      if (!Array.isArray(parsedBatch)) {
        parsedBatch = batch.map((p) => `[แปล] ${p}`);
      }

      if (parsedBatch.length !== batch.length) {
        while (parsedBatch.length < batch.length) {
          parsedBatch.push(batch[parsedBatch.length] || '');
        }
      }

      translatedResult.push(...parsedBatch);

      if (onChunkProgress) {
        onChunkProgress(parsedBatch, batchIdx + 1, totalBatches);
      }
    } catch (err: any) {
      console.error(`Error translating batch ${batchIdx + 1}:`, err.message || err);
      const isQuota = err.message?.includes('429') || err.message?.includes('Quota');
      const prefix = isQuota ? '[กำลังรอโควตาแปล AI]' : '[ต้นฉบับ]';
      const fallbackBatch = batch.map((p) => `${prefix} ${p}`);
      translatedResult.push(...fallbackBatch);
      if (onChunkProgress) {
        onChunkProgress(fallbackBatch, batchIdx + 1, totalBatches);
      }
    }
  }

  return translatedResult;
}
