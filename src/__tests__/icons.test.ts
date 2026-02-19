import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIcons, searchIcons } from "../core.js";
import type { IconEntry } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

describe("loadIcons", () => {
  it("should load and parse the icons file", () => {
    const icons = loadIcons(FIXTURES_DIR);
    expect(icons).toBeInstanceOf(Array);
    expect(icons).toHaveLength(8);
    expect(icons[0]).toHaveProperty("name");
    expect(icons[0]).toHaveProperty("category");
    expect(icons[0]).toHaveProperty("variants");
    expect(icons[0]).toHaveProperty("classes");
  });

  it("should throw when icons file does not exist", () => {
    expect(() => loadIcons("/nonexistent/path")).toThrow(
      /Icons index not found/,
    );
  });
});

describe("searchIcons", () => {
  let icons: IconEntry[];

  beforeAll(() => {
    icons = loadIcons(FIXTURES_DIR);
  });

  it("should find icons by exact name match", () => {
    const result = searchIcons(icons, "download");
    expect(result.content[0].text).toContain("**download**");
    expect(result.content[0].text).toContain("fr-icon-download-fill");
  });

  it("should find icons by partial name match", () => {
    const result = searchIcons(icons, "down");
    expect(result.content[0].text).toContain("**download**");
    expect(result.content[0].text).toContain("**file-download**");
  });

  it("should filter by category", () => {
    const result = searchIcons(icons, "arrow", "arrows");
    expect(result.content[0].text).toContain("**arrow-left**");
    expect(result.content[0].text).toContain("**arrow-right**");
    expect(result.content[0].text).not.toContain("[system]");
  });

  it("should return no-results message for unmatched query", () => {
    const result = searchIcons(icons, "xyznonexistent");
    expect(result.content[0].text).toContain("Aucune icône trouvée");
  });

  it("should be case-insensitive", () => {
    const result = searchIcons(icons, "DOWNLOAD");
    expect(result.content[0].text).toContain("**download**");
  });

  it("should handle icons without variants", () => {
    const result = searchIcons(icons, "italic");
    expect(result.content[0].text).toContain("**italic**");
    expect(result.content[0].text).toContain("sans variante");
    expect(result.content[0].text).toContain("fr-icon-italic");
  });

  it("should prioritize exact match over partial", () => {
    const result = searchIcons(icons, "download");
    const text = result.content[0].text;
    const downloadPos = text.indexOf("**download**");
    const fileDownloadPos = text.indexOf("**file-download**");
    expect(downloadPos).toBeLessThan(fileDownloadPos);
  });

  it("should find icons by CSS class", () => {
    const result = searchIcons(icons, "fr-icon-home");
    expect(result.content[0].text).toContain("**home**");
  });

  it("should return category info in no-results message when no category filter", () => {
    const result = searchIcons(icons, "xyznonexistent");
    expect(result.content[0].text).toContain("Catégories disponibles");
  });
});
