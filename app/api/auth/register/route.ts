import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, signToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

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
          error: `อีเมลนี้ (${normalizedEmail}) ยังไม่ได้รับอนุญาตให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขอเพิ่มอีเมลเข้าสู่ระบบ (Whitelist)`,
        },
        { status: 403 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 400 });
    }

    // First registered user or primary admin becomes ADMIN
    const userCount = await prisma.user.count();
    const role = isPrimaryAdmin || userCount === 0 ? 'ADMIN' : 'USER';

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        password: hashedPassword,
        role,
      },
    });

    const token = await signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'USER' | 'ADMIN',
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
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    console.error('Register error:', err);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการลงทะเบียน' }, { status: 500 });
  }
}
