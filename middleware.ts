import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  return new TextEncoder().encode(secret || 'noveltrans-dev-fallback-secret-key-32-chars-min');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('noveltrans_token')?.value;

  // 1. Verify JWT token
  let session: any = null;
  if (token) {
    try {
      const verified = await jwtVerify(token, getJwtSecret());
      session = verified.payload;
    } catch {
      session = null;
    }
  }

  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isPublicApi =
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/register' ||
    pathname === '/api/auth/logout' ||
    pathname.startsWith('/api/auth/google');

  // 2. If already logged in and visiting /login or /register -> redirect to home
  if (isAuthPage) {
    if (session) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 3. Allow public auth APIs
  if (isPublicApi) {
    return NextResponse.next();
  }

  // 4. If NOT logged in -> redirect to /login (or return 401 for APIs)
  if (!session) {
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.json(
        { success: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' },
        { status: 401 }
      );
      if (token) response.cookies.delete('noveltrans_token');
      return response;
    }

    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
    }
    const response = NextResponse.redirect(loginUrl);
    if (token) response.cookies.delete('noveltrans_token');
    return response;
  }

  // 5. Admin route protection (ADMIN role required)
  if (pathname.startsWith('/admin') || pathname === '/bin') {
    if (session.role !== 'ADMIN') {
      const homeUrl = new URL('/', request.url);
      homeUrl.searchParams.set('unauthorized', 'admin');
      return NextResponse.redirect(homeUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest)
     * - sw.js (service worker)
     * - socket.io (WebSocket connections)
     * - static image & font files
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|socket.io|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
  unstable_allowDynamic: [
    '**/node_modules/jose/**',
    '**/node_modules/@edge-runtime/**',
  ],
};
