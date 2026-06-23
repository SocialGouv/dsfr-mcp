import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDsfrData } from "../server.js";
import { getColorTokens, searchIcons, getComponentAccessibility } from "../core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const PARTIAL_DIR = join(__dirname, "fixtures-partial");

describe("buildDsfrData (resilient loading)", () => {
  it("loads all data when every file is present", () => {
    const d = buildDsfrData(FIXTURES_DIR);
    expect(d.index.length).toBeGreaterThan(0);
    expect(d.icons.length).toBeGreaterThan(0);
    expect(d.colors.decisionTokens.length).toBeGreaterThan(0);
    expect(d).toHaveProperty("accessibility");
  });

  it("degrades gracefully when optional data files are missing", () => {
    // PARTIAL_DIR has only index.json — icons/colors/accessibility are absent.
    const d = buildDsfrData(PARTIAL_DIR);
    expect(d.index.length).toBe(1); // index still loads (essential)
    expect(d.icons).toEqual([]);
    expect(d.colors.decisionTokens).toEqual([]);
    expect(d.accessibility).toEqual({});
  });

  it("still throws when the essential index is missing", () => {
    expect(() => buildDsfrData("/nonexistent/path")).toThrow(
      /Documentation index not found/,
    );
  });

  it("tools tolerate the degraded (empty) data without crashing", () => {
    const d = buildDsfrData(PARTIAL_DIR);
    expect(() => getColorTokens(d.colors, { usage: "error" })).not.toThrow();
    expect(() => searchIcons(d.icons, "arrow")).not.toThrow();
    const r = getComponentAccessibility(d.index, d.accessibility, "button");
    expect(r.content[0].text).toContain("Pas de section accessibilité");
  });
});
