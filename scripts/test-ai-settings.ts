import assert from 'node:assert';
import { prisma } from '../lib/prisma';
import { resolveProvider, setAISetting, getAISettings } from '../lib/aiSettings';

// Verifies provider resolution precedence: explicit override > global AppSetting > env default.
async function main() {
  await setAISetting('ai.provider', 'gemini');
  await setAISetting('ai.geminiModel', 'gemini-2.0-flash');
  await setAISetting('ai.ollamaModel', 'qwen2.5:7b');

  // 1. No override -> global setting
  const g = await resolveProvider();
  assert.strictEqual(g.provider, 'gemini', 'global provider should be gemini');
  assert.strictEqual(g.model, 'gemini-2.0-flash', 'global gemini model');

  // 2. Override provider -> uses that provider's global model
  const o = await resolveProvider({ provider: 'ollama' });
  assert.strictEqual(o.provider, 'ollama', 'override provider wins');
  assert.strictEqual(o.model, 'qwen2.5:7b', 'override falls back to ollama global model');

  // 3. Override model wins over global model
  const m = await resolveProvider({ provider: 'ollama', model: 'qwen3:8b' });
  assert.strictEqual(m.model, 'qwen3:8b', 'explicit model wins');

  // 4. Invalid override ignored -> global
  const bad = await resolveProvider({ provider: 'garbage' as any });
  assert.strictEqual(bad.provider, 'gemini', 'invalid override ignored');

  // 5. Switching global setting takes effect (cache invalidated by setAISetting)
  await setAISetting('ai.provider', 'ollama');
  const s = await getAISettings();
  assert.strictEqual(s.provider, 'ollama', 'global switch applied');

  // restore
  await setAISetting('ai.provider', 'gemini');

  console.log('✅ test-ai-settings: all provider-resolution assertions passed');
}

main()
  .catch((e) => {
    console.error('❌ test-ai-settings failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
