import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadIndex,
  getComponentDoc,
  searchComponents,
  getComponentCode,
  stripDocChrome,
} from "../core.js";
import { LRUCache } from "../cache.js";
import type { ComponentEntry } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "..", "docs");

describe("stripDocChrome (#1)", () => {
  it("removes frontmatter and the tab-navigation block but keeps code fences", () => {
    const sample = [
      "---",
      "title: Code du Bouton",
      "sitemap:",
      "  noindex: true",
      "---",
      "",
      "## Bouton",
      "",
      ":::dsfr-doc-tab-navigation",
      "",
      "- [Présentation](../index.md)",
      "- Code",
      "",
      ":::",
      "",
      "```html",
      '<button class="fr-btn">Libellé</button>',
      "```",
    ].join("\n");
    const out = stripDocChrome(sample);
    expect(out).not.toContain("sitemap:");
    expect(out).not.toContain("title: Code");
    expect(out).not.toContain("dsfr-doc-tab-navigation");
    expect(out).not.toContain("../index.md");
    expect(out).toContain('<button class="fr-btn">');
    expect(out).toContain("```html");
  });

  it("is a no-op on content without chrome", () => {
    const sample = "## Titre\n\nDu texte simple.";
    expect(stripDocChrome(sample)).toBe(sample);
  });
});

describe("get_component_doc cleaning on real docs (#1)", () => {
  let index: ComponentEntry[];
  let cache: LRUCache<string, string>;
  beforeAll(() => {
    index = loadIndex(DOCS_DIR);
    cache = new LRUCache<string, string>(50);
  });

  it("returns clean code section (no YAML, no nav, keeps fr-btn)", () => {
    const text = getComponentDoc(index, DOCS_DIR, "button", "code", cache).content[0].text;
    expect(text).toContain("fr-btn");
    expect(text).not.toContain("sitemap:");
    expect(text).not.toContain("dsfr-doc-tab-navigation");
  });
});

describe("searchComponents improvements (#2)", () => {
  let index: ComponentEntry[];
  let cache: LRUCache<string, string>;
  beforeAll(() => {
    index = loadIndex(DOCS_DIR);
    cache = new LRUCache<string, string>(500);
  });

  it("ranks a metadata match (component name/title) first", () => {
    const text = searchComponents(index, DOCS_DIR, "bouton", cache).content[0].text;
    const firstResult = text.split("\n\n").find((l) => l.startsWith("- **"));
    expect(firstResult).toContain("**button**");
    expect(firstResult).toContain("metadata");
  });

  it("produces clean excerpts (no directives, no nbsp) for content matches", () => {
    const text = searchComponents(index, DOCS_DIR, "aria-label", cache).content[0].text;
    expect(text).toContain("aria-label");
    expect(text).not.toContain(":::");
    expect(text).not.toContain("&nbsp;");
  });

  it("handles multi-term queries", () => {
    const text = searchComponents(index, DOCS_DIR, "bouton accessible", cache).content[0].text;
    expect(text).toContain("**button**");
  });

  it("returns a no-results message for unmatched queries", () => {
    const text = searchComponents(index, DOCS_DIR, "zzzznotathing", cache).content[0].text;
    expect(text).toContain("Aucun résultat");
  });
});

describe("getComponentCode (#4)", () => {
  let index: ComponentEntry[];
  let cache: LRUCache<string, string>;
  beforeAll(() => {
    index = loadIndex(DOCS_DIR);
    cache = new LRUCache<string, string>(50);
  });

  it("extracts HTML examples and CSS classes for a component", () => {
    const text = getComponentCode(index, DOCS_DIR, "button", cache).content[0].text;
    expect(text).toContain("Classes CSS");
    expect(text).toContain("`fr-btn`");
    expect(text).toContain("```html");
    expect(text).toContain("<button");
  });

  it("suggests alternatives when the component is unknown", () => {
    const text = getComponentCode(index, DOCS_DIR, "buton", cache).content[0].text;
    expect(text).toContain("non trouvé");
  });

  it("reports gracefully when a component has no code section", () => {
    const noCode = index.find((e) => !e.sections.includes("code"));
    expect(noCode).toBeDefined();
    const text = getComponentCode(index, DOCS_DIR, noCode!.name, cache).content[0].text;
    expect(text).toContain("Pas de section code");
  });

  it("is case-insensitive for the component name", () => {
    const text = getComponentCode(index, DOCS_DIR, "Button", cache).content[0].text;
    expect(text).toContain("Bouton — Code");
  });
});
