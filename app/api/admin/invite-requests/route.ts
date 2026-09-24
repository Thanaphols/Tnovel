import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

// 1. GET: ดึงรายการคำขอสิทธิ์เข้าใช้งานทั้งหมด
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'ALL', 'PENDING', 'APPROVED', 'REJECTED'

    const where: any = {};
    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter;
    }

    const requests = await prisma.inviteRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // ตรวจสอบว่าอีเมลไหนอยู่ใน Whitelist หรือ User แล้ว
    const whitelisted = await prisma.whitelistedEmail.findMany({
      select: { email: true, role: true },
    });
    const whitelistMap = new Map(whitelisted.map((w) => [w.email.toLowerCase(), w.role]));

    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { email: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u.role]));

    const items = requests.map((req) => ({
      ...req,
      isWhitelisted: whitelistMap.has(req.email.toLowerCase()),
      whitelistedRole: whitelistMap.get(req.email.toLowerCase()) || null,
      existingUserRole: userMap.get(req.email.toLowerCase()) || null,
    }));

    const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

    return NextResponse.json({ success: true, items, pendingCount });
  } catch (err: any) {
    console.error('Admin invite-requests GET error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการดึงรายการคำขอ' },
      { status: 500 }
    );
  }
}

// 2. POST: อนุมัติ (Approve) หรือ ปฏิเสธ (Reject) คำขอ
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, id, role = 'USER' } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'กรุณาระบุ ID ของคำขอ' }, { status: 400 });
    }

    const inviteReq = await prisma.inviteRequest.findUnique({
      where: { id },
    });

    if (!inviteReq) {
      return NextResponse.json({ success: false, error: 'ไม่พบรายการคำขอนี้' }, { status: 404 });
    }

    const email = inviteReq.email.toLowerCase().trim();

    if (action === 'approve') {
      const assignedRole = role === 'ADMIN' ? 'ADMIN' : 'USER';

      // 1. เพิ่ม/อัปเดตลงใน WhitelistedEmail
      await prisma.whitelistedEmail.upsert({
        where: { email },
        create: {
          email,
          role: assignedRole,
          note: inviteReq.note || `อนุมัติจากคำขอเข้าใช้งาน (${inviteReq.name || 'ไม่ระบุชื่อ'})`,
        },
        update: {
          role: assignedRole,
          note: inviteReq.note || `อนุมัติจากคำขอเข้าใช้งาน (${inviteReq.name || 'ไม่ระบุชื่อ'})`,
        },
      });

      // 2. หากมี User อยู่แล้ว ให้อัปเดตสิทธิ์ด้วย
      const existingUser = await prisma.user.findFirst({
        where: { email, deletedAt: null },
      });
      if (existingUser && existingUser.role !== assignedRole) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { role: assignedRole },
        });
      }

      // 3. ปรับสถานะคำขอเป็น APPROVED
      const updated = await prisma.inviteRequest.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      await recordAuditLog({
        userId: session.id,
        action: 'INVITE_APPROVE',
        entity: 'USER',
        entityId: id,
        details: `อนุมัติคำขอเข้าใช้งานของ ${email} เป็นสิทธิ์ ${assignedRole}`,
        request,
      });

      const io = (global as any).io;
      if (io) {
        io.emit('admin:invite_request', { action: 'approved', id, email });
      }

      return NextResponse.json({
        success: true,
        message: `อนุมัติคำขอของ ${email} เป็นสิทธิ์ ${assignedRole} เรียบร้อยแล้ว`,
        item: updated,
      });
    }

    if (action === 'reject') {
      const updated = await prisma.inviteRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
      });

      await recordAuditLog({
        userId: session.id,
        action: 'INVITE_REJECT',
        entity: 'USER',
        entityId: id,
        details: `ปฏิเสธคำขอเข้าใช้งานของ ${email}`,
        request,
      });

      const io = (global as any).io;
      if (io) {
        io.emit('admin:invite_request', { action: 'rejected', id, email });
      }

      return NextResponse.json({
        success: true,
        message: `ปฏิเสธคำขอของ ${email} เรียบร้อยแล้ว`,
        item: updated,
      });
    }

    return NextResponse.json({ success: false, error: 'คำสั่ง action ไม่ถูกต้อง' }, { status: 400 });
  } catch (err: any) {
    console.error('Admin invite-requests POST error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการประมวลผลคำขอ' },
      { status: 500 }
    );
  }
}

// 3. DELETE: ลบรายการคำขอ
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'กรุณาระบุ ID ของคำขอที่ต้องการลบ' }, { status: 400 });
    }

    const target = await prisma.inviteRequest.findUnique({
      where: { id },
    });

    if (!target) {
      return NextResponse.json({ success: false, error: 'ไม่พบรายการคำขอนี้' }, { status: 404 });
    }

    await prisma.inviteRequest.delete({
      where: { id },
    });

    await recordAuditLog({
      userId: session.id,
      action: 'INVITE_DELETE',
      entity: 'USER',
      entityId: id,
      details: `ลบคำขอเข้าใช้งานของ ${target.email}`,
      request,
    });

    return NextResponse.json({
      success: true,
      message: `ลบคำขอของ ${target.email} เรียบร้อยแล้ว`,
    });
  } catch (err: any) {
    console.error('Admin invite-requests DELETE error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'เกิดข้อผิดพลาดในการลบคำขอ' },
      { status: 500 }
    );
  }
}
