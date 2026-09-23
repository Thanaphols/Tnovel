import { prisma } from '@/lib/prisma';
import { scrapeNovelChapter, isThaiText } from '@/lib/scraper';
import { polishParagraphs } from '@/lib/translator';
import { autoDiscoverAndSaveGlossary, translateWithGlossary, toPromptGlossary } from '@/lib/glossaryService';
import { applySafeNameReplacer } from '@/lib/nameReplacer';
import { ChapterStatus } from '@/lib/enums';

export async function processBatchChaptersAsync(
  novel: any,
  author: any,
  chapterLinks: Array<{ chapterNumber: number; title: string; url: string }>,
  io: any,
  enablePolish = false,
  initiatorUserId?: string,
  providerOverride?: string
) {
  const total = chapterLinks.length;
  let saved = 0;
  const isThaiNovel =
    (novel.sourceUrl && novel.sourceUrl.includes('dek-d.com')) ||
    (Boolean(novel.titleEn) && isThaiText(novel.titleEn));

  if (!(global as any).translationState) {
    (global as any).translationState = { isPaused: false, isCancelled: false };
  }
  (global as any).translationState.isPaused = false;
  (global as any).translationState.isCancelled = false;

  (global as any).activeTranslationJob = {
    isActive: true,
    initiatorUserId,
    novelId: novel.id,
    novelTitle: novel.titleTh || novel.titleEn,
    currentChapter: 0,
    totalChapters: total,
    chapterTitle: isThaiNovel ? 'กำลังเตรียมการนำเข้า...' : 'กำลังเตรียมการแปล...',
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
          message: isThaiNovel
            ? `ยกเลิกการนำเข้าเรื่อง "${novel.titleTh || novel.titleEn}" แล้ว`
            : `ยกเลิกการแปลเรื่อง "${novel.titleTh || novel.titleEn}" แล้ว`,
        });
      }
      break;
    }

    const link = chapterLinks[i];
    const currentNum = link.chapterNumber || i + 1;

    try {
      const existing = await prisma.chapter.findFirst({
        where: { novelId: novel.id, originalUrl: link.url, deletedAt: null },
      });

      if (existing) {
        let existingTh: string[] = [];
        try {
          existingTh = JSON.parse(existing.contentTh || '[]');
        } catch {}

        // If the existing chapter is genuinely in Thai, skip it
        if (existing.originalUrl.includes('dek-d.com') || isThaiText(existingTh)) {
          saved++;
          continue;
        }

        // If it was stored in English by mistake, re-translate and update it
        let contentEn: string[] = [];
        try {
          contentEn = JSON.parse(existing.contentEn || '[]');
        } catch {}

        if (contentEn.length > 0) {
          try {
            const {
              draft: [translatedTitle, ...translatedBody],
            } = await translateWithGlossary(novel.id, [existing.titleEn || link.title, ...contentEn]);
            await prisma.chapter.update({
              where: { id: existing.id },
              data: {
                titleTh: translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : existing.titleTh,
                contentTh: JSON.stringify(translatedBody),
                contentThGoogle: JSON.stringify(translatedBody),
                status: ChapterStatus.TRANSLATED_GT,
              },
            });
            saved++;
            if (io) {
              io.emit('chapter:created', {
                chapterId: existing.id,
                novelId: novel.id,
                chapterCount: saved,
                titleTh: novel.titleTh,
                chapterTitle: translatedTitle,
                authorName: author?.name || 'Author',
                chapterNumber: currentNum,
              });
            }
            continue;
          } catch (err: any) {
            console.error(`Failed to re-translate existing chapter ${currentNum}:`, err.message);
          }
        }
      }

      const progressPayload = {
        status: 'batch_progress',
        initiatorUserId,
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

      const isChapterThai = link.url.includes('dek-d.com') || isThaiText(scrapedData.paragraphs);
      let titleTh = scrapedData.title || link.title || `ตอนที่ ${currentNum}`;
      let contentTh: string[] = [];
      let googleTh: string[] = [];
      let status: ChapterStatus = ChapterStatus.TRANSLATED_GT;

      if (isChapterThai) {
        contentTh = scrapedData.paragraphs;
        googleTh = scrapedData.paragraphs;
      } else {
        // Auto-discover candidate entities into NovelGlossary
        try {
          await autoDiscoverAndSaveGlossary(novel.id, scrapedData.paragraphs);
        } catch (err: any) {
          console.warn('[BatchTranslator] Glossary auto-discover error:', err.message);
        }

        // ponytail: the chapter title rides along as paragraph 0, so a whole chapter is one request.
        const enWithTitle = [scrapedData.title || link.title, ...scrapedData.paragraphs];
        try {
          const {
            draft: [translatedTitle, ...translatedBody],
            glossary,
          } = await translateWithGlossary(novel.id, enWithTitle);
          if (translatedTitle && !translatedTitle.startsWith('[')) titleTh = translatedTitle;
          contentTh = translatedBody;
          googleTh = translatedBody;

          // AI Polish: refine Google's draft for natural Thai prose (all-or-nothing)
          if (enablePolish && contentTh.length > 0) {
            if (io) {
              io.emit('translation:progress', {
                status: 'batch_progress',
                novelId: novel.id,
                currentChapter: currentNum,
                totalChapters: total,
                novelTitle: novel.titleTh || novel.titleEn,
                chapterTitle: `✨ กำลังเกลาสำนวน: ${link.title}`,
                percent: Math.round((currentNum / total) * 100),
                chapterCount: saved,
                updatedAt: new Date().toISOString(),
              });
            }
            try {
              const polishContext = {
                novelTitle: novel.titleTh || novel.titleEn,
                genre: novel.genre || novel.category || undefined,
                glossary: toPromptGlossary(glossary),
              };
              const result = await polishParagraphs(enWithTitle, [titleTh, ...contentTh], polishContext, undefined, {
                provider: providerOverride,
              });
              // All-or-Nothing: only accept polish when every batch succeeded, else keep Google draft.
              if (result.failedBatches === 0) {
                // Same post-polish name fix as polishQueue: LLM may still leave English names.
                const [polishedTitle, ...polishedBody] = applySafeNameReplacer(result.paragraphs, glossary);
                if (polishedTitle && !polishedTitle.startsWith('[')) titleTh = polishedTitle;
                contentTh = polishedBody;
                status = ChapterStatus.POLISHED;
              }
            } catch (polishErr: any) {
              // LLM failed (quota/network) — keep Google draft, don't fail the chapter
              console.warn(`[Polish] chapter ${currentNum} polish failed, keeping Google draft:`, polishErr.message);
            }
          }
        } catch (err: any) {
          console.error(`Translation failed for chapter ${currentNum}:`, err.message);
          contentTh = scrapedData.paragraphs.map((p) => `[แปลไม่สำเร็จ กดแปลใหม่ได้ในหน้าอ่าน] ${p}`);
          googleTh = contentTh;
          status = ChapterStatus.TRANSLATE_FAILED;
        }
      }

      // upsert: fills a pre-inserted TOC_ONLY placeholder (same novelId+chapterNumber) instead of
      // colliding on the unique constraint, and still creates fresh when no placeholder exists.
      const polishedJson = status === ChapterStatus.POLISHED ? JSON.stringify(contentTh) : null;
      const chapter = await prisma.chapter.upsert({
        where: { novelId_chapterNumber: { novelId: novel.id, chapterNumber: currentNum } },
        create: {
          novelId: novel.id,
          chapterNumber: currentNum,
          titleEn: scrapedData.title || link.title,
          titleTh,
          contentEn: JSON.stringify(scrapedData.paragraphs),
          contentTh: JSON.stringify(contentTh),
          contentThGoogle: JSON.stringify(googleTh),
          contentThPolished: polishedJson,
          status,
          originalUrl: link.url,
        },
        update: {
          titleEn: scrapedData.title || link.title,
          titleTh,
          contentEn: JSON.stringify(scrapedData.paragraphs),
          contentTh: JSON.stringify(contentTh),
          contentThGoogle: JSON.stringify(googleTh),
          contentThPolished: polishedJson,
          status,
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
        initiatorUserId,
        novelTitle: novel.titleTh || novel.titleEn,
        message: isThaiNovel
          ? `นำเข้านิยายเรื่อง "${novel.titleTh || novel.titleEn}" ครบทั้งเรื่อง (${total} ตอน) เรียบร้อยแล้ว!`
          : `แปลนิยายเรื่อง "${novel.titleTh || novel.titleEn}" ครบทั้งเรื่อง (${total} ตอน) เรียบร้อยแล้ว!`,
      });
    }
  }
}
