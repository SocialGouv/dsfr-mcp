/**
 * Simple Map-based LRU cache.
 * JavaScript Map iterates in insertion order, so we use
 * delete + re-insert to move entries to the "most recently used" end.
 * When size exceeds maxSize, the first entry (LRU) is evicted.
 */
export class LRUCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    if (maxSize < 1) throw new Error("LRU cache maxSize must be at least 1");
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const lruKey = this.map.keys().next().value;
      if (lruKey !== undefined) {
        this.map.delete(lruKey);
      }
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
