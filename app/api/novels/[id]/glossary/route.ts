import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: novelId } = await params;
    const items = await prisma.novelGlossary.findMany({
      where: { novelId },
      include: { aliases: true },
      orderBy: { canonicalEn: 'asc' },
    });

    // Provide termEn / termTh aliases for frontend backwards compatibility
    const glossaries = items.map((g) => ({
      ...g,
      termEn: g.canonicalEn,
      termTh: g.canonicalTh,
    }));

    return NextResponse.json({ success: true, glossaries });
  } catch (err: any) {
    console.error('Fetch glossary error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'ไม่สามารถดึงข้อมูลคำศัพท์ได้' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการคำศัพท์ได้' },
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

    const body = await request.json();

    // Support bulk add
    if (Array.isArray(body.items)) {
      const created: any[] = [];
      for (const item of body.items) {
        const en = (item.canonicalEn || item.termEn || '').trim();
        const th = (item.canonicalTh || item.termTh || '').trim();
        if (!en || !th) continue;

        const entry = await prisma.novelGlossary.upsert({
          where: {
            novelId_canonicalEn: {
              novelId,
              canonicalEn: en,
            },
          },
          create: {
            novelId,
            canonicalEn: en,
            canonicalTh: th,
            category: item.category?.trim() || 'name',
            isLocked: !!item.isLocked,
          },
          update: {
            canonicalTh: th,
            category: item.category?.trim() || 'name',
            ...(item.isLocked !== undefined ? { isLocked: !!item.isLocked } : {}),
          },
        });
        created.push({ ...entry, termEn: entry.canonicalEn, termTh: entry.canonicalTh });
      }

      await recordAuditLog({
        userId: session.id,
        action: 'GLOSSARY_BULK_UPDATE',
        entity: 'NOVEL',
        entityId: novelId,
        details: `เพิ่ม/อัปเดตคำศัพท์ ${created.length} คำ สำหรับเรื่อง "${novel.titleTh || novel.titleEn}"`,
        request,
      });

      return NextResponse.json({ success: true, count: created.length, glossaries: created });
    }

    // Single item add/update
    const en = (body.canonicalEn || body.termEn || '').trim();
    const th = (body.canonicalTh || body.termTh || '').trim();
    const category = body.category?.trim() || 'name';
    const isLocked = body.isLocked !== undefined ? !!body.isLocked : false;

    if (!en) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุคำศัพท์ภาษาอังกฤษ' },
        { status: 400 }
      );
    }
    if (!th) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุคำแปลภาษาไทย' },
        { status: 400 }
      );
    }

    const glossary = await prisma.novelGlossary.upsert({
      where: {
        novelId_canonicalEn: {
          novelId,
          canonicalEn: en,
        },
      },
      create: {
        novelId,
        canonicalEn: en,
        canonicalTh: th,
        category,
        isLocked,
      },
      update: {
        canonicalTh: th,
        category,
        isLocked,
      },
    });

    await recordAuditLog({
      userId: session.id,
      action: 'GLOSSARY_UPDATE',
      entity: 'NOVEL',
      entityId: novelId,
      details: `ตั้งค่าคำศัพท์ "${glossary.canonicalEn}" -> "${glossary.canonicalTh}" สำหรับเรื่อง "${novel.titleTh || novel.titleEn}"`,
      request,
    });

    return NextResponse.json({
      success: true,
      glossary: { ...glossary, termEn: glossary.canonicalEn, termTh: glossary.canonicalTh },
    });
  } catch (err: any) {
    console.error('Save glossary error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการบันทึกคำศัพท์' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบคำศัพท์ได้' },
        { status: 403 }
      );
    }

    const { id: novelId } = await params;
    const url = new URL(request.url);
    const glossaryId = url.searchParams.get('glossaryId');

    if (!glossaryId) {
      return NextResponse.json(
        { success: false, error: 'กรุณาระบุ glossaryId ที่ต้องการลบ' },
        { status: 400 }
      );
    }

    const existing = await prisma.novelGlossary.findFirst({
      where: { id: glossaryId, novelId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบคำศัพท์นี้ในระบบ' },
        { status: 404 }
      );
    }

    await prisma.novelGlossary.delete({
      where: { id: glossaryId },
    });

    await recordAuditLog({
      userId: session.id,
      action: 'GLOSSARY_DELETE',
      entity: 'NOVEL',
      entityId: novelId,
      details: `ลบคำศัพท์ "${existing.canonicalEn}" (${existing.canonicalTh})`,
      request,
    });

    return NextResponse.json({ success: true, message: 'ลบคำศัพท์เรียบร้อยแล้ว' });
  } catch (err: any) {
    console.error('Delete glossary error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการลบคำศัพท์' },
      { status: 500 }
    );
  }
}
