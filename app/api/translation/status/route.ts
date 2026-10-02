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
  const job = batch
    ? { ...batch.payload, isPaused: batch.isPaused }
    : single?.isActive && single.initiatorUserId === session.id
      ? single
      : null;

  return NextResponse.json({ success: true, active: Boolean(job), job });
}
