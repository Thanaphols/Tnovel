// Runs once when the Next.js server starts (see node_modules/next/dist/docs/.../instrumentation.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNovelUpdateSchedule } = await import('./lib/novelUpdater');
    startNovelUpdateSchedule();
  }
}
