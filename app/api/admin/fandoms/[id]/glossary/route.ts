import { NextResponse } from 'next/server';
import { withJsonErrors } from '@/lib/jsonErrors';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { isStoredImageUrl, storeImageFromUrl } from '@/lib/imageStore';

// Fandom terms are grouped into cards: a top-level term plus its variants (parentId). Variants are
// ordinary terms with their own Thai, so the translate pipeline treats every row the same.

type Params = { params: Promise<{ id: string }> };

const forbidden = () =>
  NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

const withAliases = <T extends { canonicalEn: string; canonicalTh: string }>(g: T) => ({
  ...g,
  termEn: g.canonicalEn,
  termTh: g.canonicalTh,
});

/**
 * '' / null clears the image; undefined leaves it as is; an http(s) URL is downloaded, compressed
 * and stored locally (lib/imageStore), so the card never depends on the remote host again.
 */
async function resolveImage(
  raw: unknown
): Promise<{ ok: true; value: string | null | undefined } | { ok: false; error: string }> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string' || raw.length > 2000) return { ok: false, error: 'ลิงก์รูปไม่ถูกต้อง' };
  const value = raw.trim();
  if (isStoredImageUrl(value)) return { ok: true, value };
  if (!/^https?:\/\//i.test(value)) return { ok: false, error: 'ลิงก์รูปต้องเป็น http(s) URL' };
  try {
    return { ok: true, value: await storeImageFromUrl(value, 'avatar') };
  } catch (err: any) {
    console.warn('[fandom glossary] image store failed:', err.message || err);
    return { ok: false, error: 'ดึงรูปจากลิงก์นี้ไม่ได้ (เว็บอาจบล็อกหรือไม่ใช่ไฟล์รูป) ลองลิงก์อื่น' };
  }
}

/** A parent must be a top-level card of the same fandom. Returns an error message or null. */
async function checkParent(fandomId: string, parentId: string, childId?: string): Promise<string | null> {
  if (parentId === childId) return 'ไม่สามารถเป็นคำย่อยของตัวเองได้';
  const parent = await prisma.fandomGlossary.findFirst({ where: { id: parentId, fandomId } });
  if (!parent) return 'ไม่พบการ์ดหลัก';
  if (parent.parentId) return 'คำย่อยซ้อนกันได้ชั้นเดียว';
  if (childId && (await prisma.fandomGlossary.count({ where: { parentId: childId } })) > 0) {
    return 'คำนี้มีคำย่อยอยู่แล้ว ย้ายไปเป็นคำย่อยไม่ได้';
  }
  return null;
}

async function handleGET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const items = await prisma.fandomGlossary.findMany({ where: { fandomId }, orderBy: { canonicalEn: 'asc' } });
  return NextResponse.json({ success: true, glossaries: items.map(withAliases) });
}

// Upsert by English term. With parentId, an existing term with that English is moved under the
// card — that is how a flat term becomes a variant.
async function handlePOST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const fandom = await prisma.fandom.findUnique({ where: { id: fandomId } });
  if (!fandom) return bad('ไม่พบ fandom นี้', 404);

  const body = await request.json().catch(() => ({}));
  const en = (body.canonicalEn || body.termEn || '').trim();
  const th = (body.canonicalTh || body.termTh || '').trim();
  const category = body.category?.trim() || 'name';
  const parentId: string | null = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
  if (!en || !th) return bad('กรุณาระบุคำต้นฉบับและคำแปลภาษาไทย');

  const existing = await prisma.fandomGlossary.findUnique({
    where: { fandomId_canonicalEn: { fandomId, canonicalEn: en } },
  });
  if (parentId) {
    const err = await checkParent(fandomId, parentId, existing?.id);
    if (err) return bad(err);
  }
  // Only cards carry an image, so a variant never triggers a download.
  const image = parentId ? { ok: true as const, value: undefined } : await resolveImage(body.imageUrl);
  if (!image.ok) return bad(image.error);

  const glossary = existing
    ? await prisma.fandomGlossary.update({
        where: { id: existing.id },
        data: {
          canonicalTh: th,
          category,
          ...(parentId ? { parentId, imageUrl: null } : image.value !== undefined ? { imageUrl: image.value } : {}),
        },
      })
    : await prisma.fandomGlossary.create({
        data: { fandomId, canonicalEn: en, canonicalTh: th, category, parentId, imageUrl: parentId ? null : image.value ?? null },
      });

  await recordAuditLog({
    userId: session.id,
    action: 'GLOSSARY_UPDATE',
    entity: 'FANDOM',
    entityId: fandomId,
    details: `ตั้งค่าคำศัพท์ "${en}" -> "${th}"${parentId ? ' (คำย่อย)' : ''} สำหรับ fandom "${fandom.name}"`,
    request,
  });
  return NextResponse.json({ success: true, glossary: withAliases(glossary) });
}

// Deleting a card also deletes its variants (onDelete: Cascade).
async function handleDELETE(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const glossaryId = new URL(request.url).searchParams.get('glossaryId');
  const existing = glossaryId ? await prisma.fandomGlossary.findFirst({ where: { id: glossaryId, fandomId } }) : null;
  if (!existing) return bad('ไม่พบคำศัพท์นี้ในระบบ', 404);

  const variants = await prisma.fandomGlossary.count({ where: { parentId: existing.id } });
  await prisma.fandomGlossary.delete({ where: { id: existing.id } });
  await recordAuditLog({
    userId: session.id,
    action: 'GLOSSARY_DELETE',
    entity: 'FANDOM',
    entityId: fandomId,
    details: `ลบคำศัพท์ "${existing.canonicalEn}" (${existing.canonicalTh})${variants ? ` พร้อมคำย่อย ${variants} คำ` : ''}`,
    request,
  });
  return NextResponse.json({ success: true, message: 'ลบคำศัพท์เรียบร้อยแล้ว' });
}

// Edit a term. parentId: null detaches a variant into its own card; a string moves it under a card.
async function handlePUT(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return forbidden();

  const { id: fandomId } = await params;
  const body = await request.json().catch(() => ({}));
  const glossaryId = body.id || body.glossaryId;
  const en = (body.canonicalEn || body.termEn || '').trim();
  const th = (body.canonicalTh || body.termTh || '').trim();
  const category = body.category?.trim() || 'name';
  if (!glossaryId) return bad('กรุณาระบุ id');
  if (!en || !th) return bad('กรุณาระบุทั้งคำต้นฉบับและคำแปลภาษาไทย');

  const existing = await prisma.fandomGlossary.findFirst({ where: { id: glossaryId, fandomId } });
  if (!existing) return bad('ไม่พบคำศัพท์นี้ในระบบ', 404);

  if (en !== existing.canonicalEn) {
    const clash = await prisma.fandomGlossary.findUnique({
      where: { fandomId_canonicalEn: { fandomId, canonicalEn: en } },
    });
    if (clash) return bad(`มีคำ "${en}" อยู่แล้วใน fandom นี้`, 409);
  }

  let parentId: string | null | undefined = undefined;
  if (body.parentId === null) parentId = null;
  else if (typeof body.parentId === 'string' && body.parentId && body.parentId !== existing.parentId) {
    const err = await checkParent(fandomId, body.parentId, existing.id);
    if (err) return bad(err);
    parentId = body.parentId;
  }

  const isVariant = parentId === undefined ? Boolean(existing.parentId) : Boolean(parentId);
  const image = isVariant ? { ok: true as const, value: undefined } : await resolveImage(body.imageUrl);
  if (!image.ok) return bad(image.error);
  const updated = await prisma.fandomGlossary.update({
    where: { id: glossaryId },
    data: {
      canonicalEn: en,
      canonicalTh: th,
      category,
      ...(parentId !== undefined ? { parentId } : {}),
      // Only cards carry an image.
      ...(isVariant ? { imageUrl: null } : image.value !== undefined ? { imageUrl: image.value } : {}),
    },
  });

  await recordAuditLog({
    userId: session.id,
    action: 'GLOSSARY_UPDATE',
    entity: 'FANDOM',
    entityId: fandomId,
    details: `แก้คำศัพท์ "${existing.canonicalEn}" -> "${en}" = "${th}"`,
    request,
  });
  return NextResponse.json({ success: true, glossary: withAliases(updated) });
}

export const GET = withJsonErrors(handleGET);
export const POST = withJsonErrors(handlePOST);
export const PUT = withJsonErrors(handlePUT);
export const DELETE = withJsonErrors(handleDELETE);
