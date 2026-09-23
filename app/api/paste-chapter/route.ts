import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { polishParagraphs } from '@/lib/translator';
import { translateWithGlossary, toPromptGlossary } from '@/lib/glossaryService';
import { applySafeNameReplacer } from '@/lib/nameReplacer';
import { recordAuditLog } from '@/lib/auditLog';
import { isThaiText, deobfuscateThaiText } from '@/lib/scraper';

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
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเพิ่มตอนได้' }, { status: 403 });
    }

    const { novelTitle, chapterTitle, text, sourceUrl, category, quality = 'fast', fandomId: rawFandomId } =
      await request.json();
    const fandomId: string | undefined = typeof rawFandomId === 'string' && rawFandomId ? rawFandomId : undefined;

    if (!novelTitle || typeof novelTitle !== 'string' || !novelTitle.trim()) {
      return NextResponse.json({ success: false, error: 'กรุณาใส่ชื่อเรื่อง' }, { status: 400 });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return NextResponse.json({ success: false, error: 'กรุณาระบุหมวดหมู่นิยาย (Category)' }, { status: 400 });
    }
    if (!text || typeof text !== 'string' || text.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: 'เนื้อหาสั้นเกินไป กรุณาวางเนื้อหาตอนที่ต้องการแปล' },
        { status: 400 }
      );
    }

    const rawParagraphs = splitParagraphs(text);
    const paragraphs = rawParagraphs.map(deobfuscateThaiText);
    if (paragraphs.length === 0) {
      return NextResponse.json({ success: false, error: 'ไม่พบเนื้อหาที่แปลได้' }, { status: 400 });
    }

    const cleanNovelTitle = deobfuscateThaiText(novelTitle.trim());
    const isThai = isThaiText(paragraphs) || isThaiText(text) || isThaiText(cleanNovelTitle);
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
          category: category.trim(),
          fandomId: fandomId ?? null,
          createdById: session.id,
        },
      });
    } else if ((category && !novel.category) || fandomId) {
      novel = await prisma.novel.update({
        where: { id: novel.id },
        data: {
          ...(category && !novel.category ? { category: category.trim() } : {}),
          ...(fandomId ? { fandomId } : {}),
        },
      });
    }

    const chapterCount = await prisma.chapter.count({ where: { novelId: novel.id } });
    const chapterNumber = chapterCount + 1;
    const defaultTitle = isThai ? `ตอนที่ ${chapterNumber}` : `Chapter ${chapterNumber}`;
    const cleanChapterTitle = deobfuscateThaiText((chapterTitle || '').trim() || defaultTitle);

    let translatedTitle = cleanChapterTitle;
    let contentTh: string[] = paragraphs;

    if (!isThai) {
      // Title rides along as paragraph 0, same as the scraped path — one request for the lot.
      const enWithTitle = [cleanChapterTitle, ...paragraphs];
      const {
        draft: [transTitle, ...transBody],
        glossary,
      } = await translateWithGlossary(novel.id, enWithTitle);
      translatedTitle = transTitle || cleanChapterTitle;
      contentTh = transBody;

      if (quality === 'polished' && contentTh.length > 0) {
        if (io) {
          io.emit('translation:progress', {
            status: 'translating',
            message: '✨ กำลังเกลาสำนวนวรรณกรรมด้วย Gemini AI...',
          });
        }
        try {
          const result = await polishParagraphs(enWithTitle, [translatedTitle, ...contentTh], {
            novelTitle: novel.titleTh || novel.titleEn,
            genre: novel.genre || novel.category || undefined,
            glossary: toPromptGlossary(glossary),
          });
          if (result.failedBatches < result.totalBatches) {
            const [polishedTitle, ...polishedBody] = applySafeNameReplacer(result.paragraphs, glossary);
            if (polishedTitle && !polishedTitle.startsWith('[')) translatedTitle = polishedTitle;
            contentTh = polishedBody;
          }
        } catch (polishErr: any) {
          console.warn('Paste chapter polish failed, keeping Google draft:', polishErr.message);
        }
      }
    }

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

    await recordAuditLog({
      userId: session.id,
      action: 'CHAPTER_PASTE',
      entity: 'CHAPTER',
      entityId: chapter.id,
      details: `เพิ่มตอนที่ ${chapterNumber} "${chapter.titleTh}" ในนิยาย "${novel.titleTh}"`,
      request,
    });

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
