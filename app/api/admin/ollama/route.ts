import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPriorityLeaseActive } from '@/lib/systemLock';
import { getLLMProvider } from '@/lib/llm/provider';

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
    }

    const provider = await getLLMProvider();
    const health = await provider.healthCheck();

    // Check if background or manual jobs are currently active
    const [manualActive, activeChapterJobs] = await Promise.all([
      isPriorityLeaseActive('MANUAL_POLISH_LOCK'),
      prisma.chapterJob.count({
        where: {
          jobType: 'POLISH',
          status: 'PROCESSING',
          lockedUntil: { gt: new Date() },
        },
      }),
    ]);

    const activeJobs = activeChapterJobs + (manualActive ? 1 : 0);

    return NextResponse.json({
      success: true,
      ...health,
      activeJobs,
      isDraining: false,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action; // 'connect' | 'disconnect'
    const force = Boolean(body?.force);

    const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

    if (action === 'connect') {
      // Warm up and pin model to VRAM
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: 'warmup',
          keep_alive: -1,
          stream: false,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        throw new Error(`Ollama Connect Failed (${res.status}): ${await res.text()}`);
      }

      return NextResponse.json({
        success: true,
        message: `เชื่อมต่อโมเดล ${model} เข้าสู่หน่วยความจำการ์ดจอ (VRAM) เรียบร้อยแล้ว`,
      });
    }

    if (action === 'disconnect') {
      // Disconnect Guard: Check for active processing jobs
      const [manualActive, activeChapterJobs] = await Promise.all([
        isPriorityLeaseActive('MANUAL_POLISH_LOCK'),
        prisma.chapterJob.count({
          where: {
            jobType: 'POLISH',
            status: 'PROCESSING',
            lockedUntil: { gt: new Date() },
          },
        }),
      ]);

      const activeJobs = activeChapterJobs + (manualActive ? 1 : 0);

      if (activeJobs > 0 && !force) {
        return NextResponse.json(
          {
            success: false,
            draining: true,
            activeJobs,
            message: `มีงานเกลาสำนวนกำลังทำงานอยู่ ${activeJobs} งาน กรุณารองานเสร็จสิ้น หรือยืนยันบังคับตัดการเชื่อมต่อ`,
          },
          { status: 409 }
        );
      }

      // Safe to unload: send keep_alive: 0 to evict from VRAM
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: '',
          keep_alive: 0,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      return NextResponse.json({
        success: true,
        message: `ตัดการเชื่อมต่อและคืนหน่วยความจำ VRAM ให้ระบบเรียบร้อยแล้ว`,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
