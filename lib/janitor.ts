import { prisma } from './prisma';
import { JobStatus, JobType, ChapterStatus, ErrorCode } from './enums';

/**
 * Scan for orphaned/stuck jobs where lease has expired (e.g. Worker crashed / OOM)
 * and reclaim them safely.
 */
export async function runJanitorCleanup(): Promise<{ reclaimed: number; failed: number }> {
  const now = new Date();

  try {
    const expiredJobs = await prisma.chapterJob.findMany({
      where: {
        status: JobStatus.PROCESSING,
        lockedUntil: { lt: now },
      },
      include: {
        chapter: true,
      },
    });

    if (expiredJobs.length === 0) {
      await requeuePendingPolish();
      return { reclaimed: 0, failed: 0 };
    }

    console.log(`[Janitor] Found ${expiredJobs.length} expired processing jobs. Reclaiming...`);
    let reclaimed = 0;
    let failed = 0;

    for (const job of expiredJobs) {
      const willRetry = job.attempts < job.maxAttempts;

      if (willRetry) {
        await prisma.chapterJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.PENDING,
            lockedUntil: null,
            workerId: null,
          },
        });
        reclaimed++;
      } else {
        await prisma.chapterJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.FAILED,
            lockedUntil: null,
            errorCode: ErrorCode.WORKER_CRASHED_OR_TIMED_OUT,
            errorDetail: 'Worker crashed or lease timed out after maximum attempts',
          },
        });

        // Also update chapter status so user sees clear error
        if (job.chapter) {
          const targetStatus =
            job.jobType === 'FETCH_AND_TRANSLATE'
              ? ChapterStatus.FETCH_FAILED
              : ChapterStatus.POLISH_FAILED;

          await prisma.chapter.update({
            where: { id: job.chapter.id },
            data: {
              status: targetStatus,
              errorCode: ErrorCode.WORKER_CRASHED_OR_TIMED_OUT,
              errorMessage: 'การประมวลผลหยุดชะงักเนื่องจากระบบขัดข้อง กรุณาลองใหม่อีกครั้ง',
            },
          });
        }
        failed++;
      }
    }

    console.log(`[Janitor] Cleanup completed: Reclaimed ${reclaimed}, Marked failed ${failed}`);
    await requeuePendingPolish();
    return { reclaimed, failed };
  } catch (err: any) {
    console.error('[Janitor] Error during cleanup run:', err);
    return { reclaimed: 0, failed: 0 };
  }
}

/**
 * Reclaimed (or failed-for-retry) POLISH jobs sit in PENDING, but the polish queue only lives in
 * memory, so nothing would ever pick them up again. Feed them back in.
 */
async function requeuePendingPolish() {
  const pending = await prisma.chapterJob.findMany({
    where: { jobType: JobType.POLISH, status: JobStatus.PENDING },
    select: { chapterId: true },
  });
  if (pending.length === 0) return;
  const { enqueueChapterForPolish } = await import('./polishQueue');
  for (const job of pending) enqueueChapterForPolish(job.chapterId);
  console.log(`[Janitor] Re-queued ${pending.length} pending polish job(s)`);
}

/**
 * Boot-time recovery. Whole-novel batches and imports live in process memory, so after a restart
 * none of them is running: a novel still marked TRANSLATING would show "translating" forever.
 * Mark it PAUSED instead, which the history page already offers to resume.
 */
async function recoverAfterRestart() {
  const { count } = await prisma.novel.updateMany({
    where: { translationStatus: 'TRANSLATING' },
    data: { translationStatus: 'PAUSED' },
  });
  if (count > 0) console.log(`[Janitor] ${count} novel(s) were mid-translation at restart, marked PAUSED`);
  // Every PROCESSING job belonged to the previous process; expire its lease now instead of waiting.
  await prisma.chapterJob.updateMany({
    where: { status: JobStatus.PROCESSING },
    data: { lockedUntil: new Date(0) },
  });
}

const g = global as any;

export function startJanitorSchedule(intervalMs: number = 3 * 60 * 1000): void {
  if (g.__janitorInterval) return;

  // Recover from the previous process first, then the regular scan picks up its jobs.
  recoverAfterRestart()
    .catch((err) => console.error('[Janitor] Boot recovery failed:', err))
    .finally(() => runJanitorCleanup().catch(() => {}));

  // Run periodic scan
  g.__janitorInterval = setInterval(() => {
    runJanitorCleanup().catch(() => {});
  }, intervalMs);
  g.__janitorInterval.unref?.();
}
