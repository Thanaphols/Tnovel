import { NextResponse } from 'next/server';
import { withJsonErrors } from '@/lib/jsonErrors';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

// Same request/response shape as /api/novels/[id]/glossary so GlossaryEditor works on both.

type Params = { params: Promise<{ id: string }> };

const forbidden = () =>
  NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });

const withAliases = <T extends { canonicalEn: string; canonicalTh: string }>(g: T) => ({
  ...g,
  termEn: g.canonicalEn,
  termTh: g.canonicalTh,
});

async function handleGET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const items = await prisma.fandomGlossary.findMany({ where: { fandomId }, orderBy: { canonicalEn: 'asc' } });
  return NextResponse.json({ success: true, glossaries: items.map(withAliases) });
}

async function handlePOST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const fandom = await prisma.fandom.findUnique({ where: { id: fandomId } });
  if (!fandom) return NextResponse.json({ success: false, error: 'ไม่พบ fandom นี้' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const en = (body.canonicalEn || body.termEn || '').trim();
  const th = (body.canonicalTh || body.termTh || '').trim();
  const category = body.category?.trim() || 'name';
  if (!en || !th) {
    return NextResponse.json({ success: false, error: 'กรุณาระบุคำภาษาอังกฤษและคำแปลภาษาไทย' }, { status: 400 });
  }

  const glossary = await prisma.fandomGlossary.upsert({
    where: { fandomId_canonicalEn: { fandomId, canonicalEn: en } },
    create: { fandomId, canonicalEn: en, canonicalTh: th, category },
    update: { canonicalTh: th, category },
  });

  await recordAuditLog({
    userId: session.id,
    action: 'GLOSSARY_UPDATE',
    entity: 'FANDOM',
    entityId: fandomId,
    details: `ตั้งค่าคำศัพท์ "${en}" -> "${th}" สำหรับ fandom "${fandom.name}"`,
    request,
  });
  return NextResponse.json({ success: true, glossary: withAliases(glossary) });
}

async function handleDELETE(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const glossaryId = new URL(request.url).searchParams.get('glossaryId');
  const existing = glossaryId ? await prisma.fandomGlossary.findFirst({ where: { id: glossaryId, fandomId } }) : null;
  if (!existing) return NextResponse.json({ success: false, error: 'ไม่พบคำศัพท์นี้ในระบบ' }, { status: 404 });

  await prisma.fandomGlossary.delete({ where: { id: existing.id } });
  await recordAuditLog({
    userId: session.id,
    action: 'GLOSSARY_DELETE',
    entity: 'FANDOM',
    entityId: fandomId,
    details: `ลบคำศัพท์ "${existing.canonicalEn}" (${existing.canonicalTh})`,
    request,
  });
  return NextResponse.json({ success: true, message: 'ลบคำศัพท์เรียบร้อยแล้ว' });
}

async function handlePUT(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const body = await request.json().catch(() => ({}));
  const glossaryId = body.id || body.glossaryId;
  const en = (body.canonicalEn || body.termEn || '').trim();
  const th = (body.canonicalTh || body.termTh || '').trim();
  const category = body.category?.trim() || 'name';

  if (!glossaryId) return NextResponse.json({ success: false, error: 'กรุณาระบุ id' }, { status: 400 });
  if (!en || !th) return NextResponse.json({ success: false, error: 'กรุณาระบุทั้งคำภาษาอังกฤษและคำแปลภาษาไทย' }, { status: 400 });

  const existing = await prisma.fandomGlossary.findFirst({ where: { id: glossaryId, fandomId } });
  if (!existing) return NextResponse.json({ success: false, error: 'ไม่พบคำศัพท์นี้ในระบบ' }, { status: 404 });

  const updated = await prisma.fandomGlossary.update({
    where: { id: glossaryId },
    data: { canonicalEn: en, canonicalTh: th, category },
  });

  return NextResponse.json({ success: true, glossary: withAliases(updated) });
}

export const GET = withJsonErrors(handleGET);
export const POST = withJsonErrors(handlePOST);
export const PUT = withJsonErrors(handlePUT);
export const DELETE = withJsonErrors(handleDELETE);
