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

    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const cursor = searchParams.get('cursor');
    const categoryFilter = searchParams.get('category')?.trim();
    const search = searchParams.get('search')?.trim();
    const sort = searchParams.get('sort')?.trim() || 'latest';

    const session = await getSession();

    const whereClause: any = {
      deletedAt: null,
    };
    if (categoryFilter && categoryFilter !== 'ALL' && categoryFilter !== 'all') {
      // Accept one or many categories (comma-separated) so the filter UI can stack tags.
      const cats = categoryFilter
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c && c !== 'ALL' && c !== 'all');
      if (cats.length === 1) whereClause.category = cats[0];
      else if (cats.length > 1) whereClause.category = { in: cats };
    }
    if (search) {
      // ponytail: SQLite `contains` is case-sensitive; good enough for now.
      // Add a normalized lowercase column if case-insensitive search is needed.
      whereClause.OR = [
        { titleTh: { contains: search } },
        { titleEn: { contains: search } },
        { author: { name: { contains: search } } },
      ];
    }

    // Map the sort key to a Prisma orderBy; id is the stable tiebreaker for cursor paging.
    const orderByMap: Record<string, any[]> = {
      latest: [{ updatedAt: 'desc' }, { id: 'desc' }],
      newest: [{ createdAt: 'desc' }, { id: 'desc' }],
      views: [{ viewCount: 'desc' }, { id: 'desc' }],
      likes: [{ likeCount: 'desc' }, { id: 'desc' }],
      chapters: [{ chapters: { _count: 'desc' } }, { id: 'desc' }],
    };
    const orderBy = orderByMap[sort] || orderByMap.latest;

    const [totalCount, novels] = await Promise.all([
      prisma.novel.count({
        where: whereClause,
      }),
      prisma.novel.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        where: whereClause,
        orderBy,
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
            // Count only live chapters so cards don't show soft-deleted ones.
            select: { chapters: { where: { deletedAt: null } } },
          },
        },
      }),
    ]);

    let nextCursor: string | null = null;
    if (novels.length > limit) {
      novels.pop();
      const lastItem = novels[novels.length - 1];
      nextCursor = lastItem?.id || null;
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
      category: n.category,
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
      hasMore: !!nextCursor,
      total: totalCount,
    });
  } catch (err: any) {
    console.error('Fetch novels error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงคลังนิยาย' }, { status: 500 });
  }
}
