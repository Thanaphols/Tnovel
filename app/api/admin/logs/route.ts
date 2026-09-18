import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const category = searchParams.get('category')?.trim() || 'ALL'; // ALL, AUTH, NOVEL, CHAPTER, USER, WHITELIST, REPORT, BIN
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    // Build Prisma query condition
    const where: any = {};

    if (category !== 'ALL') {
      if (category === 'AUTH') {
        where.action = { startsWith: 'AUTH_' };
      } else if (category === 'USER') {
        where.action = { in: ['USER_ROLE_CHANGE', 'USER_DELETE'] };
      } else if (category === 'NOVEL') {
        where.action = { startsWith: 'NOVEL_' };
      } else if (category === 'CHAPTER') {
        where.action = { startsWith: 'CHAPTER_' };
      } else if (category === 'WHITELIST') {
        where.action = { startsWith: 'WHITELIST_' };
      } else if (category === 'REPORT') {
        where.action = { startsWith: 'REPORT_' };
      } else if (category === 'BIN') {
        where.action = { startsWith: 'BIN_' };
      } else {
        where.action = category;
      }
    }

    if (search) {
      where.OR = [
        { details: { contains: search } },
        { action: { contains: search } },
        { ipAddress: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, logs, todayCount] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      prisma.auditLog.count({
        where: {
          createdAt: { gte: todayStart },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        totalLogs: total,
        todayLogs: todayCount,
      },
    });
  } catch (err: any) {
    console.error('Fetch audit logs error:', err);
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการโหลดบันทึกกิจกรรม' },
      { status: 500 }
    );
  }
}
