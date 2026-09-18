import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { translateParagraphsGoogle } from '@/lib/googleTranslate';
import { polishParagraphs } from '@/lib/translator';
import { recordAuditLog } from '@/lib/auditLog';
import { isThaiText } from '@/lib/scraper';

// Failed scrapes/translations are stored with these markers instead of real Thai text,
// so they have to be detected before anything is used as a draft or written back.
const FAILURE_PREFIXES = ['[แปลผิดพลาด', '[ยังไม่ได้ใส่', '[กำลังรอโควตา', '[แปลไม่สำเร็จ', '[แปล]', '[ต้นฉบับ]'];
const FAILURE_RATIO = 0.3;

function looksFailed(paragraphs: string[]): boolean {
  if (paragraphs.length === 0) return true;
  const bad = paragraphs.filter((p) => FAILURE_PREFIXES.some((prefix) => p.startsWith(prefix))).length;
  return bad / paragraphs.length > FAILURE_RATIO;
}

function parseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const engine: 'google' | 'polish' = body?.engine === 'polish' ? 'polish' : 'google';

    const chapter = await prisma.chapter.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!chapter) {
      return NextResponse.json({ success: false, error: 'ไม่พบบทนิยายนี้' }, { status: 404 });
    }

    const contentEn = parseArray(chapter.contentEn);
    if (contentEn.length === 0) {
      return NextResponse.json(
        { success: false, error: 'บทนี้ไม่มีต้นฉบับเก็บไว้ แปลใหม่ไม่ได้' },
        { status: 400 }
      );
    }

    if (chapter.originalUrl.includes('dek-d.com') || isThaiText(contentEn)) {
      return NextResponse.json({
        success: true,
        alreadyPolished: true,
        message: 'นิยายเรื่องนี้เป็นภาษาไทยต้นฉบับอยู่แล้ว ไม่จำเป็นต้องแปลใหม่',
        titleTh: chapter.titleTh,
        contentTh: parseArray(chapter.contentTh),
      });
    }

    // Polishing costs Gemini quota; a chapter that is already polished is served as-is.
    if (engine === 'polish' && chapter.polishedAt) {
      return NextResponse.json({
        success: true,
        engine,
        alreadyPolished: true,
        titleTh: chapter.titleTh,
        contentTh: parseArray(chapter.contentTh),
      });
    }

    // Always draft from the stored English (free, ~2s), never from stored Thai: re-polishing
    // an already-edited text drifts further from the source every time.
    let draft: string[] | null = null;
    try {
      const fresh = await translateParagraphsGoogle([chapter.titleEn, ...contentEn]);
      if (!looksFailed(fresh.slice(1))) draft = fresh;
    } catch (err: any) {
      console.error('Retranslate: Google draft failed:', err.message);
    }

    if (!draft && engine === 'polish') {
      const stored = parseArray(chapter.contentTh);
      if (stored.length === contentEn.length && !looksFailed(stored)) draft = [chapter.titleTh, ...stored];
    }

    if (!draft) {
      return NextResponse.json(
        { success: false, error: 'Google Translate แปลไม่สำเร็จ เนื้อหาเดิมยังอยู่ครบ' },
        { status: 502 }
      );
    }

    let translated = draft;
    let polishedAt: Date | null = null;
    let partial = false;

    if (engine === 'polish') {
      const result = await polishParagraphs([chapter.titleEn, ...contentEn], draft);
      if (result.failedBatches === result.totalBatches) {
        return NextResponse.json(
          { success: false, error: 'ระบบเกลาสำนวนไม่สำเร็จ (โควตารายวันอาจหมด) เนื้อหาเดิมยังอยู่ครบ' },
          { status: 502 }
        );
      }
      translated = result.paragraphs;
      partial = result.failedBatches > 0;
      // Partially polished chapters stay unflagged so the reader can retry the rest later.
      polishedAt = partial ? null : new Date();
    }

    const [translatedTitle, ...translatedBody] = translated;
    const titleTh = translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : chapter.titleTh;

    await prisma.chapter.update({
      where: { id: chapter.id },
      data: { titleTh, contentTh: JSON.stringify(translatedBody), polishedAt },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('chapter:updated', { chapterId: chapter.id, novelId: chapter.novelId, titleTh });
    }

    await recordAuditLog({
      userId: session.id,
      action: 'CHAPTER_RETRANSLATE',
      entity: 'CHAPTER',
      entityId: chapter.id,
      details: `แปลใหม่บท "${titleTh}" (${engine === 'polish' ? 'AI เกลาสำนวน' : 'Google แปลตรง'})`,
      request,
    });

    return NextResponse.json({ success: true, engine, partial, titleTh, contentTh: translatedBody });
  } catch (err: any) {
    console.error('Retranslate error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการแปลใหม่' },
      { status: 500 }
    );
  }
}
