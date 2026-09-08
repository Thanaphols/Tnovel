import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

const PRIMARY_ADMIN_EMAIL = 'cupteo254504@gmail.com';

// 1. GET: ดึงรายการ Whitelist ทั้งหมด
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const whitelist = await prisma.whitelistedEmail.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // ดึงผู้ใช้งานทั้งหมดเพื่อตรวจสอบสถานะว่าเคยเข้าสู่ระบบหรือยัง
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, email: true, name: true, avatar: true, role: true, createdAt: true },
    });

    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    const items = whitelist.map((w) => {
      const user = userMap.get(w.email.toLowerCase());
      return {
        id: w.id,
        email: w.email,
        note: w.note,
        createdAt: w.createdAt,
        isPrimaryAdmin: w.email.toLowerCase() === PRIMARY_ADMIN_EMAIL,
        user: user || null,
      };
    });

    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error('Whitelist GET error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงรายการ Whitelist' }, { status: 500 });
  }
}

// 2. POST: เพิ่มอีเมลเข้าสู่ Whitelist
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const body = await request.json();
    const rawEmail = body.email;
    const note = body.note ? String(body.note).trim() : null;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ success: false, error: 'กรุณาระบุอีเมลที่ถูกต้อง' }, { status: 400 });
    }

    const email = rawEmail.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });
    }

    const existing = await prisma.whitelistedEmail.findUnique({
      where: { email },
    });

    if (existing) {
      if (note && note !== existing.note) {
        const updated = await prisma.whitelistedEmail.update({
          where: { id: existing.id },
          data: { note },
        });
        return NextResponse.json({
          success: true,
          item: updated,
          message: 'อัปเดตหมายเหตุของอีเมลที่มีอยู่แล้ว',
        });
      }
      return NextResponse.json({ success: false, error: 'อีเมลนี้อยู่ในรายชื่อที่อนุญาต (Whitelist) อยู่แล้ว' }, { status: 400 });
    }

    const created = await prisma.whitelistedEmail.create({
      data: {
        email,
        note,
      },
    });

    return NextResponse.json({ success: true, item: created });
  } catch (err: any) {
    console.error('Whitelist POST error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการเพิ่มอีเมลเข้า Whitelist' }, { status: 500 });
  }
}

// 3. DELETE: ลบอีเมลออกจาก Whitelist
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'กรุณาระบุ ID ของรายการที่ต้องการลบ' }, { status: 400 });
    }

    const target = await prisma.whitelistedEmail.findUnique({
      where: { id },
    });

    if (!target) {
      return NextResponse.json({ success: false, error: 'ไม่พบรายการที่ต้องการลบ' }, { status: 404 });
    }

    // ป้องกันการลบ Superadmin
    if (target.email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
      return NextResponse.json(
        { success: false, error: `ไม่อนุญาตให้ลบอีเมลผู้ดูแลระบบหลัก (${PRIMARY_ADMIN_EMAIL}) ออกจาก Whitelist` },
        { status: 400 }
      );
    }

    await prisma.whitelistedEmail.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'ลบอีเมลออกจาก Whitelist เรียบร้อยแล้ว' });
  } catch (err: any) {
    console.error('Whitelist DELETE error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการลบอีเมล' }, { status: 500 });
  }
}
