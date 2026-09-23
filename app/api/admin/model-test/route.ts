import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { translateWithGlossary, getRelevantGlossary, toPromptGlossary } from '@/lib/glossaryService';
import { polishParagraphs } from '@/lib/translator';
import { isAIProvider } from '@/lib/aiSettings';

const MAX_CHARS = 20000;

// Admin playground: without `provider` it returns the Google draft only; with `provider` it
// polishes a given draft so the page can fetch the draft once and fan out one call per model.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim() || text.length > MAX_CHARS) {
    return NextResponse.json(
      { success: false, error: `กรุณาใส่ข้อความภาษาอังกฤษ (ไม่เกิน ${MAX_CHARS} ตัวอักษร)` },
      { status: 400 }
    );
  }
  const en = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  // Optional fandom: same glossary pipeline as real chapters (terms locked into the draft + prompt).
  const fandomId = typeof body?.fandomId === 'string' && body.fandomId ? body.fandomId : null;

  try {
    if (!body?.provider) {
      const { draft, glossary } = await translateWithGlossary(fandomId ? { fandomId } : null, en);
      return NextResponse.json({ success: true, draft, glossaryCount: glossary.length });
    }

    if (!isAIProvider(body.provider)) {
      return NextResponse.json({ success: false, error: 'provider ไม่ถูกต้อง' }, { status: 400 });
    }
    const draft: unknown = body.draft;
    if (!Array.isArray(draft) || draft.length !== en.length || !draft.every((d) => typeof d === 'string')) {
      return NextResponse.json({ success: false, error: 'draft ไม่ตรงกับต้นฉบับ' }, { status: 400 });
    }

    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
    const started = Date.now();
    const glossary = fandomId ? await getRelevantGlossary({ fandomId }, en, 30) : [];
    const context = glossary.length ? { glossary: toPromptGlossary(glossary) } : undefined;
    const result = await polishParagraphs(en, draft as string[], context, undefined, {
      provider: body.provider,
      model,
    });
    return NextResponse.json({ success: true, ...result, ms: Date.now() - started });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'ทดสอบไม่สำเร็จ' }, { status: 500 });
  }
}
