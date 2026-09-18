import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, signToken } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check Whitelist & Primary Admin
    const isPrimaryAdmin = normalizedEmail === 'cupteo254504@gmail.com';
    const whitelisted = await prisma.whitelistedEmail.findUnique({
      where: { email: normalizedEmail },
    });

    if (!isPrimaryAdmin && !whitelisted) {
      return NextResponse.json(
        {
          success: false,
          error: 'คุณไม่มีสิทธ์ใช้งานระบบได้ กรุณาติดต่อผู้ดูแลระบบในการขอสิทธ์เข้าใช้งาน',
        },
        { status: 403 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.deletedAt || !user.password) {
      return NextResponse.json({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    const finalRole = isPrimaryAdmin ? 'ADMIN' : user.role;
    if (isPrimaryAdmin && user.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
    }

    const token = await signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: finalRole as 'USER' | 'ADMIN',
    });

    await recordAuditLog({
      userId: user.id,
      action: 'AUTH_LOGIN',
      entity: 'AUTH',
      entityId: user.id,
      details: `เข้าสู่ระบบสำเร็จ (${user.email})`,
      request,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });

    response.cookies.set({
      name: 'noveltrans_token',
      value: token,
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' }, { status: 500 });
  }
}
