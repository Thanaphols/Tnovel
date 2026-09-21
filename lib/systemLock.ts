import { prisma } from './prisma';

export interface PriorityLeaseResult {
  acquired: boolean;
  ownerId: string;
  lockedUntil?: Date;
}

/**
 * Atomically acquires a priority lease lock in SQLite.
 * Uses ON CONFLICT ... WHERE lockedUntil < NOW() OR ownerId = excluded.ownerId
 * to guarantee atomic mutual exclusion across multi-process PM2 workers.
 */
export async function acquirePriorityLease(
  key: string,
  leaseSec: number = 60,
  ownerId: string
): Promise<boolean> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + leaseSec * 1000);
  const nowIso = now.toISOString();
  const lockedUntilIso = lockedUntil.toISOString();

  try {
    const affected = await prisma.$executeRaw`
      INSERT INTO SystemLock (key, ownerId, lockedUntil, createdAt, updatedAt)
      VALUES (${key}, ${ownerId}, ${lockedUntilIso}, ${nowIso}, ${nowIso})
      ON CONFLICT(key) DO UPDATE SET
        ownerId = ${ownerId},
        lockedUntil = ${lockedUntilIso},
        updatedAt = ${nowIso}
      WHERE SystemLock.lockedUntil < ${nowIso} OR SystemLock.ownerId = ${ownerId}
    `;

    return affected > 0;
  } catch (err) {
    console.error(`[SystemLock] Failed to acquire lease for "${key}":`, err);
    return false;
  }
}

/**
 * Renews an active lease lock only if the caller is the current owner
 * and the lock hasn't already expired and been acquired by another owner.
 */
export async function heartbeatPriorityLease(
  key: string,
  ownerId: string,
  leaseSec: number = 60
): Promise<boolean> {
  const now = new Date();
  const newLockedUntil = new Date(now.getTime() + leaseSec * 1000);
  const nowIso = now.toISOString();
  const newLockedUntilIso = newLockedUntil.toISOString();

  try {
    const affected = await prisma.$executeRaw`
      UPDATE SystemLock
      SET lockedUntil = ${newLockedUntilIso}, updatedAt = ${nowIso}
      WHERE key = ${key} AND ownerId = ${ownerId} AND lockedUntil >= ${nowIso}
    `;

    return affected > 0;
  } catch (err) {
    console.error(`[SystemLock] Heartbeat failed for "${key}":`, err);
    return false;
  }
}

/**
 * Releases a lease lock safely.
 * Deletes the lock entry only if the caller is the verified owner.
 */
export async function releasePriorityLease(key: string, ownerId: string): Promise<boolean> {
  try {
    const affected = await prisma.$executeRaw`
      DELETE FROM SystemLock
      WHERE key = ${key} AND ownerId = ${ownerId}
    `;

    return affected > 0;
  } catch (err) {
    console.error(`[SystemLock] Release failed for "${key}":`, err);
    return false;
  }
}

/**
 * Informational check: Returns true if an unexpired lease lock is active.
 * Used by background queue workers (e.g. PolishQueue) to yield to high-priority manual work.
 */
export async function isPriorityLeaseActive(key: string): Promise<boolean> {
  const nowIso = new Date().toISOString();

  try {
    const active = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*) as count FROM SystemLock
      WHERE key = ${key} AND lockedUntil > ${nowIso}
    `;

    return (active[0]?.count ?? 0) > 0;
  } catch (err) {
    console.error(`[SystemLock] Status check failed for "${key}":`, err);
    return false;
  }
}
