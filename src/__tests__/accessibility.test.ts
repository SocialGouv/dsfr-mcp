import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadIndex, loadAccessibility, getComponentAccessibility } from "../core.js";
import { parseAccessibility } from "../../scripts/parse-accessibility.js";
import type { ComponentEntry, AccessibilityIndex } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const REPO_ROOT = join(__dirname, "..", "..");

describe("loadAccessibility", () => {
  it("should load and parse the accessibility file", () => {
    const accessibility = loadAccessibility(FIXTURES_DIR);
    expect(accessibility).toHaveProperty("button");
    expect(accessibility.button.keyboardInteractions).toBeInstanceOf(Array);
  });

  it("should throw when accessibility file does not exist", () => {
    expect(() => loadAccessibility("/nonexistent/path")).toThrow(
      /Accessibility index not found/,
    );
  });
});

describe("getComponentAccessibility", () => {
  let index: ComponentEntry[];
  let accessibility: AccessibilityIndex;

  beforeAll(() => {
    index = loadIndex(FIXTURES_DIR);
    accessibility = loadAccessibility(FIXTURES_DIR);
  });

  it("should format structured accessibility data for a component", () => {
    const result = getComponentAccessibility(index, accessibility, "button");
    const text = result.content[0].text;
    expect(text).toContain("Interactions clavier");
    expect(text).toContain("Entrée");
    expect(text).toContain("Règles d'accessibilité");
    expect(text).toContain("Critères RGAA");
    expect(text).toContain("3.2");
    expect(text).toContain("https://");
    expect(text).toContain("✅");
    expect(text).toContain("❌");
  });

  it("should suggest alternatives when component not found", () => {
    const result = getComponentAccessibility(index, accessibility, "butto");
    expect(result.content[0].text).toContain("non trouvé");
    expect(result.content[0].text).toContain("button");
  });

  it("should handle components without accessibility section gracefully", () => {
    // "card" exists in the fixture index but has no accessibility entry
    const result = getComponentAccessibility(index, accessibility, "card");
    expect(result.content[0].text).toContain("Pas de section accessibilité");
    expect(result.content[0].text).toContain("get_component_doc");
  });

  it("should be case-insensitive for component name", () => {
    const result = getComponentAccessibility(index, accessibility, "Button");
    expect(result.content[0].text).toContain("Bouton");
  });
});

describe("parseAccessibility (parser on real DSFR markdown)", () => {
  let parsed: ReturnType<typeof parseAccessibility>;

  beforeAll(() => {
    const md = readFileSync(
      join(REPO_ROOT, "docs", "component", "button", "accessibility.md"),
      "utf-8",
    );
    parsed = parseAccessibility(md, "button", "Bouton");
  });

  it("extracts keyboard interactions", () => {
    expect(parsed.keyboardInteractions).toHaveLength(2);
    expect(parsed.keyboardInteractions[0].key).toBe("Entrée");
    expect(parsed.keyboardInteractions[0].action).toContain("actionne");
  });

  it("extracts do/dont guidelines", () => {
    expect(parsed.rules.guidelines).toHaveLength(4);
    expect(parsed.rules.guidelines.some((g) => g.type === "do")).toBe(true);
    expect(parsed.rules.guidelines.some((g) => g.type === "dont")).toBe(true);
  });

  it("extracts contrast tables with rows", () => {
    expect(parsed.contrasts).toHaveLength(2);
    expect(parsed.contrasts[0].rows.length).toBeGreaterThan(0);
    expect(parsed.contrasts[0].rows[0]).toHaveProperty("lightTheme");
  });

  it("extracts RGAA criteria including the colon-inside-bold format", () => {
    const topics = parsed.rgaaCriteria.map((c) => c.topic);
    expect(topics).toContain("Couleurs");
    expect(topics).toContain("Consultation");
    const consultation = parsed.rgaaCriteria.find((c) => c.topic === "Consultation");
    expect(consultation?.criteria).toContain("13.9");
  });

  it("extracts references as label/url pairs", () => {
    expect(parsed.references.length).toBeGreaterThanOrEqual(2);
    expect(parsed.references.every((r) => r.url.startsWith("http"))).toBe(true);
  });

  it("produces cleaned markdown without DSFR directives", () => {
    expect(parsed.cleanedMarkdown).not.toContain(":::");
    expect(parsed.cleanedMarkdown).not.toContain("&nbsp;");
  });
});
