import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const novel = await prisma.novel.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        author: true,
        chapters: {
          where: { deletedAt: null },
          orderBy: { chapterNumber: 'asc' },
        },
      },
    });

    if (!novel) {
      return NextResponse.json({ success: false, error: 'ไม่พบนิยายเรื่องนี้' }, { status: 404 });
    }

    return NextResponse.json({ success: true, novel });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนิยาย' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const novel = await prisma.novel.findUnique({ where: { id: params.id } });
    if (!novel) {
      return NextResponse.json({ success: false, error: 'ไม่พบนิยายเรื่องนี้' }, { status: 404 });
    }

    const now = new Date();

    // Soft delete Novel
    await prisma.novel.update({
      where: { id: params.id },
      data: { deletedAt: now },
    });

    // Soft delete associated Chapters
    await prisma.chapter.updateMany({
      where: { novelId: params.id },
      data: { deletedAt: now },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('novel:deleted', { id: params.id });
    }

    return NextResponse.json({ success: true, message: 'ย้ายนิยายไปยังถังขยะเรียบร้อยแล้ว' });
  } catch (err: any) {
    console.error('Delete novel error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการย้ายนิยายไปถังขยะ' }, { status: 500 });
  }
}
