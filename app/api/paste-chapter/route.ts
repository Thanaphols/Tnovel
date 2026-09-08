import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { translateParagraphsGoogle } from '@/lib/googleTranslate';

// Blank lines separate paragraphs in pasted text; if there are none, fall back to single
// newlines so a chapter copied out of a reader that uses one line per paragraph still works.
function splitParagraphs(text: string): string[] {
  const byBlankLine = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  if (byBlankLine.length > 1) return byBlankLine;

  return text
    .split(/\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนเพิ่มตอน' }, { status: 401 });
    }

    const { novelTitle, chapterTitle, text, sourceUrl } = await request.json();

    if (!novelTitle || typeof novelTitle !== 'string' || !novelTitle.trim()) {
      return NextResponse.json({ success: false, error: 'กรุณาใส่ชื่อเรื่อง' }, { status: 400 });
    }
    if (!text || typeof text !== 'string' || text.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: 'เนื้อหาสั้นเกินไป กรุณาวางเนื้อหาตอนที่ต้องการแปล' },
        { status: 400 }
      );
    }

    const paragraphs = splitParagraphs(text);
    if (paragraphs.length === 0) {
      return NextResponse.json({ success: false, error: 'ไม่พบเนื้อหาที่แปลได้' }, { status: 400 });
    }

    const cleanNovelTitle = novelTitle.trim();
    const io = (global as any).io;

    // Same find-or-create by title the URL flow uses, so pasting into an existing story appends
    // to it instead of creating a duplicate.
    let novel = await prisma.novel.findFirst({
      where: {
        deletedAt: null,
        OR: [{ titleEn: cleanNovelTitle }, { titleTh: cleanNovelTitle }],
      },
    });

    const isNewNovel = !novel;
    if (!novel) {
      novel = await prisma.novel.create({
        data: {
          titleEn: cleanNovelTitle,
          titleTh: cleanNovelTitle,
          sourceUrl: sourceUrl?.trim() || 'paste',
          createdById: session.id,
        },
      });
    }

    const chapterCount = await prisma.chapter.count({ where: { novelId: novel.id } });
    const chapterNumber = chapterCount + 1;
    const cleanChapterTitle = (chapterTitle || '').trim() || `Chapter ${chapterNumber}`;

    // Title rides along as paragraph 0, same as the scraped path — one request for the lot.
    const [translatedTitle, ...contentTh] = await translateParagraphsGoogle([cleanChapterTitle, ...paragraphs]);

    const chapter = await prisma.chapter.create({
      data: {
        novelId: novel.id,
        chapterNumber,
        titleEn: cleanChapterTitle,
        titleTh: translatedTitle || cleanChapterTitle,
        contentEn: JSON.stringify(paragraphs),
        contentTh: JSON.stringify(contentTh),
        originalUrl: sourceUrl?.trim() || `paste:${novel.id}:${chapterNumber}`,
      },
    });

    if (io) {
      if (isNewNovel) {
        io.emit('novel:created', { novelId: novel.id, titleTh: novel.titleTh, titleEn: novel.titleEn });
      }
      io.emit('chapter:created', {
        chapterId: chapter.id,
        novelId: novel.id,
        chapterNumber,
        chapterCount: chapterNumber,
        titleTh: novel.titleTh,
        chapterTitle: chapter.titleTh,
      });
    }

    return NextResponse.json({
      success: true,
      chapterId: chapter.id,
      novelId: novel.id,
      chapterNumber,
      paragraphCount: paragraphs.length,
      isNewNovel,
    });
  } catch (err: any) {
    console.error('Paste chapter error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการเพิ่มตอน' },
      { status: 500 }
    );
  }
}
