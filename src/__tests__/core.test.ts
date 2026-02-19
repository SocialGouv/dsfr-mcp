import { describe, it, expect, beforeEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIndex, listComponents, getComponentDoc, searchComponents } from "../core.js";
import { LRUCache } from "../cache.js";
import type { ComponentEntry } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

describe("loadIndex", () => {
  it("should load and parse the index file", () => {
    const index = loadIndex(FIXTURES_DIR);
    expect(index).toBeInstanceOf(Array);
    expect(index).toHaveLength(3);
    expect(index[0]).toHaveProperty("name");
    expect(index[0]).toHaveProperty("title");
    expect(index[0]).toHaveProperty("sections");
  });

  it("should throw when index file does not exist", () => {
    expect(() => loadIndex("/nonexistent/path")).toThrow(
      /Documentation index not found/,
    );
  });
});

describe("listComponents", () => {
  it("should return all components in JSON format", () => {
    const index = loadIndex(FIXTURES_DIR);
    const result = listComponents(index);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toHaveProperty("name", "button");
    expect(parsed[0]).toHaveProperty("category", "component");
    expect(parsed[0]).toHaveProperty("sections");
  });
});

describe("getComponentDoc", () => {
  let index: ComponentEntry[];
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    index = loadIndex(FIXTURES_DIR);
    cache = new LRUCache<string, string>(10);
  });

  it("should return documentation for a valid component and section", () => {
    const result = getComponentDoc(index, FIXTURES_DIR, "button", "code", cache);
    expect(result.content[0].text).toContain("Bouton");
    expect(result.content[0].text).toContain("code");
    expect(result.content[0].text).toContain("fr-btn");
  });

  it("should suggest alternatives when component not found", () => {
    const result = getComponentDoc(index, FIXTURES_DIR, "butto", "code", cache);
    expect(result.content[0].text).toContain("non trouvé");
    expect(result.content[0].text).toContain("button");
  });

  it("should handle missing section gracefully", () => {
    const result = getComponentDoc(index, FIXTURES_DIR, "button", "demo", cache);
    expect(result.content[0].text).toContain("non disponible");
    expect(result.content[0].text).toContain("Sections disponibles");
  });

  it("should be case-insensitive for component name", () => {
    const result = getComponentDoc(index, FIXTURES_DIR, "Button", "code", cache);
    expect(result.content[0].text).toContain("Bouton");
  });

  it("should use cache for repeated reads", () => {
    getComponentDoc(index, FIXTURES_DIR, "button", "code", cache);
    const filePath = join(FIXTURES_DIR, "component", "button", "code.md");
    expect(cache.get(filePath)).toBeDefined();

    // Second call uses cached value
    const result = getComponentDoc(index, FIXTURES_DIR, "button", "code", cache);
    expect(result.content[0].text).toContain("fr-btn");
  });
});

describe("searchComponents", () => {
  let index: ComponentEntry[];
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    index = loadIndex(FIXTURES_DIR);
    cache = new LRUCache<string, string>(50);
  });

  it("should find components by metadata (name/title/description)", () => {
    const result = searchComponents(index, FIXTURES_DIR, "Bouton", cache);
    expect(result.content[0].text).toContain("button");
    expect(result.content[0].text).toContain("metadata");
  });

  it("should find components by file content", () => {
    const result = searchComponents(index, FIXTURES_DIR, "fr-btn", cache);
    expect(result.content[0].text).toContain("button");
    expect(result.content[0].text).toContain("content");
  });

  it("should find components by CSS class in content", () => {
    const result = searchComponents(index, FIXTURES_DIR, "fr-card__title", cache);
    expect(result.content[0].text).toContain("card");
    expect(result.content[0].text).toContain("content");
  });

  it("should return no-results message for unmatched query", () => {
    const result = searchComponents(index, FIXTURES_DIR, "xyznonexistent", cache);
    expect(result.content[0].text).toContain("Aucun résultat");
  });

  it("should be case-insensitive", () => {
    const result = searchComponents(index, FIXTURES_DIR, "BOUTON", cache);
    expect(result.content[0].text).toContain("button");
  });

  it("should return one result per component", () => {
    const result = searchComponents(index, FIXTURES_DIR, "bouton", cache);
    const text = result.content[0].text;
    // "button" should appear as a result only once
    const matches = text.match(/\*\*button\*\*/g);
    expect(matches).toHaveLength(1);
  });
});
