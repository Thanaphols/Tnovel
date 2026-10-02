// Run: node --experimental-strip-types lib/aiConcurrency.check.mts
// Reader (priority) calls take a free slot at once and otherwise get the next freed slot
// ahead of background batch calls that queued earlier.
import assert from 'node:assert';
import { withAiSlot } from './aiConcurrency.ts';

const order: string[] = [];
const gate = () => {
  let open!: () => void;
  const p = new Promise<void>((r) => (open = r));
  return { p, open };
};

// Fill both ollama slots (A and B) with batch calls.
const a = gate();
const b = gate();
const runA = withAiSlot('ollama', () => a.p);
const runB = withAiSlot('ollama', () => b.p);

// Batch call queues first, reader call queues second.
const batch = withAiSlot('ollama', async () => void order.push('batch'));
const reader = withAiSlot('ollama', async () => void order.push('reader'), true);

a.open(); // slot A frees -> must go to the reader, then the batch
b.open();
await Promise.all([runA, runB, reader, batch]);
assert.deepStrictEqual(order, ['reader', 'batch'], 'reader must cut ahead of the earlier batch call');

console.log('aiConcurrency ok');
