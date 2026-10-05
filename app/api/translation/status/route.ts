import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { jobsOf } from '@/lib/batchJobs';

// Only the caller's own job: other admins' batches and everything for regular users stay hidden.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: true, active: false, job: null });
  }

  const batch = jobsOf(session.id)[0];
  const single = (global as any).activeTranslationJob;
  // Client-driven jobs (retranslate/apply) never clear the flag if the tab closes mid-way;
  // treat one with no progress for 2 minutes as gone instead of replaying it forever.
  const singleFresh = single?.updatedAt && Date.now() - Date.parse(single.updatedAt) < 120_000;
  const job = batch
    ? { ...batch.payload, isPaused: batch.isPaused }
    : single?.isActive && singleFresh && single.initiatorUserId === session.id
      ? single
      : null;

  return NextResponse.json({ success: true, active: Boolean(job), job });
}
