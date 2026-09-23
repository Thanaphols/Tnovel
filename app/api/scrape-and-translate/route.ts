import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { scrapeNovelChapter, scrapeNovelIndex, isThaiText } from '@/lib/scraper';
import { translateTitleGoogle } from '@/lib/googleTranslate';
import { translateWithGlossary, toPromptGlossary } from '@/lib/glossaryService';
import { applySafeNameReplacer } from '@/lib/nameReplacer';
import { processBatchChaptersAsync } from '@/lib/batchTranslator';
import { polishParagraphs } from '@/lib/translator';
import { recordAuditLog } from '@/lib/auditLog';
import { ChapterStatus } from '@/lib/enums';
import { enqueueChapterForPolish } from '@/lib/polishQueue';
import { inFlightLock } from '@/lib/inFlightLock';
import { isAIProvider } from '@/lib/aiSettings';

export async function POST(request: Request) {
  try {
    const { url, mode = 'auto', category, quality = 'fast', provider, fandomId: rawFandomId } = await request.json();
    const fandomId: string | undefined = typeof rawFandomId === 'string' && rawFandomId ? rawFandomId : undefined;
    const enablePolish = quality === 'polished';
    const providerOverride: string | undefined = isAIProvider(provider) ? provider : undefined;

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุ URL เว็บนิยายที่ถูกต้อง (เช่น https://...)' },
        { status: 400 }
      );
    }

    if (!category || typeof category !== 'string' || !category.trim()) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุหมวดหมู่นิยาย (Category)' },
        { status: 400 }
      );
    }

    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเพิ่มนิยายหรือสั่งแปลได้' },
        { status: 403 }
      );
    }
    const creatorId = session.id;

    const io = (global as any).io;

    const isFanmtlChapter = url.includes('fanmtl.com') && /_\d+\.html$/i.test(url);
    const isDekDChapter = url.includes('dek-d.com') && (url.includes('viewlongc.php') || url.includes('&chapter='));
    const isWebnovelChapter = url.includes('webnovel.com') && /\/\d+_\d+/i.test(url);
    const isScribbleHubChapter = url.includes('scribblehub.com') && url.includes('/read/');
    const isGenericChapter =
      url.includes('/chapter') ||
      url.includes('chapter-') ||
      isFanmtlChapter ||
      isDekDChapter ||
      isWebnovelChapter ||
      isScribbleHubChapter;

    const isNovelIndex = mode === 'full_novel' || (mode !== 'single' && !isGenericChapter);

    if (isNovelIndex) {
      let targetIndexUrl = url.trim();
      if (targetIndexUrl.includes('fanmtl.com')) {
        targetIndexUrl = targetIndexUrl.replace(/_\d+\.html$/i, '.html');
      } else if (targetIndexUrl.includes('novellive.app') || targetIndexUrl.includes('novellive.com')) {
        const match = targetIndexUrl.match(/(https?:\/\/[^\/]+\/book\/[^\/]+)(?:\/.*)?/i);
        if (match) targetIndexUrl = match[1];
      } else if (targetIndexUrl.includes('webnovel.com')) {
        const match = targetIndexUrl.match(/(https?:\/\/[^\/]+\/book\/[^\/]+)(?:\/.*)?/i);
        if (match) targetIndexUrl = match[1];
      } else if (targetIndexUrl.includes('royalroad.com')) {
        const match = targetIndexUrl.match(/(https?:\/\/[^\/]+\/fiction\/\d+\/[^\/]+)(?:\/.*)?/i);
        if (match) targetIndexUrl = match[1];
      } else if (targetIndexUrl.includes('scribblehub.com')) {
        const match = targetIndexUrl.match(/scribblehub\.com\/read\/(\d+)\/([^\/]+)/i);
        if (match) targetIndexUrl = `https://www.scribblehub.com/series/${match[1]}/${match[2]}/`;
      }

      const lockKey = `novel-index:${targetIndexUrl}`;
      return await inFlightLock.runExclusive(lockKey, async () => {
        if (io) {
          io.emit('translation:progress', {
            status: 'indexing',
            initiatorUserId: creatorId,
            message: targetIndexUrl.includes('dek-d.com')
              ? 'กำลังดึงรายชื่อบทนิยายและข้อมูลจาก Dek-D...'
              : 'กำลังกวาดสายตาดึงรายชื่อบทนิยายทั้งหมดจากหน้าหลัก...',
            url: targetIndexUrl,
          });
        }

        const indexData = await scrapeNovelIndex(targetIndexUrl);

        if (!indexData.chapters || indexData.chapters.length === 0) {
          return await processSingleChapter(url, session, io, category, fandomId);
        }

        let author = await prisma.author.findUnique({
          where: { name: indexData.authorName },
        });
        if (!author) {
          author = await prisma.author.create({
            data: { name: indexData.authorName },
          });
        }

        const cleanUrl = targetIndexUrl.trim().replace(/\/+$/, '');
        const bookIdMatch = cleanUrl.match(/(?:book|fiction)\/(?:[^\/]+_)?(\d+)/i);
        const fanmtlMatch = cleanUrl.match(/fanmtl\.com\/novel\/([^.]+)\.html/i);
        const dekdMatch = cleanUrl.match(/[?&]id=(\d+)/i) || cleanUrl.match(/dek-d\.com\/(?:writer|novel)\/(\d+)/i);
        const novelliveMatch = cleanUrl.match(/novellive\.(?:app|com)\/book\/([^\/]+)/i);
        const bookIdentifier = bookIdMatch
          ? bookIdMatch[1]
          : fanmtlMatch
          ? fanmtlMatch[1]
          : dekdMatch
          ? dekdMatch[1]
          : novelliveMatch
          ? novelliveMatch[1]
          : cleanUrl;

        let novel = await prisma.novel.findFirst({
          where: {
            deletedAt: null,
            OR: [
              { sourceUrl: cleanUrl },
              { sourceUrl: cleanUrl + '/' },
              ...(bookIdMatch || fanmtlMatch || dekdMatch ? [{ sourceUrl: { contains: bookIdentifier } }] : []),
              { titleEn: indexData.title },
              { titleTh: indexData.title },
            ],
          },
        });

        const isThaiNovel =
          targetIndexUrl.includes('dek-d.com') ||
          isThaiText(indexData.title) ||
          (indexData.description && isThaiText(indexData.description));

        if (!novel) {
          const translatedNovelTitle = isThaiNovel ? indexData.title : await safeTranslateTitle(indexData.title);
          novel = await prisma.novel.create({
            data: {
              titleEn: indexData.title,
              titleTh: translatedNovelTitle,
              sourceUrl: targetIndexUrl,
              category: category.trim(),
              fandomId: fandomId ?? null,
              coverUrl: indexData.coverUrl || null,
              description: indexData.description || null,
              totalChapters: indexData.chapters.length,
              translationStatus: 'TRANSLATING',
              authorId: author.id,
              createdById: creatorId,
            },
          });

          if (io) {
            io.emit('novel:created', {
              novelId: novel.id,
              titleTh: novel.titleTh,
              titleEn: novel.titleEn,
              coverUrl: novel.coverUrl,
              authorName: author.name,
              category: novel.category,
            });
          }

          await recordAuditLog({
            userId: session.id,
            action: 'NOVEL_CREATE',
            entity: 'NOVEL',
            entityId: novel.id,
            details: `นำเข้านิยายเรื่อง "${novel.titleTh || novel.titleEn}" (${indexData.chapters.length} ตอน) [หมวดหมู่: ${category}]`,
            request,
          });
        } else {
          const updateData: any = {
            totalChapters: indexData.chapters.length,
            translationStatus: 'TRANSLATING',
          };
          if (category && (!novel.category || category !== novel.category)) {
            updateData.category = category.trim();
          }
          if (fandomId) updateData.fandomId = fandomId;
          if (!novel.coverUrl && indexData.coverUrl) updateData.coverUrl = indexData.coverUrl;
          if (!novel.description && indexData.description) updateData.description = indexData.description;
          if (author.id && author.id !== novel.authorId) updateData.authorId = author.id;
          novel = await prisma.novel.update({
            where: { id: novel.id },
            data: updateData,
          });
        }

        // Synchronously translate Chapter 1 so the user can begin reading immediately
        let firstChapter = await prisma.chapter.findFirst({
          where: { novelId: novel.id, deletedAt: null },
          orderBy: { chapterNumber: 'asc' },
        });

        if (firstChapter && !isThaiNovel) {
          let firstTh: string[] = [];
          try {
            firstTh = JSON.parse(firstChapter.contentTh || '[]');
          } catch {}
          if (!isThaiText(firstTh) || (firstChapter.contentTh && firstChapter.contentTh.includes('[แปลไม่สำเร็จ'))) {
            let contentEn: string[] = [];
            try {
              contentEn = JSON.parse(firstChapter.contentEn || '[]');
            } catch {}
            if (contentEn.length > 0) {
              try {
                const {
                  draft: [translatedTitle, ...translatedBody],
                } = await translateWithGlossary(novel.id, [firstChapter.titleEn || 'ตอนที่ 1', ...contentEn]);
                firstChapter = await prisma.chapter.update({
                  where: { id: firstChapter.id },
                  data: {
                    titleTh: translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : firstChapter.titleTh,
                    contentTh: JSON.stringify(translatedBody),
                  },
                });
              } catch (e: any) {
                console.error('Failed to re-translate first chapter:', e.message);
              }
            }
          }
        }

        if (!firstChapter && indexData.chapters.length > 0) {
          const firstLink = indexData.chapters[0];
          try {
            if (io) {
              io.emit('translation:progress', {
                status: 'translating',
                initiatorUserId: creatorId,
                message: isThaiNovel
                  ? `กำลังนำเข้าตอนที่ 1 (${firstLink.title})...`
                  : `กำลังแปลตอนที่ 1 (${firstLink.title})...`,
                url: firstLink.url,
              });
            }

            const scrapedFirst = await scrapeNovelChapter(firstLink.url);
            if (scrapedFirst.paragraphs && scrapedFirst.paragraphs.length > 0) {
              const isChapterThai = isThaiNovel || isThaiText(scrapedFirst.paragraphs);
              let titleTh = scrapedFirst.title || firstLink.title || 'ตอนที่ 1';
              let contentTh = scrapedFirst.paragraphs;

              if (!isChapterThai) {
                const enWithTitle = [scrapedFirst.title || firstLink.title, ...scrapedFirst.paragraphs];
                try {
                  const {
                    draft: [translatedTitle, ...translatedBody],
                    glossary,
                  } = await translateWithGlossary(novel.id, enWithTitle);
                  if (translatedTitle && !translatedTitle.startsWith('[')) titleTh = translatedTitle;
                  contentTh = translatedBody;

                  // AI Polish for Chapter 1 when quality=polished
                  if (enablePolish && contentTh.length > 0) {
                    try {
                      const polishContext = {
                        novelTitle: novel.titleTh || novel.titleEn,
                        genre: novel.genre || novel.category || undefined,
                        glossary: toPromptGlossary(glossary),
                      };
                      const result = await polishParagraphs(enWithTitle, [titleTh, ...contentTh], polishContext, undefined, {
                        provider: providerOverride,
                      });
                      if (result.failedBatches === 0) {
                        const [polishedTitle, ...polishedBody] = applySafeNameReplacer(result.paragraphs, glossary);
                        if (polishedTitle && !polishedTitle.startsWith('[')) titleTh = polishedTitle;
                        contentTh = polishedBody;
                      }
                    } catch (polishErr: any) {
                      console.warn('Chapter 1 polish failed, keeping Google draft:', polishErr.message);
                    }
                  }
                } catch (e: any) {
                  console.error('Failed to translate first chapter synchronously:', e.message);
                }
              }

              firstChapter = await prisma.chapter.create({
                data: {
                  novelId: novel.id,
                  chapterNumber: 1,
                  titleEn: scrapedFirst.title || firstLink.title,
                  titleTh,
                  contentEn: JSON.stringify(scrapedFirst.paragraphs),
                  contentTh: JSON.stringify(contentTh),
                  contentThGoogle: JSON.stringify(contentTh),
                  status: ChapterStatus.TRANSLATED_GT,
                  originalUrl: firstLink.url,
                },
              });

              // Enqueue Chapter 1 for polish if enabled
              if (enablePolish) {
                enqueueChapterForPolish(firstChapter.id);
              }

              if (io) {
                io.emit('chapter:created', {
                  chapterId: firstChapter.id,
                  novelId: novel.id,
                  titleTh: novel.titleTh,
                  titleEn: novel.titleEn,
                  chapterTitle: titleTh,
                  coverUrl: novel.coverUrl,
                  authorName: author.name,
                  chapterNumber: 1,
                });
              }
            }
          } catch (e: any) {
            console.error('Error translating first chapter synchronously:', e.message);
          }
        }

        // Get all existing chapter numbers for this novel to prevent unique constraint collision
        const existingChapRecords = await prisma.chapter.findMany({
          where: { novelId: novel.id },
          select: { chapterNumber: true },
        });
        const existingChapNumbers = new Set(existingChapRecords.map((c) => c.chapterNumber));

        // Bulk index all remaining chapters as TOC_ONLY (filter out existing chapter numbers)
        const tocChapterData = indexData.chapters
          .map((chap, idx) => ({
            id: crypto.randomUUID(),
            novelId: novel.id,
            chapterNumber: chap.chapterNumber || idx + 1,
            titleEn: chap.title || `Chapter ${idx + 1}`,
            titleTh: chap.title || `Chapter ${idx + 1}`,
            originalUrl: chap.url,
            status: ChapterStatus.TOC_ONLY,
          }))
          .filter((chap) => !existingChapNumbers.has(chap.chapterNumber));

        // Chunk inserts in batches of 500
        const CHUNK_SIZE = 500;
        for (let i = 0; i < tocChapterData.length; i += CHUNK_SIZE) {
          const slice = tocChapterData.slice(i, i + CHUNK_SIZE);
          if (slice.length > 0) {
            await prisma.chapter.createMany({
              data: slice,
            });
          }
        }

        // Catalog is ready; keep TRANSLATING while the background batch fills every chapter.
        await prisma.novel.update({
          where: { id: novel.id },
          data: { totalChapters: indexData.chapters.length, translationStatus: 'TRANSLATING' },
        });

        if (io) {
          io.emit('novel:indexed', {
            novelId: novel.id,
            totalChapters: indexData.chapters.length,
          });
        }

        // Fire-and-forget: translate the whole novel in the background (upserts the TOC_ONLY
        // placeholders). Marks the novel COMPLETED when done; JIT fetch still covers any chapter
        // the reader opens before the batch reaches it.
        const chapterLinks = indexData.chapters.map((c, idx) => ({
          chapterNumber: c.chapterNumber || idx + 1,
          title: c.title || `Chapter ${idx + 1}`,
          url: c.url,
        }));
        processBatchChaptersAsync(novel, author, chapterLinks, io, enablePolish, creatorId, providerOverride).catch(
          (e: any) => console.error('[ScrapeRoute] background batch failed:', e?.message || e)
        );

        return NextResponse.json({
          success: true,
          isBatch: true,
          chapterId: firstChapter?.id || null,
          novelId: novel.id,
          novelTitle: novel.titleTh || novel.titleEn,
          totalChapters: indexData.chapters.length,
          message: `สร้างสารบัญครบทั้ง ${indexData.chapters.length} ตอนแล้ว! กำลังแปลทั้งเรื่องอยู่เบื้องหลัง (เปิดอ่านตอนไหนก็ได้ทันทีแบบ JIT)`,
        });
      });
    }

    return await processSingleChapter(url, session, io, category, fandomId);
  } catch (err: any) {
    console.error('Scrape and translate error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลหรือแปลเนื้อหา' },
      { status: 500 }
    );
  }
}

// A novel with an English title is fine; a failed title translation is not worth failing on.
async function safeTranslateTitle(titleEn: string): Promise<string> {
  try {
    return await translateTitleGoogle(titleEn);
  } catch (err: any) {
    console.error('Title translation failed, keeping English:', err.message);
    return titleEn;
  }
}

async function processSingleChapter(url: string, session: any, io: any, category?: string, fandomId?: string) {
  const lockKey = `single-chapter:${url}`;
  return await inFlightLock.runExclusive(lockKey, async () => {
    const existingChapter = await prisma.chapter.findFirst({
      where: { originalUrl: url, deletedAt: null },
      include: { novel: { include: { author: true } } },
    });

  if (existingChapter) {
    let parsedTh: string[] = [];
    try {
      parsedTh = JSON.parse(existingChapter.contentTh || '[]');
    } catch {}

    const isThai = existingChapter.originalUrl.includes('dek-d.com') || isThaiText(parsedTh);
    if (!isThai) {
      let contentEn: string[] = [];
      try {
        contentEn = JSON.parse(existingChapter.contentEn || '[]');
      } catch {}
      if (contentEn.length > 0) {
        try {
          const {
            draft: [translatedTitle, ...translatedBody],
          } = await translateWithGlossary(existingChapter.novelId, [existingChapter.titleEn || 'ตอนที่ 1', ...contentEn]);
          const updated = await prisma.chapter.update({
            where: { id: existingChapter.id },
            data: {
              titleTh: translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : existingChapter.titleTh,
              contentTh: JSON.stringify(translatedBody),
            },
          });
          existingChapter.titleTh = updated.titleTh;
          existingChapter.contentTh = updated.contentTh;
        } catch (e: any) {
          console.error('Failed to re-translate existing chapter:', e.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      isExisting: true,
      chapterId: existingChapter.id,
      novelId: existingChapter.novelId,
      titleEn: existingChapter.titleEn,
      titleTh: existingChapter.titleTh,
      contentEn: JSON.parse(existingChapter.contentEn || '[]'),
      contentTh: JSON.parse(existingChapter.contentTh || '[]'),
      originalUrl: existingChapter.originalUrl,
      novelTitle: existingChapter.novel.titleTh || existingChapter.novel.titleEn,
    });
  }

  if (io) {
    io.emit('translation:progress', {
      status: 'scraping',
      message: 'กำลังดึงเนื้อหาจากเว็บนิยายต้นฉบับ...',
      url,
    });
  }

  const scrapedData = await scrapeNovelChapter(url);

  if (!scrapedData.paragraphs || scrapedData.paragraphs.length === 0) {
    return NextResponse.json(
      { success: false, error: 'ไม่พบเนื้อหานิยายใน URL ที่ระบุ กรุณาตรวจสอบลิงก์อีกครั้ง' },
      { status: 400 }
    );
  }

  let author = await prisma.author.findUnique({
    where: { name: scrapedData.authorName },
  });
  if (!author) {
    author = await prisma.author.create({
      data: { name: scrapedData.authorName },
    });
  }

  const novelSourceUrl = url.includes('fanmtl.com') ? url.replace(/_\d+\.html$/i, '.html') : url;
  const mainTitleEn = scrapedData.novelTitle || scrapedData.title.split('-')[0].split('|')[0].trim();
  let novel = await prisma.novel.findFirst({
    where: {
      OR: [{ sourceUrl: novelSourceUrl }, { sourceUrl: url }, { titleEn: mainTitleEn }],
      deletedAt: null,
    },
  });

  const isThaiContent = url.includes('dek-d.com') || isThaiText(scrapedData.paragraphs);

  if (!novel) {
    const creatorId = session.id;

    const translatedNovelTitle = isThaiContent ? mainTitleEn : await safeTranslateTitle(mainTitleEn);
    novel = await prisma.novel.create({
      data: {
        titleEn: mainTitleEn,
        titleTh: translatedNovelTitle,
        sourceUrl: novelSourceUrl,
        category: category?.trim() || null,
        fandomId: fandomId ?? null,
        coverUrl: scrapedData.coverUrl || null,
        authorId: author.id,
        createdById: creatorId,
      },
    });

    if (io) {
      io.emit('novel:created', {
        novelId: novel.id,
        titleTh: novel.titleTh,
        titleEn: novel.titleEn,
      });
    }
  } else if ((category && !novel.category) || fandomId) {
    novel = await prisma.novel.update({
      where: { id: novel.id },
      data: {
        ...(category && !novel.category ? { category: category.trim() } : {}),
        ...(fandomId ? { fandomId } : {}),
      },
    });
  }

  let titleTh = scrapedData.title;
  let contentTh = scrapedData.paragraphs;

  if (isThaiContent) {
    if (io) {
      io.emit('translation:progress', {
        status: 'translating',
        initiatorUserId: session.id,
        message: 'นำเข้าเนื้อหาภาษาไทยโดยตรง...',
        paragraphsCount: scrapedData.paragraphs.length,
      });
    }
  } else {
    if (io) {
      io.emit('translation:progress', {
        status: 'translating',
        initiatorUserId: session.id,
        message: 'กำลังแปลเป็นภาษาไทยด้วย Google Translate...',
        paragraphsCount: scrapedData.paragraphs.length,
      });
    }

    titleTh = await safeTranslateTitle(scrapedData.title);
    ({ draft: contentTh } = await translateWithGlossary(novel.id, scrapedData.paragraphs, (done, total) => {
      if (io) {
        io.emit('translation:progress', {
          status: 'translating_batch',
          initiatorUserId: session.id,
          currentBatch: done,
          totalBatches: total,
          percent: Math.round((done / total) * 100),
        });
      }
    }));
  }

  const currentChapterCount = await prisma.chapter.count({
    where: { novelId: novel.id, deletedAt: null },
  });

  const chapter = await prisma.chapter.create({
    data: {
      novelId: novel.id,
      chapterNumber: currentChapterCount + 1,
      titleEn: scrapedData.title,
      titleTh,
      contentEn: JSON.stringify(scrapedData.paragraphs),
      contentTh: JSON.stringify(contentTh),
      originalUrl: url,
    },
  });

  if (io) {
    io.emit('chapter:created', {
      chapterId: chapter.id,
      novelId: novel.id,
      chapterNumber: chapter.chapterNumber,
      titleTh: novel.titleTh,
      titleEn: novel.titleEn,
      chapterTitle: titleTh,
      coverUrl: novel.coverUrl,
      authorName: author.name,
    });

    io.emit('translation:progress', {
      status: 'completed',
      initiatorUserId: session.id,
      message: isThaiContent ? 'นำเข้าเนื้อหาสมบูรณ์พร้อมอ่าน!' : 'แปลเนื้อหาสมบูรณ์พร้อมอ่าน!',
      chapterId: chapter.id,
    });
  }

    return NextResponse.json({
      success: true,
      chapterId: chapter.id,
      novelId: novel.id,
      titleEn: scrapedData.title,
      titleTh,
      contentEn: scrapedData.paragraphs,
      contentTh,
      originalUrl: url,
      novelTitle: novel.titleTh || novel.titleEn,
    });
  });
}
