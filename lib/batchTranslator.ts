import { prisma } from '@/lib/prisma';
import { scrapeNovelChapter } from '@/lib/scraper';
import { translateParagraphsGoogle } from '@/lib/googleTranslate';

export async function processBatchChaptersAsync(
  novel: any,
  author: any,
  chapterLinks: Array<{ chapterNumber: number; title: string; url: string }>,
  io: any
) {
  const total = chapterLinks.length;
  let saved = 0;

  if (!(global as any).translationState) {
    (global as any).translationState = { isPaused: false, isCancelled: false };
  }
  (global as any).translationState.isPaused = false;
  (global as any).translationState.isCancelled = false;

  (global as any).activeTranslationJob = {
    isActive: true,
    novelId: novel.id,
    novelTitle: novel.titleTh || novel.titleEn,
    currentChapter: 0,
    totalChapters: total,
    chapterTitle: 'กำลังเตรียมการแปล...',
    percent: 0,
    isPaused: false,
    updatedAt: new Date().toISOString(),
  };

  for (let i = 0; i < total; i++) {
    // Check if user paused translation
    while ((global as any).translationState?.isPaused) {
      if ((global as any).translationState?.isCancelled) break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    // Check if user cancelled translation
    if ((global as any).translationState?.isCancelled) {
      (global as any).activeTranslationJob = null;
      try {
        await prisma.novel.update({
          where: { id: novel.id },
          data: { translationStatus: 'CANCELLED' },
        });
      } catch {}

      if (io) {
        io.emit('translation:progress', {
          status: 'batch_cancelled',
          novelTitle: novel.titleTh || novel.titleEn,
          message: `ยกเลิกการแปลเรื่อง "${novel.titleTh || novel.titleEn}" แล้ว`,
        });
      }
      break;
    }

    const link = chapterLinks[i];
    const currentNum = i + 1;

    try {
      const existing = await prisma.chapter.findFirst({
        where: { novelId: novel.id, originalUrl: link.url, deletedAt: null },
      });
      if (existing) continue;

      const progressPayload = {
        status: 'batch_progress',
        novelId: novel.id,
        currentChapter: currentNum,
        totalChapters: total,
        novelTitle: novel.titleTh || novel.titleEn,
        chapterTitle: link.title,
        percent: Math.round((currentNum / total) * 100),
        chapterCount: saved,
        isPaused: (global as any).translationState?.isPaused || false,
        updatedAt: new Date().toISOString(),
      };

      (global as any).activeTranslationJob = { isActive: true, ...progressPayload };

      if (io) {
        io.emit('translation:progress', progressPayload);
      }

      let scrapedData = await scrapeNovelChapter(link.url);
      if (!scrapedData.paragraphs || scrapedData.paragraphs.length < 3) {
        await new Promise((r) => setTimeout(r, 2000));
        scrapedData = await scrapeNovelChapter(link.url);
      }

      if (!scrapedData.paragraphs || scrapedData.paragraphs.length === 0) {
        console.warn(`Skipping chapter ${currentNum}: no content extracted from ${link.url}`);
        continue;
      }

      // ponytail: the chapter title rides along as paragraph 0, so a whole chapter is one request.
      let titleTh = `ตอนที่ ${currentNum}: ${link.title}`;
      let contentTh: string[] = [];
      try {
        const [translatedTitle, ...translatedBody] = await translateParagraphsGoogle([
          scrapedData.title || link.title,
          ...scrapedData.paragraphs,
        ]);
        if (translatedTitle && !translatedTitle.startsWith('[')) titleTh = translatedTitle;
        contentTh = translatedBody;
      } catch (err: any) {
        // Keep the English so the chapter is still readable and the reader's re-translate
        // button has source text to work from.
        console.error(`Translation failed for chapter ${currentNum}:`, err.message);
        contentTh = scrapedData.paragraphs.map((p) => `[แปลไม่สำเร็จ กดแปลใหม่ได้ในหน้าอ่าน] ${p}`);
      }

      const chapter = await prisma.chapter.create({
        data: {
          novelId: novel.id,
          chapterNumber: currentNum,
          titleEn: scrapedData.title || link.title,
          titleTh,
          contentEn: JSON.stringify(scrapedData.paragraphs),
          contentTh: JSON.stringify(contentTh),
          originalUrl: link.url,
        },
      });

      saved++;

      if (io) {
        io.emit('chapter:created', {
          chapterId: chapter.id,
          novelId: novel.id,
          chapterCount: saved,
          titleTh: novel.titleTh,
          chapterTitle: titleTh,
          authorName: author.name,
          chapterNumber: currentNum,
        });
      }
    } catch (err: any) {
      console.error(`Error in batch chapter ${currentNum}:`, err.message || err);
    }
  }

  (global as any).activeTranslationJob = null;

  if (!(global as any).translationState?.isCancelled) {
    try {
      await prisma.novel.update({
        where: { id: novel.id },
        data: { translationStatus: 'COMPLETED' },
      });
    } catch {}

    if (io) {
      io.emit('translation:progress', {
        status: 'batch_completed',
        novelTitle: novel.titleTh || novel.titleEn,
        message: `แปลนิยายเรื่อง "${novel.titleTh || novel.titleEn}" ครบทั้งเรื่อง (${total} ตอน) เรียบร้อยแล้ว!`,
      });
    }
  }
}
