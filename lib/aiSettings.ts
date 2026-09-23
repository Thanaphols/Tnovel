import { prisma } from './prisma';

// Resolves which AI provider/model to use. Precedence: explicit per-call override > admin
// global setting (AppSetting) > env default. Lets the machine without a GPU run Gemini-only
// without touching env, while a per-action dropdown can still pick the other provider.

export type AIProvider = 'ollama' | 'gemini' | 'openrouter';

export function isAIProvider(v: unknown): v is AIProvider {
  return v === 'ollama' || v === 'gemini' || v === 'openrouter';
}

export interface ResolvedAI {
  provider: AIProvider;
  ollamaModel: string;
  geminiModel: string;
  openrouterModel: string;
}

const KEYS = ['ai.provider', 'ai.ollamaModel', 'ai.geminiModel', 'ai.openrouterModel'] as const;
export type AISettingKey = (typeof KEYS)[number];

function envDefaults(): ResolvedAI {
  const provider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
  return {
    provider: isAIProvider(provider) ? provider : 'ollama',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    openrouterModel: process.env.OPENROUTER_MODEL || 'qwen/qwen3.8-27b:free',
  };
}

// ponytail: 30s in-process memo, admin change shows within 30s. setAISetting() clears it for
// the process that wrote it; other PM2 workers pick it up after TTL. Drop TTL if instant global.
let cache: { data: ResolvedAI; at: number } | null = null;
const TTL_MS = 30_000;

export async function getAISettings(): Promise<ResolvedAI> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = envDefaults();
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: [...KEYS] } } });
    for (const r of rows) {
      if (r.key === 'ai.provider' && isAIProvider(r.value)) data.provider = r.value;
      else if (r.key === 'ai.ollamaModel' && r.value) data.ollamaModel = r.value;
      else if (r.key === 'ai.geminiModel' && r.value) data.geminiModel = r.value;
      else if (r.key === 'ai.openrouterModel' && r.value) data.openrouterModel = r.value;
    }
  } catch {
    // AppSetting table may not exist yet (pre db:push) — fall back to env defaults.
  }
  cache = { data, at: Date.now() };
  return data;
}

export async function setAISetting(key: AISettingKey, value: string): Promise<void> {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache = null;
}

// Effective provider+model for one LLM call, applying override on top of the global setting.
export async function resolveProvider(override?: {
  provider?: string;
  model?: string;
}): Promise<{ provider: AIProvider; model: string }> {
  const s = await getAISettings();
  const provider: AIProvider = isAIProvider(override?.provider) ? override.provider : s.provider;
  const model =
    override?.model ||
    (provider === 'gemini' ? s.geminiModel : provider === 'openrouter' ? s.openrouterModel : s.ollamaModel);
  return { provider, model };
}
