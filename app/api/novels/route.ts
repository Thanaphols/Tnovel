import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // The full listing embeds every chapter of every novel, which is far too much payload for
    // something that only needs names (the paste form's datalist).
    if (searchParams.get('titlesOnly')) {
      const titles = await prisma.novel.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, titleTh: true, titleEn: true },
        take: 200,
      });
      return NextResponse.json({ success: true, items: titles });
    }

    const limit = parseInt(searchParams.get('limit') || '8', 10);
    const cursor = searchParams.get('cursor');

    const session = await getSession();

    const novels = await prisma.novel.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: {
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        author: {
          select: { id: true, name: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        chapters: {
          where: { deletedAt: null },
          orderBy: { chapterNumber: 'asc' },
          select: { id: true, chapterNumber: true, titleTh: true, titleEn: true, updatedAt: true },
        },
        _count: {
          select: { chapters: true },
        },
      },
    });

    let nextCursor: string | null = null;
    if (novels.length > limit) {
      const nextItem = novels.pop();
      nextCursor = nextItem?.id || null;
    }

    let userProgressMap: Record<string, number> = {};
    let userLikedSet = new Set<string>();

    if (session?.id) {
      const [progresses, userLikes] = await Promise.all([
        prisma.readingProgress.findMany({
          where: { userId: session.id },
        }),
        prisma.novelLike.findMany({
          where: { userId: session.id },
          select: { novelId: true },
        }),
      ]);

      progresses.forEach((p) => {
        userProgressMap[p.chapterId] = p.scrollPercent;
      });

      userLikes.forEach((l) => {
        userLikedSet.add(l.novelId);
      });
    }

    const items = novels.map((n) => ({
      id: n.id,
      titleEn: n.titleEn,
      titleTh: n.titleTh,
      coverUrl: n.coverUrl,
      sourceUrl: n.sourceUrl,
      author: n.author,
      createdBy: n.createdBy,
      chapterCount: n._count.chapters,
      totalChapters: n.totalChapters || 0,
      translationStatus: n.translationStatus || 'COMPLETED',
      chapters: n.chapters,
      viewCount: n.viewCount || 0,
      likeCount: n.likeCount || 0,
      liked: userLikedSet.has(n.id),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      progress: n.chapters.length > 0 ? userProgressMap[n.chapters[0].id] || 0 : 0,
    }));

    return NextResponse.json({
      success: true,
      items,
      nextCursor,
    });
  } catch (err: any) {
    console.error('Fetch novels error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงคลังนิยาย' }, { status: 500 });
  }
}
