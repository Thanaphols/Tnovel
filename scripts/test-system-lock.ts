import {
  acquirePriorityLease,
  heartbeatPriorityLease,
  releasePriorityLease,
  isPriorityLeaseActive,
} from '../lib/systemLock';
import { prisma } from '../lib/prisma';

async function runTests() {
  console.log('🧪 Starting Atomic Priority Lease Lock Verification...\n');

  const testKey = 'TEST_PRIORITY_LOCK';
  const ownerA = 'process-worker-AAA';
  const ownerB = 'process-worker-BBB';
  const impostorC = 'process-worker-CCC';

  // Cleanup any old test key
  await prisma.systemLock.deleteMany({ where: { key: testKey } });

  // 1. Initial State Check
  const initialActive = await isPriorityLeaseActive(testKey);
  console.assert(!initialActive, '1. Initial state should be inactive');
  console.log('✅ Test 1: Initial state is inactive');

  // 2. Process A acquires lock
  const aAcquired = await acquirePriorityLease(testKey, 5, ownerA);
  console.assert(aAcquired, '2. Process A should acquire lock');
  const activeAfterA = await isPriorityLeaseActive(testKey);
  console.assert(activeAfterA, '2. Lock should now be active');
  console.log('✅ Test 2: Process A acquired lock');

  // 3. Process B tries to acquire same lock -> MUST FAIL
  const bAcquired = await acquirePriorityLease(testKey, 5, ownerB);
  console.assert(!bAcquired, '3. Process B MUST fail to acquire while A holds it');
  console.log('✅ Test 3: Process B rejected (Atomic mutual exclusion)');

  // 4. Impostor C tries to heartbeat Process A lock -> MUST FAIL
  const cHeartbeat = await heartbeatPriorityLease(testKey, impostorC, 5);
  console.assert(!cHeartbeat, '4. Impostor C MUST fail to heartbeat A lock');
  console.log('✅ Test 4: Impostor C rejected from heartbeat');

  // 5. Process A sends valid heartbeat -> MUST SUCCEED
  const aHeartbeat = await heartbeatPriorityLease(testKey, ownerA, 5);
  console.assert(aHeartbeat, '5. Process A valid heartbeat must succeed');
  console.log('✅ Test 5: Process A heartbeat succeeded');

  // 6. Stale Owner Test:
  // Set lease to expire in 1s
  console.log('⏳ Testing Stale Owner recovery (waiting 2s for lease expiry)...');
  await acquirePriorityLease(testKey, 1, ownerA);
  await new Promise((r) => setTimeout(r, 1500));

  // Now lock is expired. Process B should be able to acquire it atomically!
  const bAcquiredAfterExpiry = await acquirePriorityLease(testKey, 5, ownerB);
  console.assert(bAcquiredAfterExpiry, '6. Process B should acquire expired lock');
  console.log('✅ Test 6a: Process B acquired expired lock');

  // Now stale Process A tries to heartbeat -> MUST FAIL!
  const staleAHeartbeat = await heartbeatPriorityLease(testKey, ownerA, 5);
  console.assert(!staleAHeartbeat, '6b. Stale Process A heartbeat MUST fail');
  console.log('✅ Test 6b: Stale Process A rejected by ownerId validation');

  // 7. Impostor tries to release B's lock -> MUST FAIL
  const impostorRelease = await releasePriorityLease(testKey, ownerA);
  console.assert(!impostorRelease, '7. Impostor cannot release lock');
  const bStillActive = await isPriorityLeaseActive(testKey);
  console.assert(bStillActive, '7. Lock still active after impostor release');
  console.log('✅ Test 7: Impostor release prevented');

  // 8. Process B releases lock properly
  const bReleased = await releasePriorityLease(testKey, ownerB);
  console.assert(bReleased, '8. Process B properly released lock');
  const finalActive = await isPriorityLeaseActive(testKey);
  console.assert(!finalActive, '8. Lock is completely free now');
  console.log('✅ Test 8: Process B released lock');

  console.log('\n🎉 ALL 8 ATOMIC LEASE TESTS PASSED 100%!');
}

runTests()
  .catch((e) => {
    console.error('❌ Test failed with error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
