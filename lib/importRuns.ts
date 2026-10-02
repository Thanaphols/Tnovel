// Cancellable "add novel" imports (URL scrape / paste). The drawer sends an importId; the route
// records everything that import creates, and cancelling rolls exactly that back: a novel this
// import created is deleted outright (chapters cascade), on an existing novel only the chapters it
// added go and its catalog fields are restored. Content that existed before the import is never touched.
//
// ponytail: in-process state, same as batchJobs — correct under the single custom server (server.js).

import { prisma } from './prisma';
import { jobsOf } from './batchJobs';

interface ImportRun {
  userId: string;
  cancelled: boolean;
  done: boolean; // route returned; a late cancel must roll back by itself
  createdNovelId?: string;
  createdAuthorId?: string;
  createdChapterIds: string[];
  /** Existing novel whose catalog fields this import changed, with their values before it. */
  touchedNovel?: { id: string; totalChapters: number; translationStatus: string };
}

export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled');
  }
}

const g = global as any;
const runs: Map<string, ImportRun> = g.__importRuns ?? (g.__importRuns = new Map());

/** Registers an import (no-op without an id, so old clients keep working). */
export function startImport(importId: unknown, userId: string): ImportRun | null {
  if (typeof importId !== 'string' || !importId) return null;
  const run: ImportRun = { userId, cancelled: false, done: false, createdChapterIds: [] };
  runs.set(importId, run);
  // ponytail: finished runs linger 10 min so a late cancel can still roll back, then drop.
  setTimeout(() => runs.delete(importId), 10 * 60_000).unref?.();
  return run;
}

export function throwIfCancelled(run: ImportRun | null) {
  if (run?.cancelled) throw new ImportCancelledError();
}

export async function rollbackImport(run: ImportRun) {
  const io = g.io;
  if (run.createdNovelId) {
    // Stop the background batch first so it doesn't recreate chapters for a deleted novel.
    for (const job of jobsOf(run.userId)) if (job.novelId === run.createdNovelId) job.isCancelled = true;
    await prisma.novel.delete({ where: { id: run.createdNovelId } }).catch(() => {});
    io?.emit('novel:deleted', { id: run.createdNovelId });
  } else {
    if (run.createdChapterIds.length > 0) {
      await prisma.chapter.deleteMany({ where: { id: { in: run.createdChapterIds } } });
    }
    if (run.touchedNovel) {
      const { id, totalChapters, translationStatus } = run.touchedNovel;
      for (const job of jobsOf(run.userId)) if (job.novelId === id) job.isCancelled = true;
      await prisma.novel.update({ where: { id }, data: { totalChapters, translationStatus } }).catch(() => {});
    }
  }
  if (run.createdAuthorId) {
    const inUse = await prisma.novel.count({ where: { authorId: run.createdAuthorId } });
    if (inUse === 0) await prisma.author.delete({ where: { id: run.createdAuthorId } }).catch(() => {});
  }
  run.createdNovelId = undefined;
  run.createdAuthorId = undefined;
  run.createdChapterIds = [];
  run.touchedNovel = undefined;
}

/** Marks the run cancelled. Still running: the route rolls back at its next checkpoint. */
export async function cancelImport(importId: string, userId: string): Promise<boolean> {
  const run = runs.get(importId);
  if (!run || run.userId !== userId) return false;
  run.cancelled = true;
  if (run.done) await rollbackImport(run);
  return true;
}

/** Route finished. If a cancel already landed, roll back now. */
export async function finishImport(run: ImportRun | null) {
  if (!run) return;
  run.done = true;
  if (run.cancelled) await rollbackImport(run);
}
