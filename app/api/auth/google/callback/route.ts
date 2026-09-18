import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getBaseUrl, signToken } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';

export async function GET(request: Request) {
  const baseUrl = getBaseUrl(request);
  const { searchParams } = new URL(request.url);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const cookieStore = cookies();
  const savedState = cookieStore.get('google_oauth_state')?.value;
  const savedRedirectUri = cookieStore.get('google_oauth_redirect_uri')?.value;
  const savedCallbackUrl = cookieStore.get('google_oauth_callback_url')?.value || '/';

  // If user cancelled or Google returned an error
  if (errorParam) {
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('error', 'การเข้าสู่ระบบด้วย Google ถูกยกเลิกหรือล้มเหลว');
    if (savedCallbackUrl !== '/') loginUrl.searchParams.set('callbackUrl', savedCallbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Validate state against CSRF attacks
  if (!code || !state || !savedState || state !== savedState) {
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('error', 'การยืนยันความปลอดภัยล้มเหลว (Invalid OAuth State) กรุณาลองใหม่อีกครั้ง');
    if (savedCallbackUrl !== '/') loginUrl.searchParams.set('callbackUrl', savedCallbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = savedRedirectUri || `${baseUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('error', 'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID หรือ GOOGLE_CLIENT_SECRET ในไฟล์ .env');
    return NextResponse.redirect(loginUrl);
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Google token exchange error:', errText);
      const loginUrl = new URL('/login', baseUrl);
      loginUrl.searchParams.set('error', 'ไม่สามารถแลกรับรหัสยืนยันจาก Google ได้ กรุณาตรวจสอบ Client ID และ Secret');
      return NextResponse.redirect(loginUrl);
    }

    const tokenData = await tokenResponse.json();

    // 2. Fetch user profile from Google UserInfo endpoint
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoResponse.ok) {
      console.error('Google userinfo fetch failed:', await userinfoResponse.text());
      const loginUrl = new URL('/login', baseUrl);
      loginUrl.searchParams.set('error', 'ไม่สามารถดึงข้อมูลบัญชี Google ได้');
      return NextResponse.redirect(loginUrl);
    }

    const profile = await userinfoResponse.json();
    if (!profile.email) {
      const loginUrl = new URL('/login', baseUrl);
      loginUrl.searchParams.set('error', 'ไม่พบข้อมูลอีเมลในบัญชี Google');
      return NextResponse.redirect(loginUrl);
    }

    const email = profile.email.toLowerCase().trim();
    const googleId = profile.sub;
    const name = profile.name || profile.given_name || 'Google User';
    const avatar = profile.picture || null;

    // Check Whitelist & Primary Admin
    const isPrimaryAdmin = email === 'cupteo254504@gmail.com';
    const whitelisted = await prisma.whitelistedEmail.findUnique({
      where: { email },
    });

    if (!isPrimaryAdmin && !whitelisted) {
      const loginUrl = new URL('/login', baseUrl);
      loginUrl.searchParams.set(
        'error',
        'คุณไม่มีสิทธ์ใช้งานระบบได้ กรุณาติดต่อผู้ดูแลระบบในการขอสิทธ์เข้าใช้งาน'
      );
      if (savedCallbackUrl !== '/') loginUrl.searchParams.set('callbackUrl', savedCallbackUrl);
      return NextResponse.redirect(loginUrl);
    }

    // 3. Find or create user in DB
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
      },
    });

    if (user && user.deletedAt) {
      const loginUrl = new URL('/login', baseUrl);
      loginUrl.searchParams.set('error', 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      return NextResponse.redirect(loginUrl);
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar,
          googleId,
          role: isPrimaryAdmin ? 'ADMIN' : 'USER',
        },
      });
    } else {
      // Link googleId or update avatar/name if missing
      const updateData: any = {};
      if (!user.googleId) updateData.googleId = googleId;
      if (!user.avatar && avatar) updateData.avatar = avatar;
      if (!user.name && name) updateData.name = name;
      if (isPrimaryAdmin && user.role !== 'ADMIN') updateData.role = 'ADMIN';

      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    }

    // 4. Issue session JWT
    const jwtToken = await signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'USER' | 'ADMIN',
    });

    await recordAuditLog({
      userId: user.id,
      action: 'AUTH_LOGIN_GOOGLE',
      entity: 'AUTH',
      entityId: user.id,
      details: `เข้าสู่ระบบด้วย Google (${user.email})`,
      request,
    });

    // 5. Redirect user to destination
    const destination = savedCallbackUrl && savedCallbackUrl.startsWith('/') ? savedCallbackUrl : '/';
    const response = NextResponse.redirect(new URL(destination, baseUrl));

    response.cookies.set({
      name: 'noveltrans_token',
      value: jwtToken,
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
      secure: baseUrl.startsWith('https://'),
    });

    // Clean up temporary OAuth cookies
    response.cookies.delete('google_oauth_state');
    response.cookies.delete('google_oauth_redirect_uri');
    response.cookies.delete('google_oauth_callback_url');

    return response;
  } catch (err: any) {
    console.error('Google OAuth callback unexpected error:', err);
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('error', err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google');
    return NextResponse.redirect(loginUrl);
  }
}
