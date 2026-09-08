import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ success: true, loggedIn: false, novels: [] });
    }

    const items = await prisma.bookshelf.findMany({
      where: { userId: session.id },
      include: {
        novel: {
          include: {
            author: true,
            chapters: {
              where: { deletedAt: null },
              select: { id: true, chapterNumber: true, titleTh: true, createdAt: true },
              orderBy: { chapterNumber: 'asc' },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const novelIds = items.map((i) => i.novelId);

    // Get latest reading progress for each novel in bookshelf
    const progresses = await prisma.readingProgress.findMany({
      where: {
        userId: session.id,
        chapter: { novelId: { in: novelIds } },
      },
      include: {
        chapter: { select: { id: true, chapterNumber: true, titleTh: true, novelId: true } },
      },
      orderBy: { lastReadAt: 'desc' },
    });

    const novels = items.map((item) => {
      const novelProgresses = progresses.filter((p) => p.chapter.novelId === item.novelId);
      const lastProgress = novelProgresses[0] || null;
      const totalChapters = item.novel.chapters.length;
      const readChapterNumber = lastProgress ? lastProgress.chapter.chapterNumber : 0;
      const unreadCount = Math.max(0, totalChapters - readChapterNumber);

      return {
        id: item.novel.id,
        titleEn: item.novel.titleEn,
        titleTh: item.novel.titleTh,
        coverUrl: item.novel.coverUrl,
        author: item.novel.author,
        totalChapters,
        viewCount: item.novel.viewCount,
        likeCount: item.novel.likeCount,
        bookmarkedAt: item.createdAt,
        lastReadChapter: lastProgress
          ? {
              id: lastProgress.chapter.id,
              chapterNumber: lastProgress.chapter.chapterNumber,
              titleTh: lastProgress.chapter.titleTh,
              scrollPercent: lastProgress.scrollPercent,
              lastReadAt: lastProgress.lastReadAt,
            }
          : null,
        unreadCount,
        firstChapterId: item.novel.chapters[0]?.id || null,
        latestChapterId: item.novel.chapters[totalChapters - 1]?.id || null,
      };
    });

    return NextResponse.json({ success: true, loggedIn: true, novels });
  } catch (err: any) {
    console.error('Bookshelf GET error:', err);
    return NextResponse.json({ success: false, error: 'ไม่สามารถดึงข้อมูลชั้นหนังสือได้' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const body = await request.json();
    const { novelId } = body;

    if (!novelId) {
      return NextResponse.json({ success: false, error: 'Missing novelId' }, { status: 400 });
    }

    if (!session?.id) {
      return NextResponse.json({ success: true, loggedIn: false, guest: true });
    }

    const existing = await prisma.bookshelf.findUnique({
      where: {
        userId_novelId: {
          userId: session.id,
          novelId,
        },
      },
    });

    if (existing) {
      // Remove from bookshelf
      await prisma.bookshelf.delete({
        where: { id: existing.id },
      });
      return NextResponse.json({ success: true, inBookshelf: false, message: 'นำออกจากชั้นหนังสือแล้ว' });
    } else {
      // Add to bookshelf
      await prisma.bookshelf.create({
        data: {
          userId: session.id,
          novelId,
        },
      });
      return NextResponse.json({ success: true, inBookshelf: true, message: 'เพิ่มเข้าชั้นหนังสือแล้ว' });
    }
  } catch (err: any) {
    console.error('Bookshelf POST error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการจัดการชั้นหนังสือ' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const novelId = searchParams.get('novelId');

    if (!session?.id) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    if (!novelId) {
      return NextResponse.json({ success: false, error: 'Missing novelId' }, { status: 400 });
    }

    await prisma.bookshelf.deleteMany({
      where: {
        userId: session.id,
        novelId,
      },
    });

    return NextResponse.json({ success: true, message: 'นำออกจากชั้นหนังสือเรียบร้อย' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
