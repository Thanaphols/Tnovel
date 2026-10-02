import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { checkAllNovelUpdates, getNovelUpdateSettings, setNovelUpdateInterval } from '@/lib/novelUpdater';

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === 'ADMIN' ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }
  return NextResponse.json({ success: true, settings: await getNovelUpdateSettings() });
}

// Body: { intervalHours: number } to set the auto-check interval (0 = off),
// or { runNow: true } to start a sweep of every novel in the background.
export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  if (body?.runNow === true) {
    const { running } = await getNovelUpdateSettings();
    if (running) return NextResponse.json({ success: false, error: 'กำลังเช็คอยู่แล้ว' }, { status: 409 });
    checkAllNovelUpdates().catch((e) => console.error('[NovelUpdate] manual sweep failed:', e?.message || e));
    return NextResponse.json({ success: true, settings: { ...(await getNovelUpdateSettings()), running: true } });
  }

  const hours = Number(body?.intervalHours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 7) {
    return NextResponse.json({ success: false, error: 'intervalHours ต้องอยู่ระหว่าง 0–168' }, { status: 400 });
  }
  await setNovelUpdateInterval(hours);
  await recordAuditLog({
    action: 'NOVEL_UPDATE_INTERVAL',
    entity: 'AppSetting',
    entityId: 'novelUpdate.intervalHours',
    details: hours > 0 ? `เช็คตอนใหม่อัตโนมัติทุก ${hours} ชม.` : 'ปิดเช็คตอนใหม่อัตโนมัติ',
    userId: session.id,
  });
  return NextResponse.json({ success: true, settings: await getNovelUpdateSettings() });
}
