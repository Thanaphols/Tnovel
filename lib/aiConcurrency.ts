// Provider-aware concurrency governor for LLM polish calls.
//
// The old design capped only the BACKGROUND queue at 2 (GPU VRAM slots) and left the manual
// /retranslate path uncapped — so 2 admins clicking translate ran unbounded. And "2" is a GPU
// number, meaningless for a cloud API whose real limit is RPM/quota. This gate wraps EVERY
// polish call (manual + background) at the single choke point (polishParagraphs), sized per
// provider: ollama = physical GPU slots, gemini = a headroom-under-RPM number.
//
// ponytail: in-process semaphore. With the single custom server (server.js) this is globally
// correct. Under a PM2 cluster it is per-worker (effective = N × cap); move to a DB/Redis token
// bucket only if you actually run multiple workers.

type ProviderKey = 'ollama' | 'gemini' | 'openrouter';

const active: Record<ProviderKey, number> = { ollama: 0, gemini: 0, openrouter: 0 };
const waiters: Record<ProviderKey, Array<() => void>> = { ollama: [], gemini: [], openrouter: [] };

function keyOf(provider: string): ProviderKey {
  return provider === 'gemini' || provider === 'openrouter' ? provider : 'ollama';
}

export function maxConcurrency(provider: string): number {
  // Free OpenRouter models allow ~20 req/min, so default to one chapter at a time.
  if (keyOf(provider) === 'openrouter') return Math.max(1, Number(process.env.OPENROUTER_MAX_CONCURRENCY) || 1);
  if (keyOf(provider) === 'gemini') return Math.max(1, Number(process.env.GEMINI_MAX_CONCURRENCY) || 4);
  return Math.max(1, Number(process.env.OLLAMA_MAX_CONCURRENCY) || 2); // GPU VRAM slots
}

// Reader-triggered translations (someone waiting on the page) jump ahead of background batches:
// any free slot is taken at once, otherwise the next slot released goes to them first.
const priorityWaiters: Record<ProviderKey, Array<() => void>> = { ollama: [], gemini: [], openrouter: [] };

function acquire(key: ProviderKey, max: number, priority: boolean): Promise<void> {
  if (active[key] < max) {
    active[key]++;
    return Promise.resolve();
  }
  // Slot is handed over on release; do not increment here.
  return new Promise<void>((resolve) => (priority ? priorityWaiters : waiters)[key].push(resolve));
}

function release(key: ProviderKey): void {
  const next = priorityWaiters[key].shift() ?? waiters[key].shift();
  if (next) next(); // transfer the slot to a waiter; active count unchanged
  else active[key]--;
}

/**
 * Run fn while holding one provider slot; queues if the provider is at capacity.
 * Hold it for ONE LLM call, not a whole chapter, so a priority caller waits at most one call.
 */
export async function withAiSlot<T>(provider: string, fn: () => Promise<T>, priority = false): Promise<T> {
  const key = keyOf(provider);
  await acquire(key, maxConcurrency(provider), priority);
  try {
    return await fn();
  } finally {
    release(key);
  }
}

/** Snapshot for observability (admin status card). */
export function aiConcurrencySnapshot() {
  return {
    ollama: { active: active.ollama, max: maxConcurrency('ollama'), waiting: waiters.ollama.length + priorityWaiters.ollama.length },
    gemini: { active: active.gemini, max: maxConcurrency('gemini'), waiting: waiters.gemini.length + priorityWaiters.gemini.length },
    openrouter: { active: active.openrouter, max: maxConcurrency('openrouter'), waiting: waiters.openrouter.length + priorityWaiters.openrouter.length },
  };
}
