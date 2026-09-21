import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ChapterStatus, ErrorCode } from '@/lib/enums';
import { translateParagraphsGoogle } from '@/lib/googleTranslate';
import { enqueueChapterForPolish } from '@/lib/polishQueue';

function sanitizeToParagraphs(rawText: string): string[] {
  // Strip HTML tags and script content
  const cleaned = rawText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  return cleaned
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function calculateSourceHash(paragraphs: string[]): string {
  const normalized = paragraphs.join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const body = await request.json();
    const rawText = body.textEn || body.contentEn || '';

    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'กรุณากรอกข้อความภาษาอังกฤษสำหรับบทนี้' },
        { status: 400 }
      );
    }

    if (rawText.length > 250000) {
      return NextResponse.json(
        { success: false, error: 'ข้อความมีความยาวเกินกำหนด (สูงสุด 250,000 ตัวอักษร)' },
        { status: 400 }
      );
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { novel: true },
    });

    if (!chapter) {
      return NextResponse.json({ success: false, error: 'ไม่พบบทนิยายนี้' }, { status: 404 });
    }

    const paragraphsEn = sanitizeToParagraphs(rawText);
    if (paragraphsEn.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบข้อความที่สามารถนำไปแปลได้' },
        { status: 400 }
      );
    }

    const sourceHash = calculateSourceHash(paragraphsEn);
    const titleEn = chapter.titleEn || `Chapter ${chapter.chapterNumber}`;

    // Fast translate with Google
    const [translatedTitle, ...translatedBody] = await translateParagraphsGoogle([
      titleEn,
      ...paragraphsEn,
    ]);

    const finalTitleTh =
      translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : chapter.titleTh;

    const updated = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        contentEn: JSON.stringify(paragraphsEn),
        contentThGoogle: JSON.stringify(translatedBody),
        contentTh: JSON.stringify(translatedBody),
        titleTh: finalTitleTh,
        status: ChapterStatus.TRANSLATED_GT,
        sourceHash,
        translatedAt: new Date(),
        errorCode: ErrorCode.NONE,
        errorMessage: null,
      },
    });

    // Enqueue background AI polish
    enqueueChapterForPolish(chapterId);

    return NextResponse.json({
      success: true,
      chapter: {
        id: updated.id,
        titleTh: updated.titleTh,
        titleEn: updated.titleEn,
        contentTh: updated.contentTh,
        contentEn: updated.contentEn,
        status: updated.status,
      },
    });
  } catch (err: any) {
    console.error('[ManualPaste] Error processing manual paste:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'บันทึกและแปลข้อความไม่สำเร็จ' },
      { status: 500 }
    );
  }
}
