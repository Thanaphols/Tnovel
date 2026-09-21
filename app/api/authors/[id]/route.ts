import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const author = await prisma.author.findFirst({
      where: { id, deletedAt: null },
      include: {
        novels: {
          where: { deletedAt: null },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true, avatar: true },
            },
            _count: { select: { chapters: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!author) {
      return NextResponse.json({ success: false, error: 'ไม่พบข้อมูลผู้แต่งนี้' }, { status: 404 });
    }

    return NextResponse.json({ success: true, author });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดข้อมูลผู้แต่ง' }, { status: 500 });
  }
}
