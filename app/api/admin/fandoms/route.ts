import { NextResponse } from 'next/server';
import { withJsonErrors } from '@/lib/jsonErrors';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

const forbidden = () =>
  NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });

// Any signed-in admin UI needs the list (scrape drawer, novel page), so GET is admin-only too.
async function handleGET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const fandoms = await prisma.fandom.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { terms: true, novels: true } } },
  });
  return NextResponse.json({
    success: true,
    fandoms: fandoms.map((f) => ({
      id: f.id,
      name: f.name,
      termCount: f._count.terms,
      novelCount: f._count.novels,
    })),
  });
}

async function handlePOST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) {
    return NextResponse.json({ success: false, error: 'กรุณาระบุชื่อ fandom (ไม่เกิน 100 ตัวอักษร)' }, { status: 400 });
  }
  if (await prisma.fandom.findUnique({ where: { name } })) {
    return NextResponse.json({ success: false, error: 'มี fandom ชื่อนี้อยู่แล้ว' }, { status: 409 });
  }

  const fandom = await prisma.fandom.create({ data: { name } });
  await recordAuditLog({
    userId: session.id,
    action: 'FANDOM_CREATE',
    entity: 'FANDOM',
    entityId: fandom.id,
    details: `สร้าง fandom "${name}"`,
    request,
  });
  return NextResponse.json({ success: true, fandom: { ...fandom, termCount: 0, novelCount: 0 } });
}

async function handleDELETE(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const id = new URL(request.url).searchParams.get('id');
  const fandom = id ? await prisma.fandom.findUnique({ where: { id } }) : null;
  if (!fandom) {
    return NextResponse.json({ success: false, error: 'ไม่พบ fandom นี้' }, { status: 404 });
  }

  // Terms cascade; novels keep their own glossary and just lose the link (onDelete: SetNull).
  await prisma.fandom.delete({ where: { id: fandom.id } });
  await recordAuditLog({
    userId: session.id,
    action: 'FANDOM_DELETE',
    entity: 'FANDOM',
    entityId: fandom.id,
    details: `ลบ fandom "${fandom.name}" พร้อมคำศัพท์ทั้งหมด`,
    request,
  });
  return NextResponse.json({ success: true });
}

export const GET = withJsonErrors(handleGET);
export const POST = withJsonErrors(handlePOST);
export const DELETE = withJsonErrors(handleDELETE);
