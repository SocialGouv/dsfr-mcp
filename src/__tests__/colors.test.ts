import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadColors, getColorTokens } from "../core.js";
import type { ColorsIndex } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

describe("loadColors", () => {
  it("should load and parse the colors file", () => {
    const colors = loadColors(FIXTURES_DIR);
    expect(colors).toHaveProperty("decisionTokens");
    expect(colors).toHaveProperty("families");
    expect(colors).toHaveProperty("illustrativeNames");
    expect(colors.decisionTokens).toBeInstanceOf(Array);
    expect(colors.families).toBeInstanceOf(Array);
  });

  it("should throw when colors file does not exist", () => {
    expect(() => loadColors("/nonexistent/path")).toThrow(
      /Colors index not found/,
    );
  });
});

describe("getColorTokens", () => {
  let colors: ColorsIndex;

  beforeAll(() => {
    colors = loadColors(FIXTURES_DIR);
  });

  it("should filter by context", () => {
    const result = getColorTokens(colors, { context: "background" });
    const text = result.content[0].text;
    expect(text).toContain("$background-action-high-blue-france");
    expect(text).toContain("$background-flat-error");
    expect(text).not.toContain("$text-action-high-blue-france");
  });

  it("should filter by usage", () => {
    const result = getColorTokens(colors, { usage: "error" });
    const text = result.content[0].text;
    expect(text).toContain("$background-flat-error");
    expect(text).toContain("$text-default-error");
    expect(text).not.toContain("$background-action-high-blue-france");
  });

  it("should filter by family and include family correspondences", () => {
    const result = getColorTokens(colors, { family: "blue-france" });
    const text = result.content[0].text;
    expect(text).toContain("$background-action-high-blue-france");
    expect(text).toContain('Famille "blue-france"');
    expect(text).toContain("strong");
    expect(text).toContain("$blue-france-sun-113");
  });

  it("should combine context and usage filters", () => {
    const result = getColorTokens(colors, { context: "background", usage: "error" });
    const text = result.content[0].text;
    expect(text).toContain("$background-flat-error");
    expect(text).not.toContain("$text-default-error");
    expect(text).not.toContain("$background-action-high-blue-france");
  });

  it("should return no-results message when nothing matches", () => {
    const result = getColorTokens(colors, { usage: "xyznonexistent" });
    expect(result.content[0].text).toContain("Aucun token trouvé");
  });

  it("should return summary when no filters provided", () => {
    const result = getColorTokens(colors, {});
    const text = result.content[0].text;
    expect(text).toContain("Contextes");
    expect(text).toContain("Familles");
    expect(text).toContain("Couleurs illustratives");
  });

  it("should be case-insensitive for usage and family", () => {
    const result = getColorTokens(colors, { usage: "ERROR" });
    const text = result.content[0].text;
    expect(text).toContain("$background-flat-error");
  });
});
