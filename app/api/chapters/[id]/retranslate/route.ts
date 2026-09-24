import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { isThaiText, scrapeNovelChapter } from '@/lib/scraper';
import { ChapterStatus } from '@/lib/enums';
import { getLLMProvider } from '@/lib/llm/provider';
import { isAIProvider } from '@/lib/aiSettings';
import { applySafeNameReplacer } from '@/lib/nameReplacer';
import { detectEnglishLeak } from '@/lib/translation/detectEnglishLeak';
import { acquirePriorityLease, heartbeatPriorityLease, releasePriorityLease } from '@/lib/systemLock';
import {
  autoDiscoverAndSaveGlossary,
  getRelevantGlossary,
  translateWithGlossary,
  toPromptGlossary,
  type GlossaryTerm,
} from '@/lib/glossaryService';

const FAILURE_PREFIXES = ['[แปลผิดพลาด', '[ยังไม่ได้ใส่', '[กำลังรอโควตา', '[แปลไม่สำเร็จ', '[แปล]', '[ต้นฉบับ]'];
const FAILURE_RATIO = 0.3;

function looksFailed(paragraphs: string[]): boolean {
  if (paragraphs.length === 0) return true;
  const bad = paragraphs.filter((p) => FAILURE_PREFIXES.some((prefix) => p.startsWith(prefix))).length;
  return bad / paragraphs.length > FAILURE_RATIO;
}

function parseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Polish can run past Cloudflare's 100s origin timeout (-> HTML error page instead of JSON).
// Fast results keep their real status; slow ones stream whitespace heartbeats, then the JSON
// (JSON.parse ignores leading whitespace, so callers need no change). Status is then always 200,
// so callers must check `success` — both callers already do.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const work = handleRetranslate(request, ctx);
  const fast = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), 10_000))]);
  if (fast) return fast;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const beat = setInterval(() => controller.enqueue(enc.encode(' ')), 15_000);
      controller.enqueue(enc.encode(' '));
      try {
        controller.enqueue(enc.encode(await (await work).text()));
      } finally {
        clearInterval(beat);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-transform' },
  });
}

async function handleRetranslate(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const ownerId = crypto.randomUUID();
  let leaseAcquired = false;

  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const engine: 'google' | 'polish' = body?.engine === 'polish' ? 'polish' : 'google';
    const providerOverride: string | undefined = isAIProvider(body?.provider) ? body.provider : undefined;
    const isBatch = Boolean(body?.isBatch);
    const batchIndex = typeof body?.batchIndex === 'number' ? body.batchIndex : 1;
    const batchTotal = typeof body?.batchTotal === 'number' ? body.batchTotal : 1;
    const isLastChapter = isBatch && batchIndex >= batchTotal;
    const io = (global as any).io;

    const chapter = await prisma.chapter.findFirst({
      where: { id, deletedAt: null },
      include: { novel: { include: { glossaries: true } } },
    });
    if (!chapter) {
      return NextResponse.json({ success: false, error: 'ไม่พบบทนิยายนี้' }, { status: 404 });
    }

    let contentEn = parseArray(chapter.contentEn);
    let titleEn = chapter.titleEn;

    // JIT Source Fetch: If this chapter has no English text stored yet (e.g. TOC_ONLY),
    // automatically fetch the content from originalUrl so translation/polish works in 1 click!
    if (contentEn.length === 0) {
      if (!chapter.originalUrl) {
        return NextResponse.json(
          { success: false, error: 'บทนี้ไม่มีต้นฉบับและไม่มีลิงก์เว็บต้นทาง ไม่สามารถดึงเนื้อหาได้' },
          { status: 400 }
        );
      }

      if (io) {
        io.emit('translation:progress', {
          status: 'batch_progress',
          jobType: isBatch ? 'batch' : 'single_chapter',
          initiatorUserId: session.id,
          novelId: chapter.novelId,
          chapterId: chapter.id,
          novelTitle: chapter.novel?.titleTh || chapter.novel?.titleEn,
          chapterTitle: `📥 ดึงเนื้อหา: ${chapter.titleTh || chapter.titleEn || `ตอนที่ ${chapter.chapterNumber}`}`,
          currentChapter: isBatch ? batchIndex : 1,
          totalChapters: isBatch ? batchTotal : 1,
          percent: isBatch ? Math.round(((batchIndex - 1) / batchTotal) * 100) : 5,
          message: `กำลังดึงเนื้อหาจากเว็บต้นทาง...`,
          isPaused: false,
          updatedAt: new Date().toISOString(),
        });
      }

      try {
        const scraped = await scrapeNovelChapter(chapter.originalUrl);
        if (!scraped.paragraphs || scraped.paragraphs.length === 0) {
          return NextResponse.json(
            { success: false, error: 'ไม่พบเนื้อหาข้อความในบทนี้จากเว็บต้นทาง' },
            { status: 404 }
          );
        }

        contentEn = scraped.paragraphs;
        if (scraped.title && (!titleEn || titleEn.startsWith('ตอนที่'))) {
          titleEn = scraped.title;
        }

        // Persist fetched contentEn immediately to database
        await prisma.chapter.update({
          where: { id: chapter.id },
          data: {
            titleEn: titleEn || chapter.titleEn,
            contentEn: JSON.stringify(contentEn),
            status: ChapterStatus.FETCHED,
            fetchedAt: new Date(),
          },
        });
      } catch (scrapeErr: any) {
        console.error(`[Retranslate JIT] Failed to scrape ${chapter.originalUrl}:`, scrapeErr.message || scrapeErr);
        return NextResponse.json(
          { success: false, error: `ดึงเนื้อหาจากเว็บต้นทางไม่สำเร็จ: ${scrapeErr.message || 'ไม่สามารถเข้าถึงหน้าเว็บต้นทางได้'}` },
          { status: 422 }
        );
      }
    }

    if ((chapter.originalUrl && chapter.originalUrl.includes('dek-d.com')) || isThaiText(contentEn)) {
      return NextResponse.json({
        success: true,
        alreadyPolished: true,
        message: 'นิยายเรื่องนี้เป็นภาษาไทยต้นฉบับอยู่แล้ว ไม่จำเป็นต้องแปลใหม่',
        titleTh: chapter.titleTh,
        contentTh: parseArray(chapter.contentTh),
      });
    }

    const novelName = chapter.novel?.titleTh || chapter.novel?.titleEn || 'นิยาย';
    const chapterDisplayName = chapter.titleTh || chapter.titleEn || `ตอนที่ ${chapter.chapterNumber}`;

    if (isBatch && io) {
      const startPct = Math.round(((batchIndex - 1) / batchTotal) * 100);
      (global as any).activeTranslationJob = {
        isActive: true,
        initiatorUserId: session.id,
        novelId: chapter.novelId,
        novelTitle: novelName,
        chapterTitle: `ตอนที่ ${chapter.chapterNumber}: ${chapterDisplayName}`,
        currentChapter: batchIndex,
        totalChapters: batchTotal,
        percent: startPct,
        isPaused: false,
        updatedAt: new Date().toISOString(),
      };
      io.emit('translation:progress', {
        status: 'batch_progress',
        jobType: 'batch',
        initiatorUserId: session.id,
        novelId: chapter.novelId,
        chapterId: chapter.id,
        novelTitle: novelName,
        chapterTitle: engine === 'polish'
          ? `✨ เกลาสำนวน ตอนที่ ${batchIndex}/${batchTotal}: ${chapterDisplayName}`
          : `กำลังแปลด่วน (Google) ตอนที่ ${batchIndex}/${batchTotal}: ${chapterDisplayName}`,
        currentChapter: batchIndex,
        totalChapters: batchTotal,
        chapterCount: Math.max(0, batchIndex - 1),
        percent: startPct,
        isPaused: false,
        updatedAt: new Date().toISOString(),
      });
    }

    // Discover new names first so the Google draft below already uses them.
    if (engine === 'polish') await autoDiscoverAndSaveGlossary(chapter.novelId, contentEn);

    // Always draft from the stored English (free, ~2s), never from stored Thai.
    // Glossary (novel + fandom) terms are locked into the draft; the same snapshot feeds polish.
    const enWithTitle = [titleEn || chapter.titleEn || '', ...contentEn];
    let draft: string[] | null = null;
    let glossarySnapshot: GlossaryTerm[] = [];
    try {
      const fresh = await translateWithGlossary(chapter.novelId, enWithTitle);
      glossarySnapshot = fresh.glossary;
      if (!looksFailed(fresh.draft.slice(1))) draft = fresh.draft;
    } catch (err: any) {
      console.error('Retranslate: Google draft failed:', err.message);
    }

    if (!draft && engine === 'polish') {
      const stored = parseArray(chapter.contentTh);
      if (stored.length === contentEn.length && !looksFailed(stored)) draft = [chapter.titleTh, ...stored];
      if (glossarySnapshot.length === 0) glossarySnapshot = await getRelevantGlossary(chapter.novelId, enWithTitle, 30);
    }

    if (!draft) {
      return NextResponse.json(
        { success: false, error: 'Google Translate แปลไม่สำเร็จ เนื้อหาเดิมยังอยู่ครบ' },
        { status: 422 }
      );
    }

    let translated = draft;
    let polishedAt: Date | null = null;
    let providerName: string | null = null;
    let modelName: string | null = null;
    const glossaryCount = chapter.novel?.glossaries?.length || 0;

    if (engine === 'polish') {
      // Step 1: Acquire Priority Lease Lock to prevent queue workers from contending on GPU
      leaseAcquired = await acquirePriorityLease('MANUAL_POLISH_LOCK', 60, ownerId);
      if (leaseAcquired) {
        heartbeatTimer = setInterval(async () => {
          await heartbeatPriorityLease('MANUAL_POLISH_LOCK', ownerId, 60);
        }, 15000);
      }

      // Step 2: Glossary snapshot was frozen with the draft above (only terms in this chapter)
      const polishContext = {
        novelTitle: novelName,
        genre: chapter.novel?.genre || chapter.novel?.category || undefined,
        glossary: toPromptGlossary(glossarySnapshot),
      };

      const estTotalBatches = Math.ceil(draft.length / 10);
      const initialBatchPct = isBatch
        ? Math.round(((batchIndex - 1) / batchTotal) * 100)
        : 5;

      if (isBatch) {
        (global as any).activeTranslationJob = {
          isActive: true,
          initiatorUserId: session.id,
          novelId: chapter.novelId,
          novelTitle: novelName,
          chapterTitle: `ตอนที่ ${chapter.chapterNumber}: ${chapterDisplayName}`,
          currentChapter: batchIndex,
          totalChapters: batchTotal,
          percent: initialBatchPct,
          isPaused: false,
          updatedAt: new Date().toISOString(),
        };
      }

      if (io) {
        io.emit('translation:progress', {
          status: 'batch_progress',
          jobType: isBatch ? 'batch' : 'single_chapter',
          initiatorUserId: session.id,
          novelId: chapter.novelId,
          chapterId: chapter.id,
          novelTitle: novelName,
          chapterTitle: isBatch
            ? `✨ เกลาสำนวน ตอนที่ ${batchIndex}/${batchTotal}: ${chapterDisplayName}`
            : `✨ เกลาสำนวน: ${chapterDisplayName}`,
          currentChapter: isBatch ? batchIndex : 1,
          totalChapters: isBatch ? batchTotal : estTotalBatches,
          chapterCount: isBatch ? Math.max(0, batchIndex - 1) : 0,
          percent: initialBatchPct,
          isPaused: false,
          updatedAt: new Date().toISOString(),
        });
      }

      const provider = await getLLMProvider({ provider: providerOverride });
      providerName = provider.name;
      modelName = provider.modelName;

      const polishResult = await provider.polish({
        chapterNumber: chapter.chapterNumber,
        titleEn: titleEn || chapter.titleEn || '',
        titleThDraft: draft[0] || chapter.titleTh,
        paragraphsEn: contentEn,
        paragraphsThDraft: draft.slice(1),
        context: polishContext,
        onProgress: (currentBatch, totalBatches) => {
          if (io) {
            let pct: number;
            let currentCh: number;
            let totalCh: number;
            let jobT: 'batch' | 'single_chapter';
            let titleText: string;

            if (isBatch) {
              jobT = 'batch';
              currentCh = batchIndex;
              totalCh = batchTotal;
              const chapterFraction = currentBatch / totalBatches;
              pct = Math.min(99, Math.round((((batchIndex - 1) + chapterFraction) / batchTotal) * 100));
              titleText = `✨ เกลาสำนวน ตอนที่ ${batchIndex}/${batchTotal}: ${chapterDisplayName} (${currentBatch}/${totalBatches})`;
              if ((global as any).activeTranslationJob) {
                (global as any).activeTranslationJob.percent = pct;
              }
            } else {
              jobT = 'single_chapter';
              currentCh = currentBatch;
              totalCh = totalBatches;
              pct = Math.min(95, Math.round((currentBatch / totalBatches) * 100));
              titleText = `✨ เกลาสำนวน: ${chapterDisplayName}`;
            }

            io.emit('translation:progress', {
              status: 'batch_progress',
              jobType: jobT,
              initiatorUserId: session.id,
              novelId: chapter.novelId,
              chapterId: chapter.id,
              novelTitle: novelName,
              chapterTitle: titleText,
              currentChapter: currentCh,
              totalChapters: totalCh,
              chapterCount: isBatch ? Math.max(0, batchIndex - 1) : currentBatch,
              percent: pct,
              isPaused: false,
              updatedAt: new Date().toISOString(),
            });
          }
        },
      });

      // Step 3: All-or-Nothing & Last-Known-Good Invariant:
      // If ANY batch failed, do NOT commit partial work or destroy existing polished content
      if (polishResult.failedBatches > 0) {
        if (!isBatch && io) {
          io.emit('translation:progress', {
            status: 'batch_cancelled',
            jobType: 'single_chapter',
            initiatorUserId: session.id,
            novelTitle: novelName,
            chapterTitle: chapterDisplayName,
            message: `เกลาสำนวนไม่สมบูรณ์ (${polishResult.failedBatches} ชุดล้มเหลว) รักษาฉบับเดิมไว้`,
          });
        }
        return NextResponse.json(
          {
            success: false,
            error: `ระบบเกลาสำนวนไม่สำเร็จครบทุกย่อหน้า (${polishResult.failedBatches} ชุดล้มเหลว) เพื่อความปลอดภัยเนื้อหาเดิมยังคงอยู่ครบ`,
          },
          { status: 422 }
        );
      }

      // Step 4: Quality Safety Net (Name Replacer + English Leak Detector)
      const afterNameReplacer = applySafeNameReplacer(polishResult.paragraphsTh, glossarySnapshot);
      const leakCheck = detectEnglishLeak(afterNameReplacer, glossarySnapshot);
      const finalBody = leakCheck.repairedParagraphs || afterNameReplacer;

      translated = [polishResult.titleTh, ...finalBody];
      polishedAt = new Date();

      if (io) {
        if (isBatch) {
          const completedPct = Math.round((batchIndex / batchTotal) * 100);
          if (isLastChapter) {
            (global as any).activeTranslationJob = null;
            io.emit('translation:progress', {
              status: 'batch_completed',
              jobType: 'batch',
              initiatorUserId: session.id,
              novelId: chapter.novelId,
              chapterId: chapter.id,
              novelTitle: novelName,
              chapterTitle: chapterDisplayName,
              totalChapters: batchTotal,
              percent: 100,
              message: `✨ แปลและเกลาสำนวนสำเร็จครบทั้ง ${batchTotal} ตอนแล้ว!`,
            });
          } else {
            if ((global as any).activeTranslationJob) {
              (global as any).activeTranslationJob.currentChapter = batchIndex;
              (global as any).activeTranslationJob.percent = completedPct;
            }
            io.emit('translation:progress', {
              status: 'batch_progress',
              jobType: 'batch',
              initiatorUserId: session.id,
              novelId: chapter.novelId,
              chapterId: chapter.id,
              novelTitle: novelName,
              chapterTitle: `✨ เกลาสำนวนสำเร็จ: ${chapterDisplayName}`,
              currentChapter: batchIndex,
              totalChapters: batchTotal,
              chapterCount: batchIndex,
              percent: completedPct,
              isPaused: false,
              updatedAt: new Date().toISOString(),
            });
          }
        } else {
          io.emit('translation:progress', {
            status: 'batch_completed',
            jobType: 'single_chapter',
            initiatorUserId: session.id,
            novelId: chapter.novelId,
            chapterId: chapter.id,
            novelTitle: novelName,
            chapterTitle: chapterDisplayName,
            percent: 100,
            message: `✨ เกลาสำนวน "${chapterDisplayName}" เรียบร้อยแล้ว!`,
          });
        }
      }
    }

    const [translatedTitle, ...translatedBody] = translated;
    const titleTh = translatedTitle && !translatedTitle.startsWith('[') ? translatedTitle : chapter.titleTh;

    // Save to DB with metadata
    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        titleEn: titleEn || chapter.titleEn,
        titleTh,
        contentTh: JSON.stringify(translatedBody),
        contentThGoogle: engine === 'google' ? JSON.stringify(translatedBody) : chapter.contentThGoogle,
        contentThPolished: engine === 'polish' ? JSON.stringify(translatedBody) : chapter.contentThPolished,
        status: engine === 'polish' ? 'POLISHED' : 'TRANSLATED_GT',
        polishedAt,
        ...(engine === 'polish'
          ? {
              llmProvider: providerName,
              llmModel: modelName,
              promptVersion: 'polish-v5.2',
              glossaryVersion: glossaryCount,
            }
          : {}),
      },
    });

    if (io) {
      // Broadcast content-state change (not user-scoped): any viewer of this novel updates.
      io.emit('chapter:updated', {
        chapterId: chapter.id,
        novelId: chapter.novelId,
        titleTh,
        status: engine === 'polish' ? 'POLISHED' : 'TRANSLATED_GT',
      });

      if (isBatch && engine === 'google') {
        const completedPct = Math.round((batchIndex / batchTotal) * 100);
        if (isLastChapter) {
          (global as any).activeTranslationJob = null;
          io.emit('translation:progress', {
            status: 'batch_completed',
            jobType: 'batch',
            initiatorUserId: session.id,
            novelId: chapter.novelId,
            chapterId: chapter.id,
            novelTitle: novelName,
            chapterTitle: chapterDisplayName,
            totalChapters: batchTotal,
            percent: 100,
            message: `แปลภาษาสำเร็จครบทั้ง ${batchTotal} ตอนแล้ว!`,
          });
        } else {
          if ((global as any).activeTranslationJob) {
            (global as any).activeTranslationJob.currentChapter = batchIndex;
            (global as any).activeTranslationJob.percent = completedPct;
          }
          io.emit('translation:progress', {
            status: 'batch_progress',
            jobType: 'batch',
            initiatorUserId: session.id,
            novelId: chapter.novelId,
            chapterId: chapter.id,
            novelTitle: novelName,
            chapterTitle: `แปลด่วน (Google) สำเร็จ: ${chapterDisplayName}`,
            currentChapter: batchIndex,
            totalChapters: batchTotal,
            chapterCount: batchIndex,
            percent: completedPct,
            isPaused: false,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    await recordAuditLog({
      userId: session.id,
      action: 'CHAPTER_RETRANSLATE',
      entity: 'CHAPTER',
      entityId: chapter.id,
      details: `แปลใหม่บท "${titleTh}" (${engine === 'polish' ? `AI เกลาสำนวน (${modelName})` : 'Google แปลตรง'})`,
      request,
    });

    return NextResponse.json({ success: true, engine, titleTh, contentTh: translatedBody });
  } catch (err: any) {
    console.error('Retranslate error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการแปลใหม่' },
      { status: 500 }
    );
  } finally {
    // Release Priority Lease and clear Heartbeat timer
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    if (leaseAcquired) {
      await releasePriorityLease('MANUAL_POLISH_LOCK', ownerId);
    }
  }
}
