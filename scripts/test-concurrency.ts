import assert from 'node:assert';

// Force a known cap before importing the governor (env is read per-call, but set early to be safe).
process.env.OLLAMA_MAX_CONCURRENCY = '2';
process.env.GEMINI_MAX_CONCURRENCY = '3';

import { withAiSlot, maxConcurrency } from '../lib/aiConcurrency';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runPool(provider: string, tasks: number, cap: number) {
  let current = 0;
  let peak = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: tasks }, () =>
      withAiSlot(provider, async () => {
        current++;
        peak = Math.max(peak, current);
        await sleep(30);
        current--;
        done++;
      })
    )
  );

  assert.strictEqual(done, tasks, `${provider}: all tasks completed`);
  assert.ok(peak <= cap, `${provider}: peak ${peak} must not exceed cap ${cap}`);
  assert.ok(peak > 1, `${provider}: should actually run in parallel up to cap (peak ${peak})`);
  console.log(`  ${provider}: ${tasks} tasks, cap ${cap}, observed peak ${peak} ✓`);
}

async function main() {
  assert.strictEqual(maxConcurrency('ollama'), 2);
  assert.strictEqual(maxConcurrency('gemini'), 3);
  assert.strictEqual(maxConcurrency('openrouter'), 1); // free-tier default, own pool

  // Simulates 2 admins each firing several polish calls at once.
  await runPool('ollama', 8, 2);
  await runPool('gemini', 8, 3);

  console.log('✅ test-concurrency: governor bounds manual+background LLM calls per provider');
}

main().catch((e) => {
  console.error('❌ test-concurrency failed:', e);
  process.exit(1);
});
