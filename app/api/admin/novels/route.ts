import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

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

    if (action === 'delete_soft') {
      await prisma.novel.update({
        where: { id: novelId },
        data: { deletedAt: new Date() },
      });
      await prisma.chapter.updateMany({
        where: { novelId },
        data: { deletedAt: new Date() },
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
      return NextResponse.json({ success: true, message: 'กู้คืนนิยายเรียบร้อย' });
    } else if (action === 'delete_permanent') {
      await prisma.novel.delete({ where: { id: novelId } });
      return NextResponse.json({ success: true, message: 'ลบนิยายถาวรเรียบร้อย' });
    }

    return NextResponse.json({ success: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
  } catch (err: any) {
    console.error('Admin novel action error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
