import { prisma } from './prisma';
import { JobType, JobStatus, ErrorCode } from './enums';
import os from 'os';

const WORKER_ID = `${os.hostname()}-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ClaimResult {
  acquired: boolean;
  jobId?: string;
  workerId: string;
}

/**
 * Attempt to claim a job atomically in the database (Distributed Lock Layer 2).
 */
export async function claimChapterJob(
  chapterId: string,
  jobType: JobType,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<ClaimResult> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);

  return await prisma.$transaction(async (tx) => {
    let job = await tx.chapterJob.findUnique({
      where: { chapterId_jobType: { chapterId, jobType } },
    });

    if (!job) {
      // Create and acquire directly
      job = await tx.chapterJob.create({
        data: {
          chapterId,
          jobType,
          status: JobStatus.PROCESSING,
          workerId: WORKER_ID,
          attempts: 1,
          lockedAt: now,
          lockedUntil,
          errorCode: ErrorCode.NONE,
        },
      });
      return { acquired: true, jobId: job.id, workerId: WORKER_ID };
    }

    // If job is already COMPLETED
    if (job.status === JobStatus.COMPLETED) {
      return { acquired: false, jobId: job.id, workerId: job.workerId || '' };
    }

    // If job is PROCESSING and lease is still valid -> someone else owns it
    if (job.status === JobStatus.PROCESSING && job.lockedUntil && job.lockedUntil > now) {
      return { acquired: false, jobId: job.id, workerId: job.workerId || '' };
    }

    // If job is PENDING, FAILED, or lease expired -> Claim it!
    const updated = await tx.chapterJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.PROCESSING,
        workerId: WORKER_ID,
        attempts: { increment: 1 },
        lockedAt: now,
        lockedUntil,
        errorCode: ErrorCode.NONE,
        errorDetail: null,
      },
    });

    return { acquired: true, jobId: updated.id, workerId: WORKER_ID };
  });
}

/**
 * Renew lease for an active worker (Heartbeat).
 */
export async function renewJobLease(jobId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
  try {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);
    const res = await prisma.chapterJob.updateMany({
      where: {
        id: jobId,
        workerId: WORKER_ID,
        status: JobStatus.PROCESSING,
      },
      data: {
        lockedUntil,
      },
    });
    return res.count > 0;
  } catch (err) {
    console.error(`[JobQueue] Failed to renew lease for job ${jobId}:`, err);
    return false;
  }
}

/**
 * Mark job as completed.
 */
export async function completeChapterJob(jobId: string): Promise<void> {
  await prisma.chapterJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      lockedUntil: null,
      errorCode: ErrorCode.NONE,
      errorDetail: null,
    },
  });
}

/**
 * Mark job as failed, with automatic retry backoff if attempts < maxAttempts.
 */
export async function failChapterJob(
  jobId: string,
  errorCode: ErrorCode,
  errorDetail?: string
): Promise<void> {
  const job = await prisma.chapterJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const willRetry = job.attempts < job.maxAttempts;
  const status = willRetry ? JobStatus.PENDING : JobStatus.FAILED;

  await prisma.chapterJob.update({
    where: { id: jobId },
    data: {
      status,
      lockedUntil: null,
      errorCode,
      errorDetail: errorDetail || null,
    },
  });
}

/**
 * Reset a completed or failed job so it can run again (e.g. Re-polish).
 */
export async function resetJobForRerun(chapterId: string, jobType: JobType): Promise<void> {
  await prisma.chapterJob.upsert({
    where: { chapterId_jobType: { chapterId, jobType } },
    create: {
      chapterId,
      jobType,
      status: JobStatus.PENDING,
      attempts: 0,
      executionCount: 1,
    },
    update: {
      status: JobStatus.PENDING,
      attempts: 0,
      executionCount: { increment: 1 },
      lockedAt: null,
      lockedUntil: null,
      errorCode: ErrorCode.NONE,
      errorDetail: null,
    },
  });
}

/**
 * Wait for a job to be finished by another process (Request Waiter pattern).
 */
export async function waitForJobCompletion(
  chapterId: string,
  jobType: JobType,
  maxWaitMs: number = 12000,
  pollIntervalMs: number = 400
): Promise<{ success: boolean; status: string; errorCode?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await delay(pollIntervalMs);

    const job = await prisma.chapterJob.findUnique({
      where: { chapterId_jobType: { chapterId, jobType } },
      select: { status: true, errorCode: true },
    });

    if (!job) {
      return { success: false, status: 'NOT_FOUND' };
    }

    if (job.status === JobStatus.COMPLETED) {
      return { success: true, status: JobStatus.COMPLETED };
    }

    if (job.status === JobStatus.FAILED) {
      return { success: false, status: JobStatus.FAILED, errorCode: job.errorCode };
    }
  }

  return { success: false, status: 'TIMEOUT' };
}
