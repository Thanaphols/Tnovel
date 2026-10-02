// Run: npx jiti lib/novelUpdater.check.mts
// Schedule gate: off at 0h, runs at once when never run, then only after the interval elapses.
import assert from 'node:assert';
import { isSweepDue } from './novelUpdater';

const now = Date.parse('2026-10-02T12:00:00Z');
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

assert.strictEqual(isSweepDue(0, null, now), false, 'interval 0 = auto-check off');
assert.strictEqual(isSweepDue(6, null, now), true, 'never ran -> run now');
assert.strictEqual(isSweepDue(6, hoursAgo(5), now), false, '5h < 6h -> wait');
assert.strictEqual(isSweepDue(6, hoursAgo(6), now), true, 'exactly 6h -> run');
assert.strictEqual(isSweepDue(24, hoursAgo(30), now), true, 'overdue -> run');

console.log('novelUpdater ok');
process.exit(0); // prisma import keeps the event loop alive
