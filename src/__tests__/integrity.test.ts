// Integrity checks on the docs/ corpus that actually ships, as opposed to the
// hand-written fixtures the other suites use.
//
// These exist because of a real miss: the DSFR 1.15.0 colour refactor moved the
// decision tokens to a new page, `fetch-docs` emitted an empty colors.json,
// `get_color_tokens` stopped answering — and all 69 tests stayed green, because
// every colour assertion ran against a fixture decoupled from the pipeline.
// Anything asserted here must be a property of the delivered data.

import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadIndex,
  loadIcons,
  loadColors,
  loadAccessibility,
  loadCharts,
  loadMeta,
  getColorTokens,
  getChartDoc,
  ICON_CATEGORIES,
  DOC_SECTIONS,
} from "../core.js";
import type {
  ComponentEntry,
  IconEntry,
  ColorsIndex,
  AccessibilityIndex,
  ChartsIndex,
  DocsMeta,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "..", "docs");

let index: ComponentEntry[];
let icons: IconEntry[];
let colors: ColorsIndex;
let accessibility: AccessibilityIndex;
let charts: ChartsIndex;
let meta: DocsMeta;

beforeAll(() => {
  index = loadIndex(DOCS_DIR);
  icons = loadIcons(DOCS_DIR);
  colors = loadColors(DOCS_DIR);
  accessibility = loadAccessibility(DOCS_DIR);
  charts = loadCharts(DOCS_DIR);
  meta = loadMeta(DOCS_DIR);
});

describe("meta.json", () => {
  it("records both pinned upstream versions and their commits", () => {
    expect(meta.schemaVersion).toBe(2);
    expect(meta.dsfrVersion).toMatch(/^v\d+\.\d+\.\d+/);
    expect(meta.dsfrChartVersion).toMatch(/^v\d+\.\d+\.\d+/);
    expect(meta.dsfrCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(meta.dsfrChartCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(Date.parse(meta.fetchedAt)).not.toBeNaN();
  });

  it("agrees with what is actually on disk", () => {
    expect(meta.counts.entries).toBe(index.length);
    expect(meta.counts.icons).toBe(icons.length);
    expect(meta.counts.decisionTokens).toBe(colors.decisionTokens.length);
    expect(meta.counts.colorFamilies).toBe(colors.families.length);
    expect(meta.counts.illustrativeNames).toBe(colors.illustrativeNames.length);
    expect(meta.counts.accessibilityComponents).toBe(Object.keys(accessibility).length);
    expect(meta.counts.charts).toBe(charts.charts.length);
    expect(meta.counts.documentedCharts).toBe(charts.charts.filter((c) => c.documented).length);
  });
});

describe("colors.json", () => {
  it("is not empty — the failure mode that shipped unnoticed", () => {
    expect(colors.decisionTokens.length).toBeGreaterThanOrEqual(30);
    expect(colors.families.length).toBeGreaterThanOrEqual(24);
    // A floor plus the names that matter, rather than an exact count that would
    // turn red on an upstream addition for no good reason.
    expect(colors.illustrativeNames.length).toBeGreaterThanOrEqual(17);
    for (const name of ["green-tilleul-verveine", "blue-ecume", "brown-caramel"]) {
      expect(colors.illustrativeNames, `couleur illustrative ${name} absente`).toContain(name);
    }
  });

  it("gives every family its light/dark correspondences", () => {
    for (const family of colors.families) {
      const keys = Object.keys(family.correspondences);
      expect(keys.length, `famille ${family.name} sans correspondance`).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(family.correspondences)) {
        expect(value.light, `${family.name}.${key} clair`).toMatch(/^\$[a-z0-9-]+$/);
        expect(value.dark, `${family.name}.${key} sombre`).toMatch(/^\$[a-z0-9-]+$/);
      }
    }
    const text = getColorTokens(colors, { family: "blue-france" }).content[0].text;
    expect(text).toContain('Famille "blue-france" (primaire)');
  });

  it("covers the three usage contexts", () => {
    const contexts = new Set(colors.decisionTokens.map((t) => t.context));
    expect([...contexts].sort()).toEqual(["artwork", "background", "text"]);
  });

  it("classifies each family under its own heading", () => {
    // Regression guard: flushing a family after the next `###` heading had
    // shifted every category by one (red-marianne "neutre", grey "systeme",
    // info "illustrative").
    const category = (name: string) => colors.families.find((f) => f.name === name)?.category;
    expect(category("blue-france")).toBe("primaire");
    expect(category("red-marianne")).toBe("primaire");
    expect(category("grey")).toBe("neutre");
    expect(category("info")).toBe("systeme");
    expect(category("error")).toBe("systeme");
    expect(category("green-tilleul-verveine")).toBe("illustrative");
  });

  it("answers a real get_color_tokens call", () => {
    const text = getColorTokens(colors, { context: "background", usage: "action" }).content[0].text;
    expect(text).toContain("$background-action-high-blue-france");
  });
});

describe("icons.json", () => {
  it("never emits the upstream `fr--` filename marker as a CSS class", () => {
    // `fr--warning-fill.svg` builds to `.fr-icon-warning-fill`; keeping the
    // marker produced 39 classes that exist in no DSFR stylesheet.
    const wrong = icons.flatMap((i) => i.classes).filter((c) => c.startsWith("fr-icon-fr--"));
    expect(wrong).toEqual([]);
    expect(icons.some((i) => i.name.startsWith("fr--"))).toBe(false);
  });

  it("exposes the most common system icons under their real class name", () => {
    for (const name of ["error", "success", "warning", "info"]) {
      const icon = icons.find((i) => i.name === name);
      expect(icon, `icône ${name} absente`).toBeDefined();
      expect(icon!.classes).toContain(`fr-icon-${name}-fill`);
    }
  });

  it("keeps every class prefixed exactly once", () => {
    const malformed = icons
      .flatMap((i) => i.classes)
      .filter((c) => !/^fr-icon-[a-z0-9][a-z0-9-]*$/.test(c));
    expect(malformed).toEqual([]);
  });

  it("only advertises categories that search_icons can filter on", () => {
    // ICON_CATEGORIES (core.ts) is the single source of the zod enum in
    // server.ts. Asserting inclusion rather than "the filter returns something"
    // is what actually catches a new upstream category: the latter passes for
    // any category present in the data, which is a tautology.
    const categories = new Set(icons.map((i) => i.category));
    for (const category of categories) {
      expect(
        ICON_CATEGORIES as readonly string[],
        `catégorie ${category} absente de ICON_CATEGORIES / de l'enum zod`,
      ).toContain(category);
    }
  });
});

describe("index.json", () => {
  it("carries the full component catalogue", () => {
    expect(index.length).toBeGreaterThanOrEqual(70);
    for (const name of ["button", "card", "input", "modal", "table"]) {
      expect(index.some((e) => e.name === name), `composant ${name} absent`).toBe(true);
    }
  });

  it("exposes the colour fundamentals, split or not depending on the pinned DSFR", () => {
    const color = index.find((e) => e.name === "color" && e.category === "core");
    expect(color).toBeDefined();
    expect(color!.sections).toContain("overview");

    // The split only exists from 1.15.0 on; asserting it unconditionally would
    // turn `DSFR_TAG=v1.14.3 pnpm run fetch-docs` — a workflow the README
    // documents — into a red test suite.
    const [major, minor] = meta.dsfrVersion.replace(/^v/, "").split(".").map(Number);
    if (major > 1 || (major === 1 && minor >= 15)) {
      expect(color!.sections).toContain("usage");
    } else {
      expect(index.some((e) => e.name === "palette" && e.category === "core")).toBe(true);
    }
  });

  it("declares no section the MCP tool cannot serve", () => {
    // fetch-docs can produce a new core sub-page as a section; if DOC_SECTIONS
    // is not widened, that section is indexed and searchable but unreadable.
    for (const section of new Set(index.flatMap((e) => e.sections))) {
      expect(
        DOC_SECTIONS as readonly string[],
        `section "${section}" absente de DOC_SECTIONS / de l'enum zod`,
      ).toContain(section);
    }
  });

  it("does not ingest the upstream `*/search` stub pages", () => {
    const stubs = index.filter((e) => e.sections.includes("search"));
    expect(stubs).toEqual([]);
  });

  it("has a readable file behind every declared section", () => {
    const missing: string[] = [];
    for (const entry of index) {
      for (const section of entry.sections) {
        const path = join(DOCS_DIR, entry.category, entry.name, `${section}.md`);
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { statSync } = require("node:fs");
          if (statSync(path).size === 0) missing.push(path);
        } catch {
          missing.push(path);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("accessibility.json", () => {
  it("covers the components that declare an accessibility section", () => {
    const declared = index.filter((e) => e.sections.includes("accessibility")).map((e) => e.name);
    expect(declared.length).toBeGreaterThanOrEqual(40);
    for (const name of declared) {
      expect(accessibility[name], `accessibilité manquante pour ${name}`).toBeDefined();
    }
  });

  it("extracts substantive content, not just empty shells", () => {
    const withRules = Object.values(accessibility).filter((a) => a.rules.text.length > 0);
    expect(withRules.length).toBeGreaterThanOrEqual(35);
    const withRgaa = Object.values(accessibility).filter((a) => a.rgaaCriteria.length > 0);
    expect(withRgaa.length).toBeGreaterThanOrEqual(35);
  });
});

describe("charts.json", () => {
  it("covers every web component registered upstream", () => {
    expect(charts.charts.length).toBeGreaterThanOrEqual(11);
    for (const tag of ["line-chart", "bar-chart", "pie-chart", "map-chart", "data-box"]) {
      expect(charts.charts.some((c) => c.name === tag), `graphique ${tag} absent`).toBe(true);
    }
  });

  it("ships the four cross-cutting guides with real content", () => {
    const names = charts.guides.map((g) => g.name).sort();
    expect(names).toEqual(["accessibility", "colors", "databox", "install"]);
    for (const guide of charts.guides) {
      expect(guide.markdown.length, `guide ${guide.name} vide`).toBeGreaterThan(500);
    }
  });

  it("documents the seven palettes and the colour tokens", () => {
    // Compared as a set: the README's listing order is upstream's business.
    expect(new Set(charts.palettes.map((p) => p.name))).toEqual(
      new Set([
        "default",
        "neutral",
        "categorical",
        "sequentialAscending",
        "sequentialDescending",
        "divergentAscending",
        "divergentDescending",
      ]),
    );
    expect(charts.colorTokens.length).toBeGreaterThanOrEqual(17);
    for (const token of charts.colorTokens) {
      expect(token.light).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(token.dark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("gives every chart at least one attribute, actually typed", () => {
    for (const chart of charts.charts) {
      expect(chart.params.length, `${chart.name} sans attribut`).toBeGreaterThan(0);
      for (const param of chart.params) {
        expect(param.name, `${chart.name}: attribut sans nom`).toBeTruthy();
        expect(param.name).toMatch(/^[a-z][a-z0-9-]*$/);
        // The type comes from parseVueProps; blanking it would make
        // get_chart_doc print "type non déclaré" everywhere, unnoticed.
        expect(param.type, `${chart.name}.${param.name} sans type`).toMatch(
          /^[A-Z][A-Za-z]*( \| [A-Z][A-Za-z]*)*$/,
        );
      }
    }
  });

  it("keeps the meaning extracted from the upstream README, not just the Vue props", () => {
    // Without this, a parser regression (renamed anchor, changed bullet format)
    // leaves charts.json structurally valid and semantically empty: get_chart_doc
    // would return the prop list, which is already readable in the code.
    // Floor rather than an exact count: dsfr-chart 2.0.5 documents 9 of its 11
    // components, 2.1.1 documents 10. Both are healthy; zero is not.
    const documentedCharts = charts.charts.filter((c) => c.documented);
    expect(documentedCharts.length).toBeGreaterThanOrEqual(8);

    const params = charts.charts.flatMap((c) => c.params);
    const described = params.filter((p) => p.documented && p.description.length > 0);
    expect(described.length / params.length).toBeGreaterThan(0.6);

    // Enumerated values only the README carries. Asserted across the catalogue
    // rather than on one chart: which charts spell the palette list out varies
    // between upstream releases (bar-chart does in 2.1.1, not in 2.0.5).
    const enumerated = params.filter((p) => p.allowedValues && p.allowedValues.length > 0);
    expect(enumerated.length).toBeGreaterThanOrEqual(5);
    expect(enumerated.flatMap((p) => p.allowedValues!)).toContain("sequentialAscending");

    // An example only the README carries.
    expect(charts.charts.flatMap((c) => c.examples).length).toBeGreaterThanOrEqual(20);
  });

  it("keeps the upstream documentation gaps visible instead of hiding them", () => {
    // table-chart is registered by src/charts/main.js but has no README section.
    const table = charts.charts.find((c) => c.name === "table-chart")!;
    expect(table.documented).toBe(false);
    const text = getChartDoc(charts, "table-chart").content[0].text;
    expect(text).toContain("n'a pas de section dédiée");
  });

  it("answers for the documented charts with required attributes and examples", () => {
    const text = getChartDoc(charts, "bar-chart").content[0].text;
    expect(text).toContain("## Attributs obligatoires");
    expect(text).toContain("## Exemples");
    expect(text).toContain("<bar-chart");
  });
});
