import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { scrapeNovelChapter, scrapeNovelIndex } from '@/lib/scraper';
import { translateParagraphsGoogle, translateTitleGoogle } from '@/lib/googleTranslate';
import { processBatchChaptersAsync } from '@/lib/batchTranslator';

export async function POST(request: Request) {
  try {
    const { url, mode = 'auto' } = await request.json();

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุ URL เว็บนิยายที่ถูกต้อง (เช่น https://...)' },
        { status: 400 }
      );
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'กรุณาเข้าสู่ระบบก่อน จึงจะเพิ่มนิยายแปลได้' },
        { status: 401 }
      );
    }
    const creatorId = session.id;

    const io = (global as any).io;

    const isFanmtlChapter = url.includes('fanmtl.com') && /_\d+\.html$/i.test(url);
    const isNovelIndex =
      mode === 'full_novel' ||
      (mode !== 'single' && !url.includes('/chapter') && !url.includes('chapter-') && !isFanmtlChapter);

    if (isNovelIndex) {
      const targetIndexUrl = url.includes('fanmtl.com') ? url.replace(/_\d+\.html$/i, '.html') : url;

      if (io) {
        io.emit('translation:progress', {
          status: 'indexing',
          message: 'กำลังกวาดสายตาดึงรายชื่อบทนิยายทั้งหมดจากหน้าหลัก...',
          url: targetIndexUrl,
        });
      }

      const indexData = await scrapeNovelIndex(targetIndexUrl);

      if (!indexData.chapters || indexData.chapters.length === 0) {
        return processSingleChapter(url, session, io);
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
      const bookIdentifier = bookIdMatch ? bookIdMatch[1] : (fanmtlMatch ? fanmtlMatch[1] : cleanUrl);

      let novel = await prisma.novel.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { sourceUrl: cleanUrl },
            { sourceUrl: cleanUrl + '/' },
            ...(bookIdMatch || fanmtlMatch ? [{ sourceUrl: { contains: bookIdentifier } }] : []),
            { titleEn: indexData.title },
          ],
        },
      });

      if (!novel) {
        const translatedNovelTitle = await safeTranslateTitle(indexData.title);
        novel = await prisma.novel.create({
          data: {
            titleEn: indexData.title,
            titleTh: translatedNovelTitle,
            sourceUrl: targetIndexUrl,
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
          });
        }
      } else {
        const updateData: any = {
          totalChapters: indexData.chapters.length,
          translationStatus: 'TRANSLATING',
        };
        if (!novel.coverUrl && indexData.coverUrl) updateData.coverUrl = indexData.coverUrl;
        if (!novel.description && indexData.description) updateData.description = indexData.description;
        if (author.id && author.id !== novel.authorId) updateData.authorId = author.id;
        novel = await prisma.novel.update({
          where: { id: novel.id },
          data: updateData,
        });
      }

      processBatchChaptersAsync(novel, author, indexData.chapters, io);

      return NextResponse.json({
        success: true,
        isBatch: true,
        novelId: novel.id,
        novelTitle: novel.titleTh || novel.titleEn,
        totalChapters: indexData.chapters.length,
        message: `เริ่มต้นดึงและแปลนิยายทั้งเรื่อง (${indexData.chapters.length} ตอน) เบื้องหลังเรียบร้อยแล้ว!`,
      });
    }

    return processSingleChapter(url, session, io);
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

async function processSingleChapter(url: string, session: any, io: any) {
  const existingChapter = await prisma.chapter.findFirst({
    where: { originalUrl: url, deletedAt: null },
    include: { novel: { include: { author: true } } },
  });

  if (existingChapter) {
    return NextResponse.json({
      success: true,
      isExisting: true,
      chapterId: existingChapter.id,
      novelId: existingChapter.novelId,
      titleEn: existingChapter.titleEn,
      titleTh: existingChapter.titleTh,
      contentEn: JSON.parse(existingChapter.contentEn),
      contentTh: JSON.parse(existingChapter.contentTh),
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

  if (!novel) {
    const creatorId = session.id;

    const translatedNovelTitle = await safeTranslateTitle(mainTitleEn);
    novel = await prisma.novel.create({
      data: {
        titleEn: mainTitleEn,
        titleTh: translatedNovelTitle,
        sourceUrl: novelSourceUrl,
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
  }

  if (io) {
    io.emit('translation:progress', {
      status: 'translating',
      message: 'กำลังแปลเป็นภาษาไทยด้วย Google Translate...',
      paragraphsCount: scrapedData.paragraphs.length,
    });
  }

  const titleTh = await safeTranslateTitle(scrapedData.title);
  const contentTh = await translateParagraphsGoogle(scrapedData.paragraphs, (done, total) => {
    if (io) {
      io.emit('translation:progress', {
        status: 'translating_batch',
        currentBatch: done,
        totalBatches: total,
        percent: Math.round((done / total) * 100),
      });
    }
  });

  const currentChapterCount = await prisma.chapter.count({
    where: { novelId: novel.id },
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
      titleTh: novel.titleTh,
      titleEn: novel.titleEn,
      chapterTitle: titleTh,
      coverUrl: novel.coverUrl,
      authorName: author.name,
    });

    io.emit('translation:progress', {
      status: 'completed',
      message: 'แปลเนื้อหาสมบูรณ์พร้อมอ่าน!',
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
}
