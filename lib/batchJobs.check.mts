// Run: node --experimental-strip-types lib/batchJobs.check.mts
// Lane caps: 2 fast run at once, the 3rd queues; cloud runs 1; cancel leaves the queue.
import assert from 'node:assert';
import { createJob, finishJob, waitForTurn, isLaneFull } from './batchJobs.ts';

const mk = (lane: 'fast' | 'cloud', user: string) => createJob({ lane, initiatorUserId: user, novelId: user, payload: {} });

const a = mk('fast', 'a');
const b = mk('fast', 'b');
const c = mk('fast', 'c');
const positions: number[] = [];

assert.ok(await waitForTurn(a, () => {}));
assert.ok(await waitForTurn(b, () => {}));
assert.ok(isLaneFull('fast'));

const cTurn = waitForTurn(c, (p) => positions.push(p));
await new Promise((r) => setTimeout(r, 50));
assert.deepStrictEqual(positions, [1], 'third fast batch must queue at position 1');
assert.strictEqual(c.running, false);

finishJob(a);
assert.ok(await cTurn, 'queued batch runs once a slot frees');

// Cloud lane: one at a time; a cancelled waiter returns false and frees its place.
const x = mk('cloud', 'x');
const y = mk('cloud', 'y');
assert.ok(await waitForTurn(x, () => {}));
const yTurn = waitForTurn(y, () => {});
await new Promise((r) => setTimeout(r, 50));
assert.strictEqual(y.running, false, 'second cloud batch must wait');
y.isCancelled = true;
assert.strictEqual(await yTurn, false);

console.log('batchJobs ok');
