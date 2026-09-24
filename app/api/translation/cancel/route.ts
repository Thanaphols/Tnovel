import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    (global as any).activeTranslationJob = null;
    if (!(global as any).translationState) {
      (global as any).translationState = { isPaused: false, isCancelled: true };
    } else {
      (global as any).translationState.isCancelled = true;
      (global as any).translationState.isPaused = false;
    }

    const io = (global as any).io;
    if (io) {
      io.emit('translation:progress', {
        status: 'batch_cancelled',
        message: 'ยกเลิกการแปลแล้ว',
      });
      io.emit('translation:state', { isPaused: false, isCancelled: true });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
