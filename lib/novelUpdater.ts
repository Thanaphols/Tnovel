// Novel update checker: re-reads a novel's source table of contents and adds chapters the
// source published since we imported it. New chapters land as TOC_ONLY placeholders; the
// reader's JIT fetch translates one when somebody opens it, so nothing is spent on chapters
// nobody reads.
//
// ponytail: in-process timer, single custom server (server.js). Under a PM2 cluster every
// worker would run it; gate on a SystemLock lease if that ever happens.
import { prisma } from './prisma';
import { scrapeNovelIndex } from './scraper';
import { ChapterStatus } from './enums';

const KEY_INTERVAL = 'novelUpdate.intervalHours';
const KEY_LAST_RUN = 'novelUpdate.lastRunAt';
const KEY_LAST_RESULT = 'novelUpdate.lastResult';

const TICK_MS = 10 * 60 * 1000; // how often the timer looks at the admin-set interval
const BETWEEN_NOVELS_MS = 3000; // be polite to source sites during a full sweep

export interface NovelUpdateResult {
  novelId: string;
  title: string;
  added: number;
  total: number;
  error?: string;
}

/** Novels we can re-scrape: imported from a real URL (not pasted), not in the bin. */
const scrapeableWhere = { deletedAt: null, sourceUrl: { startsWith: 'http' } };

export async function checkNovelUpdates(novelId: string): Promise<NovelUpdateResult> {
  const novel = await prisma.novel.findFirst({ where: { id: novelId, ...scrapeableWhere } });
  if (!novel) throw new Error('นิยายเรื่องนี้ไม่ได้ดึงมาจาก URL จึงเช็คตอนใหม่ไม่ได้');
  const title = novel.titleTh || novel.titleEn;

  const index = await scrapeNovelIndex(novel.sourceUrl);
  if (!index.chapters.length) {
    return { novelId, title, added: 0, total: novel.totalChapters, error: 'ดึงสารบัญจากเว็บต้นทางไม่ได้' };
  }

  // Include binned chapters: a chapter an admin deleted must not come back on the next check,
  // and their numbers still hold the (novelId, chapterNumber) unique slot.
  const existing = await prisma.chapter.findMany({
    where: { novelId },
    select: { chapterNumber: true, originalUrl: true },
  });
  const knownUrls = new Set(existing.map((c) => c.originalUrl));
  const knownNumbers = new Set(existing.map((c) => c.chapterNumber));

  const fresh = index.chapters
    .map((c, idx) => ({ ...c, chapterNumber: c.chapterNumber || idx + 1 }))
    // add() also dedupes numbers repeated within the scraped index itself
    .filter((c) => !knownUrls.has(c.url) && !knownNumbers.has(c.chapterNumber) && knownNumbers.add(c.chapterNumber));

  if (fresh.length > 0) {
    await prisma.chapter.createMany({
      data: fresh.map((c) => ({
        novelId,
        chapterNumber: c.chapterNumber,
        titleEn: c.title || `Chapter ${c.chapterNumber}`,
        titleTh: c.title || `Chapter ${c.chapterNumber}`,
        originalUrl: c.url,
        status: ChapterStatus.TOC_ONLY,
      })),
    });
  }

  const total = Math.max(index.chapters.length, existing.length + fresh.length);
  // Only write when something changed, so updatedAt (the "latest" sort) moves just for novels
  // that actually got chapters.
  if (fresh.length > 0 || total !== novel.totalChapters) {
    await prisma.novel.update({ where: { id: novelId }, data: { totalChapters: total } });
  }

  const io = (global as any).io;
  if (io && fresh.length > 0) {
    io.emit('novel:indexed', { novelId, totalChapters: total });
    const created = await prisma.chapter.findMany({
      where: { novelId, originalUrl: { in: fresh.map((c) => c.url) } },
      select: { id: true, chapterNumber: true, titleTh: true },
    });
    for (const c of created) {
      io.emit('chapter:created', {
        chapterId: c.id,
        novelId,
        chapterNumber: c.chapterNumber,
        chapterTitle: c.titleTh,
        titleTh: novel.titleTh,
        status: ChapterStatus.TOC_ONLY,
      });
    }
  }

  return { novelId, title, added: fresh.length, total };
}

// ---- Full sweep + schedule ------------------------------------------------

const g = global as any;

async function getSetting(key: string): Promise<string | null> {
  return (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null;
}
async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getNovelUpdateSettings() {
  const [interval, lastRunAt, lastResult] = await Promise.all([
    getSetting(KEY_INTERVAL),
    getSetting(KEY_LAST_RUN),
    getSetting(KEY_LAST_RESULT),
  ]);
  return {
    intervalHours: Number(interval) || 0, // 0 = auto-check off
    lastRunAt,
    lastResult: lastResult ? (JSON.parse(lastResult) as { checked: number; added: number; failed: number }) : null,
    running: Boolean(g.__novelUpdateRunning),
    scheduled: Boolean(g.__novelUpdateTimer), // false = instrumentation.ts never started the timer
  };
}

export async function setNovelUpdateInterval(hours: number) {
  await setSetting(KEY_INTERVAL, String(Math.max(0, Math.floor(hours))));
}

/** Check every scrapeable novel, one at a time. No-op if a sweep is already running. */
export async function checkAllNovelUpdates(): Promise<NovelUpdateResult[] | null> {
  if (g.__novelUpdateRunning) return null;
  g.__novelUpdateRunning = true;
  const results: NovelUpdateResult[] = [];
  try {
    const novels = await prisma.novel.findMany({ where: scrapeableWhere, select: { id: true, titleTh: true, titleEn: true } });
    for (const n of novels) {
      try {
        results.push(await checkNovelUpdates(n.id));
      } catch (err: any) {
        results.push({ novelId: n.id, title: n.titleTh || n.titleEn, added: 0, total: 0, error: err.message || String(err) });
      }
      await new Promise((r) => setTimeout(r, BETWEEN_NOVELS_MS));
    }
    const summary = {
      checked: results.length,
      added: results.reduce((s, r) => s + r.added, 0),
      failed: results.filter((r) => r.error).length,
    };
    await setSetting(KEY_LAST_RUN, new Date().toISOString());
    await setSetting(KEY_LAST_RESULT, JSON.stringify(summary));
    console.log(`[NovelUpdate] checked ${summary.checked}, +${summary.added} chapters, ${summary.failed} failed`);
    return results;
  } finally {
    g.__novelUpdateRunning = false;
  }
}

/** True when the admin turned auto-check on and the interval has elapsed since the last sweep. */
export function isSweepDue(intervalHours: number, lastRunAt: string | null, now = Date.now()): boolean {
  if (intervalHours <= 0) return false;
  if (!lastRunAt) return true;
  return now - new Date(lastRunAt).getTime() >= intervalHours * 3600 * 1000;
}

export function startNovelUpdateSchedule() {
  if (g.__novelUpdateTimer) return; // dev HMR / repeated register()
  g.__novelUpdateTimer = setInterval(async () => {
    try {
      const { intervalHours, lastRunAt } = await getNovelUpdateSettings();
      if (isSweepDue(intervalHours, lastRunAt)) await checkAllNovelUpdates();
    } catch (err: any) {
      console.error('[NovelUpdate] scheduled sweep failed:', err.message || err);
    }
  }, TICK_MS);
  console.log('[NovelUpdate] schedule started');
}
