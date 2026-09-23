import { NextResponse } from 'next/server';

/**
 * An uncaught throw in a route handler becomes a 500 with an empty body, which the client sees
 * only as "Unexpected end of JSON input". Wrap handlers so the real reason comes back as JSON.
 */
export function withJsonErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err: any) {
      console.error('[api]', err);
      return NextResponse.json({ success: false, error: err?.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
    }
  };
}
