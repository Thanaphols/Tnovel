import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { jobsOf } from '@/lib/batchJobs';

// Cancels the caller's own batches (running or still queued). The batch loop emits
// batch_cancelled itself once it notices the flag.
export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    for (const job of jobsOf(session.id)) {
      job.isCancelled = true;
      job.isPaused = false;
    }

    const g = global as any;
    if (g.activeTranslationJob?.initiatorUserId === session.id) g.activeTranslationJob = null;

    g.io?.emit('translation:state', { initiatorUserId: session.id, isPaused: false, isCancelled: true });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
