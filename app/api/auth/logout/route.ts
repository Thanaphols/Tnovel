import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (session) {
      await recordAuditLog({
        userId: session.id,
        action: 'AUTH_LOGOUT',
        entity: 'AUTH',
        entityId: session.id,
        details: `ออกจากระบบ (${session.email})`,
        request,
      });
    }
  } catch {}

  const response = NextResponse.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  response.cookies.set({
    name: 'noveltrans_token',
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}

