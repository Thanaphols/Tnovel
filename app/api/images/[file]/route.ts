import fs from 'fs/promises';
import path from 'path';
import { IMAGE_FILE_RE, imageDir } from '@/lib/imageStore';

// Serves images written by lib/imageStore. Names are content hashes, so the bytes behind a URL
// never change and can be cached forever. (The middleware matcher skips *.webp, so no auth.)
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!IMAGE_FILE_RE.test(file)) return new Response('Not found', { status: 404 });

  try {
    const body = await fs.readFile(path.join(imageDir(), file));
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
