import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { getAISettings, setAISetting, AISettingKey, isAIProvider } from '@/lib/aiSettings';

const ALLOWED_KEYS: AISettingKey[] = ['ai.provider', 'ai.ollamaModel', 'ai.geminiModel', 'ai.openrouterModel'];

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }
  const settings = await getAISettings();
  return NextResponse.json({ success: true, settings });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const key = body?.key as AISettingKey;
  const value = typeof body?.value === 'string' ? body.value.trim() : '';

  if (!ALLOWED_KEYS.includes(key) || !value) {
    return NextResponse.json({ success: false, error: 'key หรือ value ไม่ถูกต้อง' }, { status: 400 });
  }
  if (key === 'ai.provider' && !isAIProvider(value)) {
    return NextResponse.json({ success: false, error: 'provider ต้องเป็น ollama, gemini หรือ openrouter' }, { status: 400 });
  }

  await setAISetting(key, value);
  await recordAuditLog({
    action: 'AI_SETTING_UPDATE',
    entity: 'AppSetting',
    entityId: key,
    details: `${key} = ${value}`,
    userId: session.id,
  });

  const settings = await getAISettings();
  return NextResponse.json({ success: true, settings });
}
