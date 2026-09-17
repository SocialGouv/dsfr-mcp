import { describe, it, expect, beforeEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCharts, getChartDoc, loadIndex, searchComponents } from "../core.js";
import { LRUCache } from "../cache.js";
import type { ChartsIndex } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

describe("loadCharts", () => {
  it("should load and parse the charts index", () => {
    const charts = loadCharts(FIXTURES_DIR);
    expect(charts.package).toBe("@gouvfr/dsfr-chart");
    expect(charts.charts).toBeInstanceOf(Array);
    expect(charts.charts.length).toBeGreaterThan(0);
  });

  it("should throw when the charts index does not exist", () => {
    expect(() => loadCharts("/nonexistent/path")).toThrow(/Charts index not found/);
  });
});

describe("getChartDoc", () => {
  let charts: ChartsIndex;

  beforeEach(() => {
    charts = loadCharts(FIXTURES_DIR);
  });

  it("resolves a chart by its tag name", () => {
    const text = getChartDoc(charts, "bar-chart").content[0].text;
    expect(text).toContain("<bar-chart>");
    expect(text).toContain("Graphique en barre");
    expect(text).toContain("@gouvfr/dsfr-chart v2.1.1");
  });

  it("resolves a chart by its PascalCase component name and is case-insensitive", () => {
    expect(getChartDoc(charts, "BarChart").content[0].text).toContain("<bar-chart>");
    expect(getChartDoc(charts, "BAR-CHART").content[0].text).toContain("<bar-chart>");
    expect(getChartDoc(charts, "barchart").content[0].text).toContain("<bar-chart>");
  });

  it("accepts the tag written with its angle brackets", () => {
    expect(getChartDoc(charts, "<bar-chart>").content[0].text).toContain("Graphique en barre");
  });

  it("separates required, optional and undocumented attributes", () => {
    const text = getChartDoc(charts, "bar-chart").content[0].text;
    expect(text).toContain("## Attributs obligatoires");
    expect(text).toContain("`x` (String)");
    expect(text).toContain("## Attributs optionnels");
    expect(text).toContain("## Attributs non documentés en amont");
    expect(text).toContain("`sub-x`");
  });

  it("lists the allowed values of an enumerated attribute", () => {
    const text = getChartDoc(charts, "bar-chart").content[0].text;
    expect(text).toContain("Valeurs : `default`, `neutral`, `categorical`");
  });

  it("returns ready-to-use examples with their label", () => {
    const text = getChartDoc(charts, "bar-chart").content[0].text;
    expect(text).toContain("### Barres horizontales");
    expect(text).toContain('horizontal="true"');
  });

  it("repeats the RGAA warning on every chart answer", () => {
    for (const chart of charts.charts) {
      expect(getChartDoc(charts, chart.name).content[0].text).toContain("non conformes au RGAA");
    }
  });

  it("says so when a registered component has no upstream documentation", () => {
    const text = getChartDoc(charts, "table-chart").content[0].text;
    expect(text).toContain("n'a pas de section dédiée");
    expect(text).toContain("TableChart");
  });

  it("serves the cross-cutting guides by name", () => {
    expect(getChartDoc(charts, "install").content[0].text).toContain("npm install @gouvfr/dsfr-chart");
    expect(getChartDoc(charts, "accessibility").content[0].text).toContain("inaccessibles");
    expect(getChartDoc(charts, "colors").content[0].text).toContain("dsfr-chart-colors-neutral");
  });

  it("does not repeat the warning inside the accessibility guide itself", () => {
    const text = getChartDoc(charts, "accessibility").content[0].text;
    expect(text.match(/non conformes au RGAA/g)).toBeNull();
  });

  it("suggests alternatives and the full catalogue when the name is unknown", () => {
    const text = getChartDoc(charts, "bar").content[0].text;
    expect(text).toContain("non trouvé");
    expect(text).toContain("bar-chart");
    expect(text).toContain("Sujets transverses");
  });

  it("redirects to the component tools when asked for a CSS component", () => {
    const text = getChartDoc(charts, "button").content[0].text;
    expect(text).toContain("non trouvé");
    expect(text).toContain("list_components");
    // A near-miss must not be dressed up as a chart.
    expect(text).not.toContain("## Attributs obligatoires");
  });

  it("points from a cross-cutting topic to the component that shares its name", () => {
    // "databox" names both the guide and an alias of <data-box>. The guide
    // wins, as advertised — but it must not be a dead end.
    const text = getChartDoc(charts, "DataBox").content[0].text;
    expect(text).toContain("DataBox : tableaux de bord");
    expect(text).toContain('get_chart_doc(name="data-box")');
  });

  it("reports cleanly when the charts index is empty rather than throwing", () => {
    const empty: ChartsIndex = {
      version: "",
      package: "@gouvfr/dsfr-chart",
      repository: "",
      charts: [],
      guides: [],
      palettes: [],
      colorTokens: [],
    };
    expect(getChartDoc(empty, "bar-chart").content[0].text).toContain("indisponible");
  });
});

describe("searchComponents with charts", () => {
  it("surfaces charts in a separate block pointing at get_chart_doc", () => {
    const index = loadIndex(FIXTURES_DIR);
    const charts = loadCharts(FIXTURES_DIR);
    const text = searchComponents(
      index,
      FIXTURES_DIR,
      "graphique",
      new LRUCache<string, string>(50),
      charts,
    ).content[0].text;

    expect(text).toContain("Visualisations de données");
    expect(text).toContain("**bar-chart**");
    expect(text).toContain('get_chart_doc(name="bar-chart")');
  });

  it("matches on an attribute name, not just on the title", () => {
    const index = loadIndex(FIXTURES_DIR);
    const charts = loadCharts(FIXTURES_DIR);
    const text = searchComponents(
      index,
      FIXTURES_DIR,
      "selected-palette",
      new LRUCache<string, string>(50),
      charts,
    ).content[0].text;
    expect(text).toContain("**bar-chart**");
  });

  it("leaves the output unchanged when no charts are passed", () => {
    const index = loadIndex(FIXTURES_DIR);
    const without = searchComponents(index, FIXTURES_DIR, "bouton", new LRUCache<string, string>(50));
    expect(without.content[0].text).not.toContain("Visualisations de données");
  });

  it("ranks chart hits and caps them, instead of dumping the catalogue", () => {
    const index = loadIndex(FIXTURES_DIR);
    const charts = loadCharts(FIXTURES_DIR);
    // "x" appears in an attribute name of every chart in the fixture; without
    // ranking, a term that common would return them all in file order.
    const text = searchComponents(
      index,
      FIXTURES_DIR,
      "bar-chart",
      new LRUCache<string, string>(50),
      charts,
    ).content[0].text;
    const block = text.split("Visualisations de données")[1];
    expect(block).toBeDefined();
    // An exact tag match must come first.
    expect(block.indexOf("**bar-chart**")).toBeLessThan(
      block.includes("**table-chart**") ? block.indexOf("**table-chart**") : Infinity,
    );
  });

  it("still reports no results when neither components nor charts match", () => {
    const index = loadIndex(FIXTURES_DIR);
    const charts = loadCharts(FIXTURES_DIR);
    const text = searchComponents(
      index,
      FIXTURES_DIR,
      "xyznonexistent",
      new LRUCache<string, string>(50),
      charts,
    ).content[0].text;
    expect(text).toContain("Aucun résultat");
  });
});
