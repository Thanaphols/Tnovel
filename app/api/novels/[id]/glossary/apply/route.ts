import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { applyGlossaryToNovelChapters } from '@/lib/glossaryService';

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

    const body = await request.json().catch(() => ({}));
    const scope = body.scope || 'all';
    const rangeStart = typeof body.rangeStart === 'number' ? body.rangeStart : undefined;
    const rangeEnd = typeof body.rangeEnd === 'number' ? body.rangeEnd : undefined;
    const chapterIds = Array.isArray(body.chapterIds)
      ? body.chapterIds
      : body.chapterId
      ? [body.chapterId]
      : undefined;
    const customReplacements = Array.isArray(body.customReplacements)
      ? body.customReplacements
      : undefined;

    const result = await applyGlossaryToNovelChapters({
      novelId,
      chapterIds,
      rangeStart,
      rangeEnd,
      customReplacements,
    });

    await recordAuditLog({
      userId: session.id,
      action: 'GLOSSARY_APPLY',
      entity: 'NOVEL',
      entityId: novelId,
      details: `นำคำศัพท์ไปแทนที่ในเนื้อหา "${novel.titleTh || novel.titleEn}": อัปเดต ${result.updatedChapters}/${result.totalChapters} ตอน (แทนที่ทั้งหมด ${result.totalReplacements} จุด)`,
      request,
    });

    const isBatch = Boolean(body?.isBatch);
    const batchIndex = typeof body?.batchIndex === 'number' ? body.batchIndex : 1;
    const batchTotal = typeof body?.batchTotal === 'number' ? body.batchTotal : 1;
    const isLastChapter = isBatch && batchIndex >= batchTotal;

    const io = (global as any).io;
    const novelTitle = novel.titleTh || novel.titleEn || 'นิยาย';
    if (isBatch && io) {
      const completedPct = Math.round((batchIndex / batchTotal) * 100);
      if (isLastChapter) {
        (global as any).activeTranslationJob = null;
        io.emit('translation:progress', {
          status: 'batch_completed',
          jobType: 'batch',
          initiatorUserId: session.id,
          novelId,
          novelTitle,
          totalChapters: batchTotal,
          percent: 100,
          message: `แทนที่คำศัพท์สำเร็จครบทั้ง ${batchTotal} ตอนแล้ว!`,
        });
      } else {
        (global as any).activeTranslationJob = {
          isActive: true,
          initiatorUserId: session.id,
          novelId,
          novelTitle,
          chapterTitle: `แทนที่คำศัพท์ ตอนที่ ${batchIndex}/${batchTotal}`,
          currentChapter: batchIndex,
          totalChapters: batchTotal,
          percent: completedPct,
          isPaused: false,
          updatedAt: new Date().toISOString(),
        };
        io.emit('translation:progress', {
          status: 'batch_progress',
          jobType: 'batch',
          initiatorUserId: session.id,
          novelId,
          novelTitle,
          chapterTitle: `แทนที่คำศัพท์ ตอนที่ ${batchIndex}/${batchTotal}`,
          currentChapter: batchIndex,
          totalChapters: batchTotal,
          chapterCount: batchIndex,
          percent: completedPct,
          isPaused: false,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `แทนที่คำศัพท์เรียบร้อยแล้ว: อัปเดต ${result.updatedChapters} จาก ${result.totalChapters} ตอน (แทนที่ ${result.totalReplacements} จุด)`,
      ...result,
    });
  } catch (err: any) {
    console.error('Apply glossary error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการแทนที่คำศัพท์' },
      { status: 500 }
    );
  }
}
