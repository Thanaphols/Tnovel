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
    let promise = this.inFlightMap.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = fn().finally(() => {
        this.inFlightMap.delete(key);
      });
      this.inFlightMap.set(key, promise);
    }

    // Routes return a Response from fn. Its body can be read only once, so every caller (the
    // first and each coalesced duplicate) gets its own clone; the original is never consumed.
    const result = await promise;
    return (result instanceof Response ? result.clone() : result) as T;
  }

  isLocked(key: string): boolean {
    return this.inFlightMap.has(key);
  }
}

export const inFlightLock = new InFlightLockManager();
