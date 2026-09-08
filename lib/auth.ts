import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is missing in production.');
  }
  return new TextEncoder().encode(secret || 'noveltrans-dev-fallback-secret-key-32-chars-min');
}

export interface UserSessionPayload {
  id: string;
  email: string;
  name?: string | null;
  role: 'USER' | 'ADMIN';
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function signToken(payload: UserSessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecret());
    return verified.payload as unknown as UserSessionPayload;
  } catch (err) {
    return null;
  }
}

export async function getSession(): Promise<UserSessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('noveltrans_token')?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export function getBaseUrl(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');

  // Cloudflare Tunnel or reverse proxy passes x-forwarded-proto and x-forwarded-host
  if (forwardedHost || (forwardedProto && host)) {
    const proto = forwardedProto || 'https';
    return `${proto}://${host}`;
  }

  // If user configured APP_URL with a custom domain
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  if (host) {
    const proto = request.url.startsWith('https') ? 'https' : (forwardedProto || 'http');
    return `${proto}://${host}`;
  }

  return (process.env.APP_URL || 'http://localhost:9000').replace(/\/+$/, '');
}

