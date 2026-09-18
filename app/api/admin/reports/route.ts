import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const reports = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        novel: { select: { id: true, titleTh: true, titleEn: true, coverUrl: true, sourceUrl: true } },
        chapter: { select: { id: true, chapterNumber: true, titleTh: true, titleEn: true, originalUrl: true } },
      },
    });

    return NextResponse.json({ success: true, reports });
  } catch (err: any) {
    console.error('Fetch reports error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดรายงาน' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { reportId, status, action } = await request.json();

    if (!reportId) {
      return NextResponse.json({ success: false, error: 'ระบุ reportId' }, { status: 400 });
    }

    if (action === 'delete') {
      await prisma.report.delete({ where: { id: reportId } });

      await recordAuditLog({
        userId: session.id,
        action: 'REPORT_DELETE',
        entity: 'REPORT',
        entityId: reportId,
        details: `ลบรายการแจ้งปัญหา (ID: ${reportId})`,
        request,
      });

      return NextResponse.json({ success: true, message: 'ลบรายงานเรียบร้อยแล้ว' });
    }

    if (status) {
      const updated = await prisma.report.update({
        where: { id: reportId },
        data: { status },
      });

      const actionName = status === 'RESOLVED' ? 'REPORT_RESOLVE' : status === 'DISMISSED' ? 'REPORT_DISMISS' : 'REPORT_STATUS_CHANGE';
      const statusText = status === 'RESOLVED' ? 'แก้ไขเสร็จสิ้น' : status === 'DISMISSED' ? 'ยกเลิก/ปฏิเสธ' : status;

      await recordAuditLog({
        userId: session.id,
        action: actionName,
        entity: 'REPORT',
        entityId: reportId,
        details: `เปลี่ยนสถานะรายงานเป็น "${statusText}" (เหตุผล: ${updated.reason})`,
        request,
      });

      return NextResponse.json({ success: true, report: updated });
    }

    return NextResponse.json({ success: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
  } catch (err: any) {
    console.error('Update report error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการอัปเดตรายงาน' }, { status: 500 });
  }
}
