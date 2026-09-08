import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const chapter = await prisma.chapter.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        novel: {
          include: {
            author: true,
            chapters: {
              where: { deletedAt: null },
              select: { id: true, chapterNumber: true, titleTh: true },
              orderBy: { chapterNumber: 'asc' },
            },
          },
        },
      },
    });

    if (!chapter) {
      return NextResponse.json({ success: false, error: 'ไม่พบบทนิยายนี้' }, { status: 404 });
    }

    // Increment novel view count asynchronously
    prisma.novel
      .update({
        where: { id: chapter.novelId },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});

    const session = await getSession();
    let scrollPercent = 0;
    if (session?.id) {
      const progress = await prisma.readingProgress.findUnique({
        where: { userId_chapterId: { userId: session.id, chapterId: chapter.id } },
      });
      if (progress) scrollPercent = progress.scrollPercent;
    }

    return NextResponse.json({
      success: true,
      chapter: {
        id: chapter.id,
        chapterNumber: chapter.chapterNumber,
        titleEn: chapter.titleEn,
        titleTh: chapter.titleTh,
        contentEn: JSON.parse(chapter.contentEn),
        contentTh: JSON.parse(chapter.contentTh),
        originalUrl: chapter.originalUrl,
        novelId: chapter.novelId,
        novelTitle: chapter.novel.titleTh || chapter.novel.titleEn,
        authorName: chapter.novel.author?.name || 'Unknown Author',
        allChapters: chapter.novel.chapters,
        savedScrollPercent: scrollPercent,
      },
    });
  } catch (err: any) {
    console.error('Fetch chapter error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดบทนิยาย' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: true, message: 'Unauthenticated (Guest)' });
    }

    const { scrollPercent } = await request.json();

    await prisma.readingProgress.upsert({
      where: { userId_chapterId: { userId: session.id, chapterId: params.id } },
      update: { scrollPercent: Math.min(100, Math.max(0, scrollPercent)), lastReadAt: new Date() },
      create: { userId: session.id, chapterId: params.id, scrollPercent },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
    }

    await prisma.chapter.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('chapter:deleted', { id: params.id });
    }

    return NextResponse.json({ success: true, message: 'ย้ายบทนิยายไปถังขยะเรียบร้อยแล้ว' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการย้ายบทนิยายไปถังขยะ' }, { status: 500 });
  }
}
