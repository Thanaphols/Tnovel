import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { jobsOf } from '@/lib/batchJobs';

// Body: { paused: boolean }. Pauses/resumes the caller's own batches only.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  const { paused } = await request.json().catch(() => ({}));
  const isPaused = paused === true;
  for (const job of jobsOf(session.id)) job.isPaused = isPaused;

  (global as any).io?.emit('translation:state', { initiatorUserId: session.id, isPaused, isCancelled: false });

  return NextResponse.json({ success: true, isPaused });
}
