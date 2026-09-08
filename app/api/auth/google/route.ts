import { NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/auth';

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = getBaseUrl(request);

  const { searchParams } = new URL(request.url);
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  if (!clientId || clientId.trim() === '') {
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set(
      'error',
      'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ในไฟล์ .env'
    );
    if (callbackUrl !== '/') loginUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Generate random CSRF state
  const state = crypto.randomUUID();
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  // Build Google OAuth 2.0 authorization URL
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('access_type', 'online');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(googleAuthUrl.toString());

  // Store temporary state, redirectUri, and callbackUrl in cookies (valid for 10 minutes)
  const isSecure = baseUrl.startsWith('https://');
  response.cookies.set({
    name: 'google_oauth_state',
    value: state,
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  response.cookies.set({
    name: 'google_oauth_redirect_uri',
    value: redirectUri,
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  response.cookies.set({
    name: 'google_oauth_callback_url',
    value: callbackUrl,
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
