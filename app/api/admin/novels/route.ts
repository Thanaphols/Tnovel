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

    const novels = await prisma.novel.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { chapters: true, reports: true } },
      },
    });

    return NextResponse.json({ success: true, novels });
  } catch (err: any) {
    console.error('Fetch admin novels error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดรายการนิยาย' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { action, novelId } = await request.json();

    if (!novelId) {
      return NextResponse.json({ success: false, error: 'ระบุ novelId' }, { status: 400 });
    }

    const targetNovel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { titleTh: true, titleEn: true },
    });
    const novelTitle = targetNovel?.titleTh || targetNovel?.titleEn || novelId;

    if (action === 'delete_soft') {
      await prisma.novel.update({
        where: { id: novelId },
        data: { deletedAt: new Date() },
      });
      await prisma.chapter.updateMany({
        where: { novelId },
        data: { deletedAt: new Date() },
      });

      await recordAuditLog({
        userId: session.id,
        action: 'NOVEL_DELETE_SOFT',
        entity: 'NOVEL',
        entityId: novelId,
        details: `ย้ายนิยาย "${novelTitle}" ไปถังขยะ`,
        request,
      });

      return NextResponse.json({ success: true, message: 'ย้ายนิยายไปถังขยะเรียบร้อย' });
    } else if (action === 'restore') {
      await prisma.novel.update({
        where: { id: novelId },
        data: { deletedAt: null },
      });
      await prisma.chapter.updateMany({
        where: { novelId },
        data: { deletedAt: null },
      });

      await recordAuditLog({
        userId: session.id,
        action: 'NOVEL_RESTORE',
        entity: 'NOVEL',
        entityId: novelId,
        details: `กู้คืนนิยาย "${novelTitle}"`,
        request,
      });

      return NextResponse.json({ success: true, message: 'กู้คืนนิยายเรียบร้อย' });
    } else if (action === 'delete_permanent') {
      await prisma.novel.delete({ where: { id: novelId } });

      await recordAuditLog({
        userId: session.id,
        action: 'NOVEL_DELETE_PERMANENT',
        entity: 'NOVEL',
        entityId: novelId,
        details: `ลบนิยาย "${novelTitle}" ถาวร`,
        request,
      });

      return NextResponse.json({ success: true, message: 'ลบนิยายถาวรเรียบร้อย' });
    }

    return NextResponse.json({ success: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
  } catch (err: any) {
    console.error('Admin novel action error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
