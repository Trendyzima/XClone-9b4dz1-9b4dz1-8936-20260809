/**
 * Idempotency system
 * Prevents double charging / duplicate wallet updates
 */

export class IdempotencyManager {
  private seen = new Set<string>();

  isNew(key: string): boolean {
    return !this.seen.has(key);
  }

  commit(key: string) {
    this.seen.add(key);
  }

  runOnce<T>(key: string, fn: () => T): T | undefined {
    if (this.seen.has(key)) return undefined;
    this.seen.add(key);
    return fn();
  }
}
