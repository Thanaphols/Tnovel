import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ success: true, loggedIn: false, bookmarks: [] });
    }

    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');

    // If querying specific chapter bookmark status
    if (chapterId) {
      const existing = await prisma.chapterBookmark.findUnique({
        where: {
          userId_chapterId: {
            userId: session.id,
            chapterId,
          },
        },
      });
      return NextResponse.json({ success: true, loggedIn: true, isBookmarked: !!existing });
    }

    // List all user's bookmarks
    const bookmarks = await prisma.chapterBookmark.findMany({
      where: { userId: session.id },
      include: {
        chapter: {
          include: {
            novel: {
              select: {
                id: true,
                titleEn: true,
                titleTh: true,
                coverUrl: true,
                author: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = bookmarks.map((b) => ({
      id: b.id,
      chapterId: b.chapterId,
      chapterNumber: b.chapter.chapterNumber,
      chapterTitle: b.chapter.titleTh || b.chapter.titleEn,
      novelId: b.chapter.novel.id,
      novelTitle: b.chapter.novel.titleTh || b.chapter.novel.titleEn,
      coverUrl: b.chapter.novel.coverUrl,
      authorName: b.chapter.novel.author?.name || 'Unknown Author',
      note: b.note,
      createdAt: b.createdAt,
    }));

    return NextResponse.json({ success: true, loggedIn: true, bookmarks: formatted });
  } catch (err: any) {
    console.error('Bookmarks GET error:', err);
    return NextResponse.json({ success: false, error: 'ไม่สามารถดึงข้อมูลบุ๊กมาร์กได้' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const body = await request.json();
    const { chapterId, note } = body;

    if (!chapterId) {
      return NextResponse.json({ success: false, error: 'Missing chapterId' }, { status: 400 });
    }

    if (!session?.id) {
      return NextResponse.json({ success: true, loggedIn: false, guest: true });
    }

    const existing = await prisma.chapterBookmark.findUnique({
      where: {
        userId_chapterId: {
          userId: session.id,
          chapterId,
        },
      },
    });

    if (existing) {
      await prisma.chapterBookmark.delete({
        where: { id: existing.id },
      });
      return NextResponse.json({ success: true, isBookmarked: false, message: 'ยกเลิกคั่นหน้านี้แล้ว' });
    } else {
      await prisma.chapterBookmark.create({
        data: {
          userId: session.id,
          chapterId,
          note: note || null,
        },
      });
      return NextResponse.json({ success: true, isBookmarked: true, message: 'คั่นหน้านี้เรียบร้อยแล้ว' });
    }
  } catch (err: any) {
    console.error('Bookmarks POST error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกบุ๊กมาร์ก' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');

    if (!session?.id) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    if (!chapterId) {
      return NextResponse.json({ success: false, error: 'Missing chapterId' }, { status: 400 });
    }

    await prisma.chapterBookmark.deleteMany({
      where: {
        userId: session.id,
        chapterId,
      },
    });

    return NextResponse.json({ success: true, message: 'ลบบุ๊กมาร์กเรียบร้อย' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
