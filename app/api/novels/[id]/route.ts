import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const novel = await prisma.novel.findFirst({
      where: { id, deletedAt: null },
      include: {
        author: true,
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        chapters: {
          where: { deletedAt: null },
          select: {
            id: true,
            chapterNumber: true,
            titleEn: true,
            titleTh: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { chapterNumber: 'asc' },
        },
      },
    });

    if (!novel) {
      return NextResponse.json({ success: false, error: 'ไม่พบนิยายเรื่องนี้' }, { status: 404 });
    }

    const session = await getSession();
    let isLiked = false;
    let inBookshelf = false;
    let readingProgress: { chapterId: string; chapterNumber: number; scrollPercent: number } | null = null;

    if (session?.id) {
      const [like, bookshelfItem, progress] = await Promise.all([
        prisma.novelLike.findUnique({
          where: { userId_novelId: { userId: session.id, novelId: id } },
        }),
        prisma.bookshelf.findUnique({
          where: { userId_novelId: { userId: session.id, novelId: id } },
        }),
        prisma.readingProgress.findFirst({
          where: { userId: session.id, chapter: { novelId: id, deletedAt: null } },
          orderBy: { lastReadAt: 'desc' },
          include: { chapter: { select: { id: true, chapterNumber: true, titleTh: true } } },
        }),
      ]);
      isLiked = !!like;
      inBookshelf = !!bookshelfItem;
      if (progress?.chapter) {
        readingProgress = {
          chapterId: progress.chapter.id,
          chapterNumber: progress.chapter.chapterNumber,
          scrollPercent: progress.scrollPercent,
        };
      }
    }

    return NextResponse.json({
      success: true,
      novel: {
        ...novel,
        isLiked,
        inBookshelf,
        readingProgress,
      },
    });
  } catch (err: any) {
    console.error('Fetch novel error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนิยาย' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const novel = await prisma.novel.findUnique({ where: { id } });
    if (!novel) {
      return NextResponse.json({ success: false, error: 'ไม่พบนิยายเรื่องนี้' }, { status: 404 });
    }

    const now = new Date();

    // Soft delete Novel
    await prisma.novel.update({
      where: { id },
      data: { deletedAt: now },
    });

    // Soft delete associated Chapters
    await prisma.chapter.updateMany({
      where: { novelId: id },
      data: { deletedAt: now },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('novel:deleted', { id });
    }

    await recordAuditLog({
      userId: session.id,
      action: 'NOVEL_DELETE_SOFT',
      entity: 'NOVEL',
      entityId: id,
      details: `ย้ายนิยาย "${novel.titleTh || novel.titleEn}" ไปถังขยะ`,
      request,
    });

    return NextResponse.json({ success: true, message: 'ย้ายนิยายไปยังถังขยะเรียบร้อยแล้ว' });
  } catch (err: any) {
    console.error('Delete novel error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการย้ายนิยายไปถังขยะ' }, { status: 500 });
  }
}

// Admin: link the novel to a fandom (shared glossary), or unlink with fandomId: null.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const fandomId: string | null = typeof body?.fandomId === 'string' && body.fandomId ? body.fandomId : null;

  const novel = await prisma.novel.findFirst({ where: { id, deletedAt: null }, select: { id: true, titleTh: true } });
  if (!novel) return NextResponse.json({ success: false, error: 'ไม่พบนิยายเรื่องนี้' }, { status: 404 });

  const fandom = fandomId ? await prisma.fandom.findUnique({ where: { id: fandomId } }) : null;
  if (fandomId && !fandom) return NextResponse.json({ success: false, error: 'ไม่พบ fandom นี้' }, { status: 404 });

  await prisma.novel.update({ where: { id }, data: { fandomId } });
  await recordAuditLog({
    userId: session.id,
    action: 'NOVEL_UPDATE',
    entity: 'NOVEL',
    entityId: id,
    details: `ตั้ง fandom ของ "${novel.titleTh}" เป็น ${fandom ? `"${fandom.name}"` : 'ไม่มี'}`,
    request,
  });
  return NextResponse.json({ success: true, fandomId });
}
