// Runs once when the Next.js server starts (see node_modules/next/dist/docs/.../instrumentation.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // SQLite WAL: readers no longer block the writer (batches, polish heartbeats, view counters all
    // write concurrently), which removes most "database is locked" errors. Persists in the DB file.
    const { prisma } = await import('./lib/prisma');
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;').catch((err) => console.error('[db] WAL setup failed:', err));

    const { startNovelUpdateSchedule } = await import('./lib/novelUpdater');
    startNovelUpdateSchedule();
    // Recovers jobs/novels left mid-flight by the previous process, then sweeps expired leases.
    const { startJanitorSchedule } = await import('./lib/janitor');
    startJanitorSchedule();
  }
}
