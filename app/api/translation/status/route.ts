import { NextResponse } from 'next/server';

export async function GET() {
  const job = (global as any).activeTranslationJob || null;
  const state = (global as any).translationState || { isPaused: false, isCancelled: false };

  return NextResponse.json({
    success: true,
    active: Boolean(job && job.isActive),
    job: job ? { ...job, isPaused: state.isPaused } : null,
  });
}
