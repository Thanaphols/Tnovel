import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { scrapeNovelIndex } from '@/lib/scraper';
import { processBatchChaptersAsync } from '@/lib/batchTranslator';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถสั่งแปลต่อได้' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const enablePolish = body?.quality === 'polished' || Boolean(body?.enablePolish);

    const { id: novelId } = await params;
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

    // Filter out already translated chapters (must genuinely have Thai content)
    const thaiRegex = /[\u0E00-\u0E7F]/;
    const completedUrls = new Set(
      novel.chapters
        .filter((c) => {
          if (c.originalUrl.includes('dek-d.com')) return true;
          if (!c.contentTh) return false;
          return thaiRegex.test(c.contentTh) && !c.contentTh.includes('[แปลไม่สำเร็จ');
        })
        .map((c) => c.originalUrl)
    );
    const remainingChapters = indexData.chapters.filter((c) => !completedUrls.has(c.url));

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
    processBatchChaptersAsync(novel, novel.author, indexData.chapters, io, enablePolish, session.id);

    return NextResponse.json({
      success: true,
      novelId: novel.id,
      novelTitle: novel.titleTh || novel.titleEn,
      totalChapters,
      alreadyTranslated: completedUrls.size,
      remainingChapters: remainingChapters.length,
      message: `เริ่มแปลต่อ (แปลแล้ว ${completedUrls.size}/${totalChapters} ตอน, เหลืออีก ${remainingChapters.length} ตอน)`,
    });
  } catch (err: any) {
    console.error('Resume translation error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการแปลต่อ' },
      { status: 500 }
    );
  }
}
