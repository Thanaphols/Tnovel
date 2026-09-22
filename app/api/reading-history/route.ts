import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ success: true, loggedIn: false, history: [] });
    }

    const progresses = await prisma.readingProgress.findMany({
      where: { userId: session.id },
      include: {
        chapter: {
          include: {
            novel: {
              include: {
                author: true,
              },
            },
          },
        },
      },
      orderBy: { lastReadAt: 'desc' },
      take: 50,
    });

    // Group by novel (showing most recent chapter per novel)
    const novelMap = new Map<string, any>();

    for (const prog of progresses) {
      const chapter = prog.chapter;
      const novel = chapter?.novel;
      if (!novel || !chapter) continue;

      if (!novelMap.has(novel.id)) {
        novelMap.set(novel.id, {
          id: prog.id,
          novelId: novel.id,
          novelTitle: novel.titleTh || novel.titleEn,
          titleEn: novel.titleEn,
          titleTh: novel.titleTh,
          coverUrl: novel.coverUrl,
          authorName: novel.author?.name || 'Unknown Author',
          lastChapterId: chapter.id,
          lastChapterNumber: chapter.chapterNumber,
          lastChapterTitle: chapter.titleTh || chapter.titleEn,
          scrollPercent: prog.scrollPercent,
          lastReadAt: prog.lastReadAt,
          // Soft-deleted novel/chapter: keep in history but flag so the UI blocks reading it.
          isDeleted: Boolean(novel.deletedAt || chapter.deletedAt),
        });
      }
    }

    const history = Array.from(novelMap.values());

    return NextResponse.json({ success: true, loggedIn: true, history });
  } catch (err: any) {
    console.error('Reading history GET error:', err);
    return NextResponse.json({ success: false, error: 'ไม่สามารถดึงประวัติการอ่านได้' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const novelId = searchParams.get('novelId');
    const clearAll = searchParams.get('clearAll') === 'true';

    if (clearAll) {
      await prisma.readingProgress.deleteMany({
        where: { userId: session.id },
      });
      return NextResponse.json({ success: true, message: 'ล้างประวัติการอ่านทั้งหมดแล้ว' });
    }

    if (novelId) {
      // Find all chapters for this novel
      const chapters = await prisma.chapter.findMany({
        where: { novelId },
        select: { id: true },
      });
      const chapterIds = chapters.map((c) => c.id);

      await prisma.readingProgress.deleteMany({
        where: {
          userId: session.id,
          chapterId: { in: chapterIds },
        },
      });
      return NextResponse.json({ success: true, message: 'ลบประวัติของนิยายเรื่องนี้แล้ว' });
    }

    return NextResponse.json({ success: false, error: 'ระบุ novelId หรือ clearAll' }, { status: 400 });
  } catch (err: any) {
    console.error('Reading history DELETE error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการลบประวัติ' }, { status: 500 });
  }
}
