import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkNovelUpdates } from '@/lib/novelUpdater';

// Admin "check for new chapters" button on the novel page.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await checkNovelUpdates(id);
    if (result.error) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    return NextResponse.json({
      success: true,
      ...result,
      message: result.added > 0 ? `พบตอนใหม่ ${result.added} ตอน` : 'ยังไม่มีตอนใหม่',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'เช็คตอนใหม่ไม่สำเร็จ' }, { status: 500 });
  }
}
