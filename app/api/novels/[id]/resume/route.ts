import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { scrapeNovelIndex } from '@/lib/scraper';
import { processBatchChaptersAsync } from '@/lib/batchTranslator';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถสั่งแปลต่อได้' },
        { status: 403 }
      );
    }

    const novelId = params.id;
    const novel = await prisma.novel.findUnique({
      where: { id: novelId, deletedAt: null },
      include: { author: true, chapters: { where: { deletedAt: null } } },
    });

    if (!novel) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบนิยายเรื่องนี้ในระบบ' },
        { status: 404 }
      );
    }

    const io = (global as any).io;

    // Scrape index/catalog again to get full chapter links list
    const indexData = await scrapeNovelIndex(novel.sourceUrl);
    const totalChapters = indexData.chapters.length || novel.chapters.length;

    // Filter out already translated chapters
    const existingUrls = new Set(novel.chapters.map((c) => c.originalUrl));
    const remainingChapters = indexData.chapters.filter((c) => !existingUrls.has(c.url));

    if (remainingChapters.length === 0) {
      await prisma.novel.update({
        where: { id: novel.id },
        data: { translationStatus: 'COMPLETED', totalChapters },
      });

      return NextResponse.json({
        success: true,
        message: 'นิยายเรื่องนี้แปลครบทุกตอนแล้ว!',
        completed: true,
      });
    }

    // Update novel status
    await prisma.novel.update({
      where: { id: novel.id },
      data: {
        translationStatus: 'TRANSLATING',
        totalChapters,
      },
    });

    // Start background translation process
    processBatchChaptersAsync(novel, novel.author, indexData.chapters, io);

    return NextResponse.json({
      success: true,
      novelId: novel.id,
      novelTitle: novel.titleTh || novel.titleEn,
      totalChapters,
      alreadyTranslated: novel.chapters.length,
      remainingChapters: remainingChapters.length,
      message: `เริ่มแปลต่อจากตอนที่ ${novel.chapters.length + 1} (เหลืออีก ${remainingChapters.length} ตอน)`,
    });
  } catch (err: any) {
    console.error('Resume translation error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการแปลต่อ' },
      { status: 500 }
    );
  }
}
