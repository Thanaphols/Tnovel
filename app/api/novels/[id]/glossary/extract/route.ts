import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { autoDiscoverAndSaveGlossary } from '@/lib/glossaryService';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' },
        { status: 403 }
      );
    }

    const { id: novelId } = await params;
    const novel = await prisma.novel.findUnique({
      where: { id: novelId, deletedAt: null },
      select: { id: true, titleTh: true, titleEn: true },
    });

    if (!novel) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบนิยายเรื่องนี้' },
        { status: 404 }
      );
    }

    // Fetch chapters that have English content
    const chapters = await prisma.chapter.findMany({
      where: { novelId, deletedAt: null, contentEn: { not: null } },
      select: { contentEn: true },
      orderBy: { chapterNumber: 'asc' },
      take: 20, // Scan up to first 20 chapters for fast response
    });

    let totalDiscovered = 0;
    for (const ch of chapters) {
      if (!ch.contentEn) continue;
      try {
        const paragraphsEn: string[] = JSON.parse(ch.contentEn);
        const discovered = await autoDiscoverAndSaveGlossary(novelId, paragraphsEn);
        totalDiscovered += discovered;
      } catch {}
    }

    const totalCount = await prisma.novelGlossary.count({ where: { novelId } });

    return NextResponse.json({
      success: true,
      discoveredCount: totalDiscovered,
      totalCount,
      message: totalDiscovered > 0
        ? `สแกนพบคำศัพท์ใหม่ ${totalDiscovered} คำ และบันทึกเข้า Glossary เรียบร้อยแล้ว`
        : 'สแกนเสร็จสิ้น ไม่พบคำศัพท์ใหม่เพิ่มเติม (มีในคลังครบแล้ว)',
    });
  } catch (err: any) {
    console.error('[GlossaryExtract] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการสแกนคำศัพท์' },
      { status: 500 }
    );
  }
}
