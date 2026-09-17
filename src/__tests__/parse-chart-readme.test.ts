import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  parseChartReadme,
  parseVueProps,
  buildChartsIndex,
  type ParsedReadme,
} from "../../scripts/parse-chart-readme.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

describe("parseVueProps", () => {
  it("reads Options API props with type, required and default", () => {
    const props = parseVueProps(`
export default {
  name: 'BarChart',
  props: {
    x: { type: String, required: true },
    barSize: { type: [Number, String], default: 'flex' },
    horizontal: { type: [Boolean, String], default: false },
  },
  data() { return { chart: null } },
}`);
    expect(props).toEqual([
      { prop: "x", attribute: "x", type: "String", required: true },
      { prop: "barSize", attribute: "bar-size", type: "Number | String", required: false, default: "'flex'" },
      { prop: "horizontal", attribute: "horizontal", type: "Boolean | String", required: false, default: "false" },
    ]);
  });

  it("reads <script setup> defineProps and survives a nested validator", () => {
    const props = parseVueProps(`
const props = defineProps({
  id: { type: String, required: true },
  headingLevel: {
    type: String,
    default: 'h3',
    validator: (value) => ['h1', 'h2', 'h3'].includes(value),
  },
  actions: { type: [Array, String], default: [] },
});`);
    expect(props.map((p) => p.attribute)).toEqual(["id", "heading-level", "actions"]);
    expect(props[1]).toMatchObject({ type: "String", default: "'h3'", required: false });
    expect(props[2].type).toBe("Array | String");
  });

  it("returns an empty list when the file declares no props", () => {
    expect(parseVueProps("<template><div/></template>")).toEqual([]);
  });
});

describe("parseChartReadme (on a verbatim upstream excerpt)", () => {
  let readme: string;
  let parsed: ParsedReadme;

  beforeAll(() => {
    readme = readFileSync(join(FIXTURES_DIR, "chart-readme.md"), "utf-8");
    parsed = parseChartReadme(readme);
  });

  it("finds a chart per `balise` anchor, and nothing else", () => {
    expect([...parsed.charts.keys()].sort()).toEqual([
      "data-box",
      "line-chart",
      "map-chart",
      "map-chart-reg",
    ]);
  });

  it("does not mistake a cross-cutting H2 for a chart", () => {
    // `## Gestion des couleurs` and `## Accessibilité` are nested under
    // `# DataBox` upstream; splitting on heading depth would capture them.
    expect(parsed.charts.has("gestion-des-couleurs")).toBe(false);
    expect(parsed.guides.map((g) => g.name).sort()).toEqual([
      "accessibility",
      "colors",
      "databox",
      "install",
    ]);
    expect(parsed.guides.find((g) => g.name === "accessibility")!.markdown).toContain(
      "Non-conformités",
    );
    expect(parsed.guides.find((g) => g.name === "install")!.markdown).toContain("# DSFR Chart");
  });

  it("separates required from optional attributes", () => {
    const line = parsed.charts.get("line-chart")!;
    expect(line.params.get("x")!.description).toContain("axe des abscisses");
    expect(line.params.get("unit-tooltip")!.type).toBe("String");
    // `x-min` is documented without a type upstream.
    expect(line.params.get("x-min")!.type).toBeUndefined();
  });

  it("collects the allowed values of selected-palette", () => {
    const line = parsed.charts.get("line-chart")!;
    expect(line.params.get("selected-palette")!.allowedValues).toEqual([
      "default",
      "neutral",
      "categorical",
      "sequentialAscending",
      "sequentialDescending",
      "divergentAscending",
      "divergentDescending",
    ]);
    expect(parsed.palettes.map((p) => p.name)).toHaveLength(7);
  });

  it("parses the DataBox bullet format, with its inline default", () => {
    const box = parsed.charts.get("data-box")!;
    expect(box.params.get("id")).toMatchObject({ type: "String" });
    expect(box.params.get("heading-level")).toMatchObject({ type: "String", default: "'h3'" });
    expect(box.params.get("segmented-control")!.default).toBe("true");
  });

  it("labels each example with the heading above it, not the boilerplate `## Exemple :`", () => {
    const line = parsed.charts.get("line-chart")!;
    expect(line.examples.map((e) => e.label)).toContain("Graphique en ligne simple");
    expect(line.examples.every((e) => e.code.includes("<line-chart"))).toBe(true);

    const map = parsed.charts.get("map-chart")!;
    expect(map.examples[0].label).toBe("Carte avec découpage par départements");
  });

  it("extracts the chart nested under `# Cartes (MapChart)` without stealing its parent's content", () => {
    const reg = parsed.charts.get("map-chart-reg")!;
    expect(reg.title).toBe("Carte régionale détaillée (MapChartReg)");
    expect(reg.params.get("region")!.description).toContain("Code de la région");
    expect(reg.examples).toHaveLength(1);
    expect(reg.examples[0].code).toContain("<map-chart-reg");
    // The notes that follow belong to MapChart, not to MapChartReg.
    expect(reg.notes).toHaveLength(0);
    expect(parsed.charts.get("map-chart")!.notes.join(" ")).toContain("level");
  });

  it("merges the `Résumé des paramètres` tables into the right chart", () => {
    // `level` only exists on map-chart, `region` only on map-chart-reg.
    expect(parsed.charts.get("map-chart")!.params.has("level")).toBe(true);
    expect(parsed.charts.get("map-chart-reg")!.params.has("level")).toBe(false);
    expect(parsed.charts.get("map-chart-reg")!.params.get("value")!.description).toContain(
      "régionale",
    );
  });

  it("collects the notes and the usage tips", () => {
    const line = parsed.charts.get("line-chart")!;
    expect(line.notes.join(" ")).toContain("unit-tooltip");
    expect(line.notes.join(" ")).toContain("Format des données");
  });
});

describe("buildChartsIndex", () => {
  const readme = () => readFileSync(join(FIXTURES_DIR, "chart-readme.md"), "utf-8");
  const base = {
    registry: { "line-chart": "LineChart", "table-chart": "TableChart" },
    components: {
      LineChart: `export default { props: {
        x: { type: String, required: true },
        unitTooltip: { type: String, default: '' },
        vline: { type: String, default: '' },
      } }`,
      TableChart: `export default { props: {
        maxOverflow: { type: [Number, String], default: 128 },
      } }`,
    },
    colors: { light: { "dsfr-chart-colors-01": "#5C68E5" }, dark: { "dsfr-chart-colors-01": "#4A55C9" } },
    version: "v2.1.1",
    packageName: "@gouvfr/dsfr-chart",
    repository: "https://github.com/GouvernementFR/dsfr-chart",
  };

  it("takes existence and type from the code, meaning from the README", () => {
    const index = buildChartsIndex({ readme: readme(), ...base });
    const line = index.charts.find((c) => c.name === "line-chart")!;

    const x = line.params.find((p) => p.name === "x")!;
    expect(x.required).toBe(true);
    expect(x.description).toContain("axe des abscisses");

    const unit = line.params.find((p) => p.name === "unit-tooltip")!;
    expect(unit.prop).toBe("unitTooltip");
    expect(unit.documented).toBe(true);
  });

  it("keeps attributes that exist in the code but not in the README, and flags them", () => {
    const index = buildChartsIndex({ readme: readme(), ...base });
    const vline = index.charts
      .find((c) => c.name === "line-chart")!
      .params.find((p) => p.name === "vline")!;
    expect(vline.documented).toBe(false);
    expect(vline.description).toBe("");
  });

  it("keeps a registered component with no README section, marked undocumented", () => {
    const index = buildChartsIndex({ readme: readme(), ...base });
    const table = index.charts.find((c) => c.name === "table-chart")!;
    expect(table.documented).toBe(false);
    expect(table.params.map((p) => p.name)).toContain("max-overflow");
  });

  it("flags attributes the summary table calls mandatory while the code has a default", () => {
    const index = buildChartsIndex({
      readme: readme(),
      ...base,
      registry: { "map-chart": "MapChart" },
      components: {
        MapChart: `export default { props: {
          data: { type: String, required: true },
          name: { type: String, default: 'Données' },
        } }`,
      },
    });
    const name = index.charts[0].params.find((p) => p.name === "name")!;
    expect(name.required).toBe(false);
    expect(name.description).toContain("Nom de l’indicateur");
    expect(name.description).toContain("documenté comme obligatoire en amont");
  });

  it("merges light and dark colour tokens", () => {
    const index = buildChartsIndex({ readme: readme(), ...base });
    expect(index.colorTokens).toEqual([
      { token: "dsfr-chart-colors-01", light: "#5C68E5", dark: "#4A55C9" },
    ]);
  });

  it("derives tolerant aliases from the component name", () => {
    const index = buildChartsIndex({ readme: readme(), ...base });
    const line = index.charts.find((c) => c.name === "line-chart")!;
    expect(line.aliases).toContain("LineChart");
    expect(line.aliases).toContain("linechart");
  });
});
