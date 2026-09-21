/**
 * Layer 1: In-Memory In-Flight Lock
 * Prevents duplicate promises/executions within the same Node.js process.
 */
class InFlightLockManager {
  private inFlightMap: Map<string, Promise<any>> = new Map();

  /**
   * Acquire or wait for an existing in-flight promise.
   * @param key Unique key e.g. `${chapterId}:${jobType}`
   * @param fn Function to execute if lock is acquired
   */
  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlightMap.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.inFlightMap.delete(key);
    });

    this.inFlightMap.set(key, promise);
    return promise;
  }

  isLocked(key: string): boolean {
    return this.inFlightMap.has(key);
  }
}

export const inFlightLock = new InFlightLockManager();
