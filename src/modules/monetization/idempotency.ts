/**
 * Idempotency system
 * Prevents double charging / duplicate wallet updates
 *
 * esbuild-safe: no Set<T> generics, uses plain Record object as key store.
 */

export class IdempotencyManager {
  // plain object used as a set — avoids Set<string> generic (esbuild non-determinism guard)
  private seen: Record<string, true> = {};

  isNew(key: string): boolean {
    return !this.seen[key];
  }

  commit(key: string): void {
    this.seen[key] = true;
  }

  runOnce<T>(key: string, fn: () => T): T | undefined {
    if (this.seen[key]) return undefined;
    this.seen[key] = true;
    return fn();
  }

  reset(key: string): void {
    delete this.seen[key];
  }

  clear(): void {
    this.seen = {};
  }
}
