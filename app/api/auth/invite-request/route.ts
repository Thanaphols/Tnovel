import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordAuditLog } from '@/lib/auditLog';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = body?.email;
    const name = body?.name ? String(body.name).trim() : null;
    const avatar = body?.avatar ? String(body.avatar).trim() : null;
    const note = body?.note ? String(body.note).trim() : null;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ success: false, error: 'กรุณาระบุอีเมลที่ถูกต้อง' }, { status: 400 });
    }

    const email = rawEmail.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });
    }

    // Check if already in Whitelist
    const whitelisted = await prisma.whitelistedEmail.findUnique({
      where: { email },
    });
    if (whitelisted) {
      return NextResponse.json({
        success: true,
        alreadyWhitelisted: true,
        message: 'อีเมลนี้ได้รับสิทธิ์เข้าใช้งานอยู่แล้ว สามารถเข้าสู่ระบบได้ทันที',
      });
    }

    // Check existing request
    const existing = await prisma.inviteRequest.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.status === 'PENDING') {
        const updated = await prisma.inviteRequest.update({
          where: { id: existing.id },
          data: {
            name: name || existing.name,
            avatar: avatar || existing.avatar,
            note: note !== null ? note : existing.note,
          },
        });
        return NextResponse.json({
          success: true,
          alreadyPending: true,
          message: 'คำขอของคุณอยู่ในระหว่างรอการอนุมัติจากผู้ดูแลระบบแล้ว',
          item: updated,
        });
      }

      // If previously REJECTED or APPROVED, reset to PENDING with updated info
      const updated = await prisma.inviteRequest.update({
        where: { id: existing.id },
        data: {
          name: name || existing.name,
          avatar: avatar || existing.avatar,
          note: note !== null ? note : existing.note,
          status: 'PENDING',
        },
      });

      const io = (global as any).io;
      if (io) {
        io.emit('admin:invite_request', {
          action: 'resubmitted',
          email,
          name,
        });
      }

      await recordAuditLog({
        action: 'INVITE_REQUEST',
        entity: 'USER',
        details: `ผู้ใช้ ${email} ส่งคำขอสิทธิ์เข้าใช้งานใหม่${note ? ` (หมายเหตุ: ${note})` : ''}`,
        request,
      });

      return NextResponse.json({
        success: true,
        message: 'ส่งคำขอเข้าใช้งานเรียบร้อยแล้ว กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติ',
        item: updated,
      });
    }

    // Create new invite request
    const created = await prisma.inviteRequest.create({
      data: {
        email,
        name,
        avatar,
        note,
        status: 'PENDING',
      },
    });

    const io = (global as any).io;
    if (io) {
      io.emit('admin:invite_request', {
        action: 'new',
        email,
        name,
      });
    }

    await recordAuditLog({
      action: 'INVITE_REQUEST',
      entity: 'USER',
      details: `ผู้ใช้ ${email} ส่งคำขอสิทธิ์เข้าใช้งาน${note ? ` (หมายเหตุ: ${note})` : ''}`,
      request,
    });

    return NextResponse.json({
      success: true,
      message: 'ส่งคำขอเข้าใช้งานเรียบร้อยแล้ว กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติ',
      item: created,
    });
  } catch (err: any) {
    console.error('Invite request error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการส่งคำขอ' },
      { status: 500 }
    );
  }
}
