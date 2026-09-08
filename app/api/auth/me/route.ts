import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, user: null }, { status: 200 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, avatar: true, role: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ success: false, user: null }, { status: 200 });
  }

  return NextResponse.json({ success: true, user });
}
