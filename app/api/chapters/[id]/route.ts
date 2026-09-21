import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

function safeParseArray(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [val];
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const chapter = await prisma.chapter.findFirst({
      where: { id, deletedAt: null },
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
        contentEn: safeParseArray(chapter.contentEn),
        contentTh: safeParseArray(chapter.contentTh),
        originalUrl: chapter.originalUrl,
        status: chapter.status,
        errorCode: chapter.errorCode,
        errorMessage: chapter.errorMessage,
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: true, message: 'Unauthenticated (Guest)' });
    }

    const { scrollPercent } = await request.json();

    await prisma.readingProgress.upsert({
      where: { userId_chapterId: { userId: session.id, chapterId: id } },
      update: { scrollPercent: Math.min(100, Math.max(0, scrollPercent)), lastReadAt: new Date() },
      create: { userId: session.id, chapterId: id, scrollPercent },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const updatedChapter = await prisma.chapter.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { titleTh: true, titleEn: true, chapterNumber: true },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('chapter:deleted', { id });
    }

    await recordAuditLog({
      userId: session.id,
      action: 'CHAPTER_DELETE_SOFT',
      entity: 'CHAPTER',
      entityId: id,
      details: `ย้ายบทที่ ${updatedChapter.chapterNumber} "${updatedChapter.titleTh || updatedChapter.titleEn}" ไปถังขยะ`,
      request,
    });

    return NextResponse.json({ success: true, message: 'ย้ายบทนิยายไปถังขยะเรียบร้อยแล้ว' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการย้ายบทนิยายไปถังขยะ' }, { status: 500 });
  }
}
