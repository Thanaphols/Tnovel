import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { novelId, chapterId, reason, description } = await request.json();

    if (!reason) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุเหตุผลในการรายงาน' },
        { status: 400 }
      );
    }

    const session = await getSession();

    const report = await prisma.report.create({
      data: {
        novelId: novelId || null,
        chapterId: chapterId || null,
        userId: session?.id || null,
        reason,
        description: description?.trim() || null,
      },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('report:created', { id: report.id });
    }

    return NextResponse.json({
      success: true,
      message: 'ส่งรายงานปัญหาเรียบร้อยแล้ว ทีมงานจะรีบตรวจสอบให้ครับ',
      reportId: report.id,
    });
  } catch (err: any) {
    console.error('Create report error:', err);
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการส่งรายงานปัญหา' },
      { status: 500 }
    );
  }
}
