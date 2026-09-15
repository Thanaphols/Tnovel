import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const deletedNovels = await prisma.novel.findMany({
      where: { deletedAt: { not: null } },
      include: { author: { select: { name: true } } },
      orderBy: { deletedAt: 'desc' },
    });

    const deletedChapters = await prisma.chapter.findMany({
      where: { deletedAt: { not: null } },
      include: { novel: { select: { titleTh: true, titleEn: true } } },
      orderBy: { deletedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      novels: deletedNovels,
      chapters: deletedChapters,
    });
  } catch (err: any) {
    console.error('Fetch bin error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดรายการในถังขยะ' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, type, id, items } = body;

    if (!action) {
      return NextResponse.json({ success: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });
    }

    const io = (global as any).io;

    // Normalize targets to an array of { type, id }
    const targets: Array<{ type: 'novel' | 'chapter'; id: string }> = [];
    if (Array.isArray(items) && items.length > 0) {
      targets.push(...items);
    } else if (type && id) {
      targets.push({ type, id });
    } else {
      return NextResponse.json({ success: false, error: 'ไม่พบรายการที่ต้องการดำเนินการ' }, { status: 400 });
    }

    const novelIds = targets.filter((t) => t.type === 'novel').map((t) => t.id);
    const chapterIds = targets.filter((t) => t.type === 'chapter').map((t) => t.id);

    if (action === 'restore') {
      if (novelIds.length > 0) {
        await prisma.novel.updateMany({
          where: { id: { in: novelIds } },
          data: { deletedAt: null },
        });
        await prisma.chapter.updateMany({
          where: { novelId: { in: novelIds } },
          data: { deletedAt: null },
        });
      }

      if (chapterIds.length > 0) {
        await prisma.chapter.updateMany({
          where: { id: { in: chapterIds } },
          data: { deletedAt: null },
        });
      }

      if (io) {
        io.emit('bin:updated', { action: 'restore', novelIds, chapterIds });
      }

      return NextResponse.json({
        success: true,
        message: `กู้คืน ${targets.length} รายการเรียบร้อยแล้ว`,
        restoredNovels: novelIds,
        restoredChapters: chapterIds,
      });
    } else if (action === 'permanent_delete') {
      if (novelIds.length > 0) {
        // Clean up relations first to prevent any SQLite foreign key constraints
        await prisma.report.deleteMany({
          where: {
            OR: [
              { novelId: { in: novelIds } },
              { chapter: { novelId: { in: novelIds } } },
            ],
          },
        });
        await prisma.readingProgress.deleteMany({
          where: { chapter: { novelId: { in: novelIds } } },
        });
        await prisma.chapterBookmark.deleteMany({
          where: { chapter: { novelId: { in: novelIds } } },
        });
        await prisma.novelLike.deleteMany({
          where: { novelId: { in: novelIds } },
        });
        await prisma.bookshelf.deleteMany({
          where: { novelId: { in: novelIds } },
        });
        await prisma.chapter.deleteMany({
          where: { novelId: { in: novelIds } },
        });
        await prisma.novel.deleteMany({
          where: { id: { in: novelIds } },
        });
      }

      if (chapterIds.length > 0) {
        await prisma.report.deleteMany({
          where: { chapterId: { in: chapterIds } },
        });
        await prisma.readingProgress.deleteMany({
          where: { chapterId: { in: chapterIds } },
        });
        await prisma.chapterBookmark.deleteMany({
          where: { chapterId: { in: chapterIds } },
        });
        await prisma.chapter.deleteMany({
          where: { id: { in: chapterIds } },
        });
      }

      if (io) {
        io.emit('bin:updated', { action: 'permanent_delete', novelIds, chapterIds });
      }

      return NextResponse.json({
        success: true,
        message: `ลบ ${targets.length} รายการออกจากระบบถาวรเรียบร้อยแล้ว`,
        deletedNovels: novelIds,
        deletedChapters: chapterIds,
      });
    }

    return NextResponse.json({ success: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
  } catch (err: any) {
    console.error('Bin action error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการทำรายการ' }, { status: 500 });
  }
}
