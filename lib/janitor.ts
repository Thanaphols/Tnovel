import { prisma } from './prisma';
import { JobStatus, ChapterStatus, ErrorCode } from './enums';

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
    return { reclaimed, failed };
  } catch (err: any) {
    console.error('[Janitor] Error during cleanup run:', err);
    return { reclaimed: 0, failed: 0 };
  }
}

let janitorInterval: NodeJS.Timeout | null = null;

export function startJanitorSchedule(intervalMs: number = 3 * 60 * 1000): void {
  if (janitorInterval) return;

  // Run initial scan immediately on startup
  runJanitorCleanup().catch(() => {});

  // Run periodic scan
  janitorInterval = setInterval(() => {
    runJanitorCleanup().catch(() => {});
  }, intervalMs);
}
