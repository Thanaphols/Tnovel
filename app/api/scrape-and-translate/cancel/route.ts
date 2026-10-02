import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { cancelImport } from '@/lib/importRuns';

// Cancels an "add novel" import started from the drawer and rolls back what it created.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }
  const { importId } = await request.json().catch(() => ({}));
  if (typeof importId !== 'string' || !importId) {
    return NextResponse.json({ success: false, error: 'ระบุ importId' }, { status: 400 });
  }
  const found = await cancelImport(importId, session.id);
  return NextResponse.json({ success: true, found });
}
