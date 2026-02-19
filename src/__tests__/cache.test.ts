import { describe, it, expect } from "vitest";
import { LRUCache } from "../cache.js";

describe("LRUCache", () => {
  it("should store and retrieve values", () => {
    const cache = new LRUCache<string, string>(3);
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
  });

  it("should return undefined for missing keys", () => {
    const cache = new LRUCache<string, string>(3);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("should evict least recently used entry when full", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // evicts "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("d")).toBe(4);
  });

  it("should refresh access order on get", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.get("a"); // refreshes "a", "b" is now LRU
    cache.set("d", 4); // evicts "b"
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
  });

  it("should refresh access order on set (update)", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("a", 10); // update refreshes "a"
    cache.set("d", 4); // evicts "b"
    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBeUndefined();
  });

  it("should report correct size", () => {
    const cache = new LRUCache<string, number>(3);
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4);
    expect(cache.size).toBe(3);
  });

  it("should clear all entries", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("should throw if maxSize is less than 1", () => {
    expect(() => new LRUCache<string, string>(0)).toThrow();
    expect(() => new LRUCache<string, string>(-1)).toThrow();
  });
});
