import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const novelId = params.id;
    const body = await request.json().catch(() => ({}));
    const session = await getSession();

    if (!session?.id) {
      // Guest user: handle toggle based on client state
      const isCurrentlyLiked = !!body.currentLiked;

      if (isCurrentlyLiked) {
        // Unlike for guest
        const updated = await prisma.novel.update({
          where: { id: novelId },
          data: { likeCount: { decrement: 1 } },
        });
        return NextResponse.json({
          success: true,
          liked: false,
          likeCount: Math.max(0, updated.likeCount),
        });
      } else {
        // Like for guest
        const updated = await prisma.novel.update({
          where: { id: novelId },
          data: { likeCount: { increment: 1 } },
        });
        return NextResponse.json({
          success: true,
          liked: true,
          likeCount: updated.likeCount,
        });
      }
    }

    const userId = session.id;

    // Check if user already liked this novel in DB
    const existingLike = await prisma.novelLike.findUnique({
      where: {
        userId_novelId: {
          userId,
          novelId,
        },
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.novelLike.delete({
        where: { id: existingLike.id },
      });
      const novel = await prisma.novel.update({
        where: { id: novelId },
        data: { likeCount: { decrement: 1 } },
      });
      return NextResponse.json({
        success: true,
        liked: false,
        likeCount: Math.max(0, novel.likeCount),
      });
    } else {
      // Like
      await prisma.novelLike.create({
        data: {
          userId,
          novelId,
        },
      });
      const novel = await prisma.novel.update({
        where: { id: novelId },
        data: { likeCount: { increment: 1 } },
      });
      return NextResponse.json({
        success: true,
        liked: true,
        likeCount: novel.likeCount,
      });
    }
  } catch (err: any) {
    console.error('Toggle like error:', err);
    return NextResponse.json(
      { success: false, error: 'ไม่สามารถเปลี่ยนสถานะไลก์ได้' },
      { status: 500 }
    );
  }
}
