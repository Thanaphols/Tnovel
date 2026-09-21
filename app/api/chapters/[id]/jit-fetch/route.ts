import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ChapterStatus, JobType, ErrorCode } from '@/lib/enums';
import { inFlightLock } from '@/lib/inFlightLock';
import { claimChapterJob, completeChapterJob, failChapterJob, waitForJobCompletion } from '@/lib/jobQueue';
import { scrapeNovelChapter } from '@/lib/scraper';
import { translateParagraphsGoogle } from '@/lib/googleTranslate';
import { enqueueChapterForPolish } from '@/lib/polishQueue';

function calculateSourceHash(paragraphs: string[]): string {
  const normalized = paragraphs
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0)
    .join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;
  const lockKey = `${chapterId}:${JobType.FETCH_AND_TRANSLATE}`;

  return await inFlightLock.runExclusive(lockKey, async () => {
    // 1. Check if chapter is already translated
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { novel: true },
    });

    if (!chapter) {
      return NextResponse.json({ success: false, error: 'ไม่พบบทนิยายนี้' }, { status: 404 });
    }

    if (
      chapter.status === ChapterStatus.POLISHED ||
      chapter.status === ChapterStatus.TRANSLATED_GT
    ) {
      return NextResponse.json({
        success: true,
        chapter: {
          id: chapter.id,
          titleTh: chapter.titleTh,
          titleEn: chapter.titleEn,
          contentTh: chapter.contentThPolished || chapter.contentThGoogle || chapter.contentTh,
          contentEn: chapter.contentEn,
          status: chapter.status,
        },
      });
    }

    // 2. Layer 2: Claim Distributed Job Lock
    const claim = await claimChapterJob(chapterId, JobType.FETCH_AND_TRANSLATE, 30000);

    if (!claim.acquired) {
      // Another process is already fetching/translating this chapter! Wait for it.
      const waitRes = await waitForJobCompletion(chapterId, JobType.FETCH_AND_TRANSLATE, 12000);
      if (waitRes.success) {
        const completed = await prisma.chapter.findUnique({ where: { id: chapterId } });
        return NextResponse.json({
          success: true,
          chapter: {
            id: completed?.id,
            titleTh: completed?.titleTh,
            titleEn: completed?.titleEn,
            contentTh: completed?.contentThPolished || completed?.contentThGoogle || completed?.contentTh,
            contentEn: completed?.contentEn,
            status: completed?.status,
          },
        });
      }

      return NextResponse.json(
        { success: false, error: 'การดึงข้อมูลจากเว็บต้นทางใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง' },
        { status: 408 }
      );
    }

    const jobId = claim.jobId!;
    const overallStart = Date.now();

    try {
      // Step A: Source Fetch
      const fetchStart = Date.now();
      const scraped = await scrapeNovelChapter(chapter.originalUrl);

      if (!scraped.paragraphs || scraped.paragraphs.length === 0) {
        throw new Error('ไม่พบเนื้อหาข้อความในบทนี้จากเว็บต้นทาง');
      }

      const fetchDurationMs = Date.now() - fetchStart;
      const paragraphsEn = scraped.paragraphs;
      const sourceHash = calculateSourceHash(paragraphsEn);
      const titleEn = scraped.title || chapter.titleEn;

      // Step B: Fast Google Translation
      const translateStart = Date.now();
      const [translatedTitle, ...translatedBody] = await translateParagraphsGoogle([
        titleEn,
        ...paragraphsEn,
      ]);
      const translateDurationMs = Date.now() - translateStart;

      const finalTitleTh = translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : chapter.titleTh || titleEn;
      const finalBodyTh = translatedBody;

      // Step C: Persist Google Draft & update status
      const updated = await prisma.chapter.update({
        where: { id: chapterId },
        data: {
          titleEn,
          titleTh: finalTitleTh,
          contentEn: JSON.stringify(paragraphsEn),
          contentThGoogle: JSON.stringify(finalBodyTh),
          contentTh: JSON.stringify(finalBodyTh),
          status: ChapterStatus.TRANSLATED_GT,
          sourceHash,
          fetchedAt: new Date(),
          translatedAt: new Date(),
          fetchDurationMs,
          translateDurationMs,
          errorCode: ErrorCode.NONE,
          errorMessage: null,
        },
      });

      await completeChapterJob(jobId);

      // Step D: Enqueue asynchronous AI polish in the background
      enqueueChapterForPolish(chapterId);

      console.log(`[JIT] Chapter ${chapter.chapterNumber} fetched & translated in ${Date.now() - overallStart}ms (Fetch: ${fetchDurationMs}ms, Translate: ${translateDurationMs}ms).`);

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
      console.error(`[JIT] Failed to fetch/translate chapter ${chapterId}:`, err);
      const errorCode = err.errorCode || ErrorCode.SOURCE_PARSE_ERROR;
      const errorMessage = err.message || 'ดึงเนื้อหาจากเว็บต้นทางไม่สำเร็จ';

      await failChapterJob(jobId, errorCode, errorMessage);

      await prisma.chapter.update({
        where: { id: chapterId },
        data: {
          status: ChapterStatus.FETCH_FAILED,
          errorCode,
          errorMessage,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          errorCode,
          canManualPaste: true,
        },
        { status: 500 }
      );
    }
  });
}
