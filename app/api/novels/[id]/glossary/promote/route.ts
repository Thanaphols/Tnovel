import { NextResponse } from 'next/server';
import { withJsonErrors } from '@/lib/jsonErrors';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { promoteNovelTerms } from '@/lib/glossaryService';

// Moves verified novel terms into the novel's fandom so every fic of that fandom shares them.
// A move, not a copy: the novel copy is deleted so the two can never drift apart.
async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id: novelId } = await params;
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, deletedAt: null },
    select: { id: true, titleTh: true, titleEn: true, fandom: { select: { id: true, name: true } } },
  });
  if (!novel) return NextResponse.json({ success: false, error: 'ไม่พบนิยายเรื่องนี้' }, { status: 404 });
  if (!novel.fandom) {
    return NextResponse.json({ success: false, error: 'นิยายเรื่องนี้ยังไม่ได้เลือก fandom' }, { status: 400 });
  }
  const fandom = novel.fandom;

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body?.glossaryIds;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ success: false, error: 'กรุณาเลือกคำที่จะย้าย' }, { status: 400 });
  }

  const terms = await promoteNovelTerms(novelId, fandom.id, ids as string[]);
  if (terms.length === 0) return NextResponse.json({ success: false, error: 'ไม่พบคำที่เลือก' }, { status: 404 });

  await recordAuditLog({
    userId: session.id,
    action: 'GLOSSARY_PROMOTE',
    entity: 'NOVEL',
    entityId: novelId,
    details: `ย้าย ${terms.length} คำจาก "${novel.titleTh || novel.titleEn}" ไป fandom "${fandom.name}": ${terms
      .map((t) => t.canonicalEn)
      .join(', ')}`,
    request,
  });

  return NextResponse.json({ success: true, count: terms.length, fandomName: fandom.name });
}

export const POST = withJsonErrors(handlePOST);
