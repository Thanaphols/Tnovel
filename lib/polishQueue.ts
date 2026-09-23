import { prisma } from './prisma';
import { JobType, JobStatus, ChapterStatus, ErrorCode } from './enums';
import { claimChapterJob, renewJobLease, completeChapterJob, failChapterJob } from './jobQueue';
import { getRelevantGlossary, toPromptGlossary } from './glossaryService';
import { getLLMProvider } from './llm/provider';
import { applySafeNameReplacer } from './nameReplacer';
import { detectEnglishLeak } from './translation/detectEnglishLeak';
import { isPriorityLeaseActive } from './systemLock';
import { maxConcurrency } from './aiConcurrency';
import { getAISettings } from './aiSettings';

// Background dispatch cap. The true per-provider bound lives in the shared governor
// (aiConcurrency, applied inside polishParagraphs); this just avoids dispatching far more
// background chapters than can run, which would hold job leases while waiting on a slot.
let activeWorkers = 0;
const pendingQueue: string[] = [];

/**
 * Enqueue a chapter for background AI polish.
 */
export function enqueueChapterForPolish(chapterId: string): void {
  if (!pendingQueue.includes(chapterId)) {
    pendingQueue.push(chapterId);
  }
  processNextInQueue();
}

async function processNextInQueue(): Promise<void> {
  if (pendingQueue.length === 0) return;

  const { provider } = await getAISettings();
  // ponytail: benign — a concurrent call could over-dispatch by ~1 across the await; the governor
  // still hard-bounds real concurrency, so at worst one extra chapter waits on a slot.
  if (activeWorkers >= maxConcurrency(provider)) return;

  // Priority check: Yield if a manual priority lease lock is currently active
  const isManualActive = await isPriorityLeaseActive('MANUAL_POLISH_LOCK');
  if (isManualActive) {
    // Retry in 3 seconds to yield resources to user-initiated tasks
    setTimeout(processNextInQueue, 3000);
    return;
  }

  const chapterId = pendingQueue.shift();
  if (!chapterId) return;

  activeWorkers++;
  try {
    await executeChapterPolish(chapterId);
  } catch (err) {
    console.error(`[PolishQueue] Error polishing chapter ${chapterId}:`, err);
  } finally {
    activeWorkers--;
    // Schedule next
    setImmediate(processNextInQueue);
  }
}

async function executeChapterPolish(chapterId: string): Promise<void> {
  const claim = await claimChapterJob(chapterId, JobType.POLISH, 90000);
  if (!claim.acquired || !claim.jobId) {
    console.log(`[PolishQueue] Chapter ${chapterId} already claimed or processing.`);
    return;
  }

  const jobId = claim.jobId;

  // Start Worker Lease Heartbeat every 20 seconds
  const heartbeatInterval = setInterval(async () => {
    await renewJobLease(jobId, 90000);
  }, 20000);

  const startTime = Date.now();

  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { novel: true },
    });

    if (!chapter || !chapter.contentEn) {
      clearInterval(heartbeatInterval);
      await failChapterJob(jobId, ErrorCode.NONE, 'Chapter or contentEn not found');
      return;
    }

    let paragraphsEn: string[] = [];
    try {
      paragraphsEn = JSON.parse(chapter.contentEn);
    } catch {
      paragraphsEn = chapter.contentEn.split('\n').filter((p) => p.trim());
    }

    const draftThJson = chapter.contentThGoogle || chapter.contentTh || '[]';
    let paragraphsTh: string[] = [];
    try {
      paragraphsTh = JSON.parse(draftThJson);
    } catch {
      paragraphsTh = [draftThJson];
    }

    // Step 1: Filter relevant glossary and freeze snapshot for the whole chapter
    const relevantGlossary = await getRelevantGlossary(chapter.novelId, paragraphsEn, 30);
    const glossarySnapshot = relevantGlossary.map((g) => ({
      canonicalEn: g.canonicalEn,
      canonicalTh: g.canonicalTh,
      entityType: g.entityType,
      isLocked: g.isLocked,
    }));

    const polishContext = {
      novelTitle: chapter.novel?.titleTh || chapter.novel?.titleEn,
      genre: chapter.novel?.genre || chapter.novel?.category || undefined,
      glossary: toPromptGlossary(relevantGlossary),
    };

    // Step 2: Run AI polish via Model-Agnostic ILLMProvider (background = global provider setting)
    const provider = await getLLMProvider();
    const polishResult = await provider.polish({
      chapterNumber: chapter.chapterNumber,
      titleEn: chapter.titleEn || 'Chapter',
      titleThDraft: chapter.titleTh || chapter.titleEn || 'Chapter',
      paragraphsEn,
      paragraphsThDraft: paragraphsTh,
      context: polishContext,
    });

    // Step 3: All-or-Nothing & Last-Known-Good Invariant:
    // If any batch failed, do NOT commit partial work or overwrite last-known-good polished content!
    if (polishResult.failedBatches > 0) {
      console.warn(
        `[PolishQueue] Chapter ${chapter.chapterNumber} polish had ${polishResult.failedBatches} failed batches. Preserving last-known-good.`
      );
      clearInterval(heartbeatInterval);
      await failChapterJob(
        jobId,
        ErrorCode.LLM_TIMEOUT,
        `${polishResult.failedBatches} batches failed during polish`
      );

      // Preserve existing contentThPolished if it exists
      await prisma.chapter.update({
        where: { id: chapterId },
        data: {
          status: ChapterStatus.POLISH_FAILED,
          errorCode: ErrorCode.LLM_TIMEOUT,
          errorMessage: 'การเกลาภาษาขัดข้องบางย่อหน้า แต่คุณยังสามารถอ่านฉบับแปลด่วนได้',
        },
      });
      return;
    }

    // Step 4: Quality Safety Net: Name Replacer + Scope-based English Leak Detector
    const afterNameReplacer = applySafeNameReplacer(polishResult.paragraphsTh, glossarySnapshot);
    const leakCheck = detectEnglishLeak(afterNameReplacer, glossarySnapshot);
    const finalBody = leakCheck.repairedParagraphs || afterNameReplacer;

    const polishDurationMs = Date.now() - startTime;

    // Step 5: Persist polished content to DB with Model Metadata
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        titleTh: polishResult.titleTh,
        contentThPolished: JSON.stringify(finalBody),
        contentTh: JSON.stringify(finalBody),
        status: ChapterStatus.POLISHED,
        polishedAt: new Date(),
        polishDurationMs,
        errorCode: ErrorCode.NONE,
        errorMessage: null,
        llmProvider: provider.name,
        llmModel: provider.modelName,
        promptVersion: 'polish-v5.2',
        glossaryVersion: glossarySnapshot.length,
      },
    });

    clearInterval(heartbeatInterval);
    await completeChapterJob(jobId);

    // Step 6: Realtime Socket.IO notification
    const globalIo = (global as any).io;
    if (globalIo) {
      globalIo.emit('chapter:polished', {
        chapterId,
        novelId: chapter.novelId,
        chapterNumber: chapter.chapterNumber,
        titleTh: polishResult.titleTh,
      });
      globalIo.emit('translation:progress', {
        status: 'completed',
        chapterId,
        novelId: chapter.novelId,
        message: `เกลาสำนวนบทที่ ${chapter.chapterNumber} สำเร็จแล้ว!`,
      });
    }

    console.log(
      `[PolishQueue] Chapter ${chapter.chapterNumber} (${chapterId}) polished using ${provider.modelName} in ${polishDurationMs}ms.`
    );
  } catch (err: any) {
    clearInterval(heartbeatInterval);
    const errorMsg = err.message || 'AI Polish failed';
    console.error(`[PolishQueue] Failed to polish chapter ${chapterId}:`, err);

    await failChapterJob(jobId, ErrorCode.LLM_TIMEOUT, errorMsg);

    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        status: ChapterStatus.POLISH_FAILED,
        errorCode: ErrorCode.LLM_TIMEOUT,
        errorMessage: 'การเกลาภาษาขัดข้อง แต่คุณยังสามารถอ่านฉบับแปลด่วนได้',
      },
    });
  }
}
