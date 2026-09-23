import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'translating' | 'completed'
    const search = searchParams.get('q') || '';

    const session = await getSession();

    // Guest: no per-user server-side reading history exists.
    if (!session) {
      return NextResponse.json({ success: true, novels: [], counts: { all: 0, translating: 0, completed: 0 } });
    }

    // Base query
    const where: any = {
      deletedAt: null,
    };

    // Non-admins see only their own reading history (novels they have read); admins keep the
    // full list for translation management. This is what makes "ประวัติการอ่าน" per-user.
    if (session.role !== 'ADMIN') {
      where.chapters = { some: { readingProgresses: { some: { userId: session.id } } } };
    }

    if (search.trim()) {
      where.OR = [
        { titleTh: { contains: search } },
        { titleEn: { contains: search } },
        { author: { name: { contains: search } } },
      ];
    }

    // If logged in and not admin, prioritize user's own novels, but allow viewing all uploaded novels if none
    const novels = await prisma.novel.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: true,
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        chapters: {
          where: { deletedAt: null },
          orderBy: { chapterNumber: 'asc' },
          select: { id: true, chapterNumber: true, titleTh: true, titleEn: true, originalUrl: true },
        },
        _count: {
          select: { chapters: { where: { deletedAt: null } } },
        },
      },
    });

    const formattedNovels = novels.map((novel) => {
      const chapterCount = novel._count.chapters;
      const totalChapters = novel.totalChapters || chapterCount || 1;
      const percent = Math.min(100, Math.round((chapterCount / totalChapters) * 100));

      let computedStatus = novel.translationStatus;
      if (chapterCount >= totalChapters && totalChapters > 0) {
        computedStatus = 'COMPLETED';
      } else if (computedStatus === 'COMPLETED' && chapterCount < totalChapters) {
        computedStatus = 'CANCELLED';
      }

      return {
        id: novel.id,
        titleEn: novel.titleEn,
        titleTh: novel.titleTh,
        description: novel.description,
        coverUrl: novel.coverUrl,
        sourceUrl: novel.sourceUrl,
        viewCount: novel.viewCount,
        likeCount: novel.likeCount,
        createdAt: novel.createdAt,
        updatedAt: novel.updatedAt,
        author: novel.author,
        createdBy: novel.createdBy,
        chapterCount,
        totalChapters,
        percent,
        translationStatus: computedStatus,
        firstChapterId: novel.chapters[0]?.id || null,
        latestChapterId: novel.chapters[novel.chapters.length - 1]?.id || null,
        isMine: session?.id === novel.createdById,
      };
    });

    // Apply status filtering
    let filteredResult = formattedNovels;
    if (filter === 'translating') {
      filteredResult = formattedNovels.filter(
        (n) => n.translationStatus === 'TRANSLATING' || n.translationStatus === 'CANCELLED' || n.translationStatus === 'PAUSED' || n.chapterCount < n.totalChapters
      );
    } else if (filter === 'completed') {
      filteredResult = formattedNovels.filter(
        (n) => n.translationStatus === 'COMPLETED' || (n.totalChapters > 0 && n.chapterCount >= n.totalChapters)
      );
    }

    return NextResponse.json({
      success: true,
      novels: filteredResult,
      counts: {
        all: formattedNovels.length,
        translating: formattedNovels.filter(
          (n) => n.translationStatus === 'TRANSLATING' || n.translationStatus === 'CANCELLED' || n.translationStatus === 'PAUSED' || n.chapterCount < n.totalChapters
        ).length,
        completed: formattedNovels.filter(
          (n) => n.translationStatus === 'COMPLETED' || (n.totalChapters > 0 && n.chapterCount >= n.totalChapters)
        ).length,
      },
    });
  } catch (err: any) {
    console.error('Fetch history error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการดึงประวัติ' },
      { status: 500 }
    );
  }
}
