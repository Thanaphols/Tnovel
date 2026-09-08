import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { translateParagraphsGoogle } from '@/lib/googleTranslate';
import { translateParagraphsInBatches } from '@/lib/translator';

// Gemini never throws on quota — it returns these markers as the "translation" instead,
// so they have to be detected before anything is written back over good content.
const FAILURE_PREFIXES = ['[แปลผิดพลาด', '[ยังไม่ได้ใส่', '[กำลังรอโควตา', '[แปลไม่สำเร็จ', '[แปล]'];
const FAILURE_RATIO = 0.3;

function looksFailed(paragraphs: string[]): boolean {
  if (paragraphs.length === 0) return true;
  const bad = paragraphs.filter((p) => FAILURE_PREFIXES.some((prefix) => p.startsWith(prefix))).length;
  return bad / paragraphs.length > FAILURE_RATIO;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนสั่งแปลใหม่' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const engine: 'google' | 'gemini' = body?.engine === 'gemini' ? 'gemini' : 'google';

    const chapter = await prisma.chapter.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!chapter) {
      return NextResponse.json({ success: false, error: 'ไม่พบบทนิยายนี้' }, { status: 404 });
    }

    let contentEn: string[];
    try {
      contentEn = JSON.parse(chapter.contentEn);
    } catch {
      contentEn = [];
    }
    if (!Array.isArray(contentEn) || contentEn.length === 0) {
      return NextResponse.json(
        { success: false, error: 'บทนี้ไม่มีต้นฉบับภาษาอังกฤษเก็บไว้ แปลใหม่ไม่ได้' },
        { status: 400 }
      );
    }

    // Re-translates the stored source text, so no re-scraping and no Cloudflare in the way.
    const translate = engine === 'gemini' ? translateParagraphsInBatches : translateParagraphsGoogle;
    const [translatedTitle, ...translatedBody] = await translate([chapter.titleEn, ...contentEn]);

    if (looksFailed(translatedBody)) {
      return NextResponse.json(
        {
          success: false,
          error:
            engine === 'gemini'
              ? 'Gemini แปลไม่สำเร็จ (โควตารายวันน่าจะหมด) เนื้อหาเดิมยังอยู่ครบ'
              : 'Google Translate แปลไม่สำเร็จ เนื้อหาเดิมยังอยู่ครบ',
        },
        { status: 502 }
      );
    }

    const titleTh =
      translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : chapter.titleTh;

    await prisma.chapter.update({
      where: { id: chapter.id },
      data: { titleTh, contentTh: JSON.stringify(translatedBody) },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('chapter:updated', { chapterId: chapter.id, novelId: chapter.novelId, titleTh });
    }

    return NextResponse.json({ success: true, engine, titleTh, contentTh: translatedBody });
  } catch (err: any) {
    console.error('Retranslate error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการแปลใหม่' },
      { status: 500 }
    );
  }
}
