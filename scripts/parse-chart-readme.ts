// Pure, side-effect-free parsers for the @gouvfr/dsfr-chart sources. Kept
// separate from fetch-docs.ts (which clones repos and deletes docs/ on import)
// so they can be unit-tested against the real upstream files.
//
// Two sources, two authorities:
//   - the Vue components (`src/components/*.vue`) are authoritative for which
//     attributes exist, their type, whether they are required and their default;
//   - the README is authoritative for what they *mean*.
// The README is incomplete upstream (reference lines, drill-down, table-chart…),
// so a prop found in the code but absent from the README is kept and flagged
// `documented: false` rather than dropped.

import type {
  ChartColorToken,
  ChartEntry,
  ChartExample,
  ChartGuide,
  ChartParam,
  ChartPalette,
  ChartsIndex,
} from "../src/types.js";

/** Lowercase, strip accents and collapse whitespace, for tolerant title matching. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function kebab(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function camel(kebabName: string): string {
  return kebabName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

interface Heading {
  level: number;
  title: string;
  /** Index of the heading line itself. */
  line: number;
}

/**
 * Collect markdown headings, ignoring anything inside a fenced code block
 * (chart examples contain `#` in neither position, but install snippets do).
 */
function collectHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) headings.push({ level: m[1].length, title: m[2], line: i });
  }
  return headings;
}

// --- Vue props -------------------------------------------------------------

export interface VueProp {
  prop: string;
  attribute: string;
  type: string;
  required: boolean;
  default?: string;
}

/**
 * Extract the props of a Vue SFC, from either the Options API (`props: { … }`)
 * or `<script setup>` (`defineProps({ … })`). Both declare each prop as a
 * `name: { type, required?, default? }` block, which is all we need.
 */
export function parseVueProps(source: string): VueProp[] {
  // `defineProps({` wins over `props: {` when both appear: a `<script setup>`
  // component has no Options API block, but a component may well mention the
  // word "props" elsewhere.
  const opener =
    source.match(/defineProps\s*\(\s*\{/) ?? source.match(/(?:^|[^\w$.])props\s*:\s*\{/);
  if (!opener || opener.index === undefined) return [];

  // Walk braces from the opening `{` of the props object to its match, so a
  // nested `validator: (v) => [...]` does not terminate the block early.
  const open = opener.index + opener[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];
  const body = source.slice(open + 1, end);

  const props: VueProp[] = [];
  // Each entry: `name: {` … `}` at depth 1 of the props object.
  const entryRe = /(\w+)\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body))) {
    const name = m[1];
    let d = 1;
    let i = m.index + m[0].length;
    for (; i < body.length && d > 0; i++) {
      if (body[i] === "{") d++;
      else if (body[i] === "}") d--;
    }
    const block = body.slice(m.index + m[0].length, i - 1);
    // Skip nested option objects (a prop block always declares a `type`).
    const typeMatch = block.match(/type\s*:\s*(\[[^\]]*\]|\w+)/);
    if (!typeMatch) continue;
    const type = typeMatch[1]
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .join(" | ");
    const required = /required\s*:\s*true/.test(block);
    const defaultMatch = block.match(/default\s*:\s*(.+?)\s*,?\s*$/m);
    const prop: VueProp = { prop: name, attribute: kebab(name), type, required };
    if (defaultMatch && !required) prop.default = defaultMatch[1].replace(/,$/, "").trim();
    props.push(prop);
    entryRe.lastIndex = i;
  }
  return props;
}

// --- README ----------------------------------------------------------------

interface ReadmeChart {
  tag: string;
  title: string;
  description: string;
  params: Map<
    string,
    {
      description: string;
      type?: string;
      default?: string;
      allowedValues?: string[];
      /** "obligatoire: oui" in a summary table, when the code says otherwise. */
      requiredHint?: boolean;
    }
  >;
  examples: ChartExample[];
  notes: string[];
}

export interface ParsedReadme {
  charts: Map<string, ReadmeChart>;
  guides: ChartGuide[];
  palettes: ChartPalette[];
  /**
   * Attributes documented once, in prose, for every chart at a time — upstream
   * describes `databox-id`/`databox-type`/`databox-source` in the DataBox
   * section rather than in each chart's parameter list.
   */
  sharedParams: Map<string, string>;
}

// Upstream uses three heading styles for attributes: "Obligatoires :" /
// "Optionnels :" on charts, "Props" + "Obligatoires" / "Optionnelles" on
// DataBox, and "Paramètres spécifiques :" on the nested MapChartReg.
const PARAM_SECTION = /^(obligatoire|optionn|props|parametres?\b)/;
const NOTE_SECTION = /^(notes supplementaires|conseils d'utilisation)/;
const EXAMPLE_TITLE = /^exemples?\s*:?$/;

/** Titles that end the DataBox component section and open the cross-cutting part. */
const GUIDE_ANCHORS: Array<{ name: string; match: RegExp }> = [
  { name: "databox", match: /^mise en place du graphique/ },
  { name: "colors", match: /^gestion des couleurs$/ },
  { name: "accessibility", match: /^accessibilite$/ },
];
const GUIDE_TITLES: Record<string, string> = {
  install: "Installation et intégration",
  databox: "DataBox : tableaux de bord et alternative accessible",
  colors: "Gestion des couleurs et palettes",
  accessibility: "Accessibilité : non-conformités et alternatives obligatoires",
};

/** Parse a `- **name** …` bullet, in either of the two upstream formats. */
function parseParamBullet(
  line: string,
): { name: string; type?: string; default?: string; description: string } | null {
  const m = line.match(/^-\s+\*\*([^*]+)\*\*\s*(.*)$/);
  if (!m) return null;
  const name = m[1].trim();
  let rest = m[2];

  // Type: `` `(String)` `` (DataBox) or `_(String)_` (charts).
  let type: string | undefined;
  const typeMatch = rest.match(/`\(([^)]+)\)`|_\(([^)]+)\)_/);
  if (typeMatch) {
    type = (typeMatch[1] ?? typeMatch[2]).trim();
    rest = rest.replace(typeMatch[0], " ");
  }

  // Default: `(défaut : 'h3')`.
  let def: string | undefined;
  const defMatch = rest.match(/\(d[ée]faut\s*:\s*([^)]*)\)/i);
  if (defMatch) {
    def = defMatch[1].trim();
    rest = rest.replace(defMatch[0], " ");
  }

  const description = rest.replace(/^\s*:\s*/, "").replace(/\s+/g, " ").trim();
  return { name, type, default: def, description };
}

/** Nested bullet listing an allowed value: ``- `'categorical'` : Palette…`` */
function parseAllowedValue(line: string): string | null {
  const m = line.match(/^\s+-\s+`'([^']+)'`/);
  return m ? m[1] : null;
}

/**
 * Turn the dsfr-chart README into per-chart documentation plus the
 * cross-cutting guides. Sections are located by content anchors (the
 * ``balise : `<tag>` `` sentence, heading titles) rather than by heading depth:
 * upstream nests the cross-cutting `## Gestion des couleurs` and
 * `## Accessibilité` under `# DataBox`, so depth alone would misattribute them.
 */
export function parseChartReadme(markdown: string): ParsedReadme {
  const lines = markdown.split("\n");
  const headings = collectHeadings(lines);

  const charts = new Map<string, ReadmeChart>();
  const guides: ChartGuide[] = [];
  const palettes: ChartPalette[] = [];
  const sharedParams = new Map<string, string>();

  const catalogHeading = headings.find((h) => h.level === 1 && normalize(h.title) === "graphiques disponibles");
  const catalogStart = catalogHeading ? catalogHeading.line : lines.length;

  // Everything above the catalog is the installation guide.
  guides.push({
    name: "install",
    title: GUIDE_TITLES.install,
    markdown: lines.slice(0, catalogStart).join("\n").trim(),
  });

  // Cross-cutting sections, located by title wherever upstream nested them.
  const anchorLines = new Map<string, number>();
  for (const { name, match } of GUIDE_ANCHORS) {
    const h = headings.find((x) => x.line > catalogStart && match.test(normalize(x.title)));
    if (h) anchorLines.set(name, h.line);
  }
  const contribution = headings.find((h) => normalize(h.title) === "contribution");
  // Bounded by the closing section too: if every guide anchor were renamed
  // upstream, the last chart would otherwise run to the end of the file and
  // swallow the contribution snippets as if they were its own examples.
  const tailStart = Math.min(
    ...[...anchorLines.values(), contribution?.line ?? lines.length, lines.length].filter((n) =>
      Number.isFinite(n),
    ),
  );

  const guideBounds: Array<[string, number, number]> = [];
  const ordered = GUIDE_ANCHORS.map((a) => a.name).filter((n) => anchorLines.has(n));
  for (let i = 0; i < ordered.length; i++) {
    const from = anchorLines.get(ordered[i])!;
    const to =
      i + 1 < ordered.length
        ? anchorLines.get(ordered[i + 1])!
        : contribution
          ? contribution.line
          : lines.length;
    guideBounds.push([ordered[i], from, to]);
  }
  for (const [name, from, to] of guideBounds) {
    const markdown = lines.slice(from, to).join("\n").trim();
    guides.push({ name, title: GUIDE_TITLES[name] ?? name, markdown });
    // Plain (non-bold) bullets describing an attribute shared by every chart.
    for (const line of markdown.split("\n")) {
      const m = line.match(/^-\s+([a-z][a-z0-9-]*)\s*:\s*(.+)$/);
      if (m && !sharedParams.has(m[1])) sharedParams.set(m[1], m[2].replace(/\s+/g, " ").trim());
    }
  }

  // Chart sections. The catalog is *mostly* one H1 per chart, but upstream
  // documents MapChartReg as an H3 nested inside `# Cartes (MapChart)`. So a
  // chart is located by its ``balise : `<tag>` `` sentence and owns the heading
  // that precedes it, whatever its depth; a nested chart's range is then carved
  // out of its parent's so the parent keeps its own notes and examples.
  interface ChartBlock {
    tag: string;
    heading: Heading;
    from: number;
    to: number;
    /** Ranges owned by a nested chart, to skip when scanning this block. */
    holes: Array<[number, number]>;
  }

  const anchors: Array<{ tag: string; heading: Heading }> = [];
  for (let i = catalogStart; i < tailStart; i++) {
    const m = lines[i].match(/balise\s*:\s*`<([a-z-]+)>`/);
    if (!m) continue;
    const owner = [...headings].reverse().find((h) => h.line < i);
    if (owner) anchors.push({ tag: m[1], heading: owner });
  }
  // DataBox has no balise sentence upstream; its H1 is the anchor.
  const dataBoxHeading = headings.find(
    (h) => h.level === 1 && h.line > catalogStart && normalize(h.title) === "databox",
  );
  if (dataBoxHeading) anchors.push({ tag: "data-box", heading: dataBoxHeading });
  anchors.sort((a, b) => a.heading.line - b.heading.line);

  const blocks: ChartBlock[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const { tag, heading } = anchors[i];
    if (heading.level === 1) {
      // Top-level chart: runs to the next top-level chart, or to the tail.
      const nextTop = anchors.slice(i + 1).find((a) => a.heading.level === 1);
      blocks.push({
        tag,
        heading,
        from: heading.line,
        to: Math.min(nextTop?.heading.line ?? tailStart, tailStart),
        holes: [],
      });
      continue;
    }
    // Nested chart: ends at the first following heading at the same depth or
    // shallower, skipping the boilerplate `## Exemple :` that upstream always
    // inserts between a chart's own heading and its code fence.
    const end =
      headings.find(
        (h) =>
          h.line > heading.line &&
          h.level <= heading.level &&
          !EXAMPLE_TITLE.test(normalize(h.title)),
      )?.line ?? tailStart;
    blocks.push({ tag, heading, from: heading.line, to: Math.min(end, tailStart), holes: [] });
    // Innermost enclosing block, not the first one found: `blocks` is built
    // outside-in, so `find` would hand the hole to the outermost ancestor and
    // leave an intermediate chart swallowing its child's attributes.
    const parent = [...blocks]
      .reverse()
      .find((b) => b.from < heading.line && b.to > heading.line);
    if (parent) parent.holes.push([heading.line, Math.min(end, tailStart)]);
  }

  for (const { tag, heading, from, to, holes } of blocks) {
    const inHole = (line: number) => holes.some(([a, b]) => line >= a && line < b);
    const block: string[] = [];
    for (let i = from; i < to; i++) {
      if (inHole(i)) continue;
      block.push(lines[i]);
    }

    const chart: ReadmeChart = {
      tag,
      title: heading.title.trim().replace(/^\d+\.\s*/, ""),
      description: "",
      params: new Map(),
      examples: [],
      notes: [],
    };

    // Description: the prose between the heading and the first sub-heading.
    // For most charts that is only the `balise` sentence, which is still the
    // most informative line available, so keep it rather than reaching further.
    const intro: string[] = [];
    for (const raw of block.slice(1)) {
      const l = raw.trim();
      if (l.startsWith("#")) break;
      if (!l || l.startsWith("```") || l.startsWith("---")) continue;
      intro.push(l);
    }
    chart.description =
      (intro.find((l) => !/balise\s*:/.test(l)) ?? intro[0] ?? "").replace(/\s+/g, " ").trim();

    let lastLabel = "";
    let section: "params" | "notes" | "" = "";
    let lastParam: string | null = null;

    for (let j = 0; j < block.length; j++) {
      const raw = block[j];

      // Fenced example.
      const fence = raw.match(/^```(\w*)\s*$/);
      if (fence) {
        const code: string[] = [];
        let k = j + 1;
        for (; k < block.length && !/^```\s*$/.test(block[k]); k++) code.push(block[k]);
        chart.examples.push({ label: lastLabel, code: code.join("\n").trim() });
        j = k;
        continue;
      }

      const sub = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (sub) {
        const title = sub[2].trim();
        const n = normalize(title);
        if (PARAM_SECTION.test(n)) {
          section = "params";
        } else if (NOTE_SECTION.test(n)) {
          section = "notes";
        } else {
          section = "";
        }
        // Keep a meaningful label for the next code fence: "## Exemple :" is
        // upstream boilerplate that always follows the real "### 2. Barres…".
        if (!EXAMPLE_TITLE.test(n) && !PARAM_SECTION.test(n) && !NOTE_SECTION.test(n)) {
          lastLabel = title.replace(/^\d+\.\s*/, "");
        }
        lastParam = null;
        continue;
      }

      if (section === "params") {
        const bullet = parseParamBullet(raw);
        if (bullet) {
          chart.params.set(bullet.name, {
            description: bullet.description,
            type: bullet.type,
            default: bullet.default,
          });
          lastParam = bullet.name;
          continue;
        }
        const value = parseAllowedValue(raw);
        if (value && lastParam) {
          const entry = chart.params.get(lastParam)!;
          entry.allowedValues = [...(entry.allowedValues ?? []), value];
          // The palette list is the same everywhere; collect it once.
          if (lastParam === "selected-palette" && !palettes.some((p) => p.name === value)) {
            const desc = raw.split(":").slice(1).join(":").replace(/\s+/g, " ").trim();
            palettes.push({ name: value, description: desc });
          }
          continue;
        }
      }

      if (section === "notes") {
        const m = raw.match(/^-\s+(.*)$/);
        if (m) {
          chart.notes.push(
            m[1]
              .replace(/\*\*/g, "")
              .replace(/\s+/g, " ")
              .trim(),
          );
        }
      }
    }
    charts.set(tag, chart);
  }

  // `## Résumé des paramètres de MapChart` tables. Upstream only provides them
  // for the map charts, and they are the sole documentation of MapChartReg's
  // inherited attributes, so they are merged in without overwriting a richer
  // bullet description.
  const byComponent = new Map<string, ReadmeChart>();
  for (const chart of charts.values()) {
    byComponent.set(normalize(chart.tag.replace(/-/g, "")), chart);
  }
  for (const h of headings) {
    const m = normalize(h.title).match(/^resume des parametres de (.+)$/);
    if (!m) continue;
    const chart = byComponent.get(m[1].replace(/\s+/g, ""));
    if (!chart) continue;
    for (let i = h.line + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,6}\s/.test(line)) break;
      const cells = line.match(/^\|(.+)\|\s*$/);
      if (!cells) continue;
      const [name, type, required, description] = cells[1]
        .split("|")
        .map((c) => c.replace(/\*\*/g, "").replace(/\s+/g, " ").trim());
      if (!name || /^:?-+:?$/.test(name) || normalize(name) === "parametre") continue;
      const existing = chart.params.get(name);
      chart.params.set(name, {
        description: existing?.description || description || "",
        type: existing?.type ?? type,
        default: existing?.default,
        allowedValues: existing?.allowedValues,
        requiredHint: normalize(required) === "oui",
      });
    }
  }

  return { charts, guides, palettes, sharedParams };
}

// --- Merge -----------------------------------------------------------------

/** Human-readable French titles, keyed by tag, for charts the README leaves out. */
const FALLBACK_TITLES: Record<string, string> = {
  "table-chart": "Tableau de données (TableChart)",
};

function buildAliases(tag: string, component: string): string[] {
  const aliases = new Set<string>([component, component.toLowerCase(), tag.replace(/-/g, "")]);
  aliases.delete(tag);
  return [...aliases];
}

/**
 * Merge the Vue props (authoritative for existence/type/default) with the
 * README (authoritative for meaning) into the served chart index.
 */
export function buildChartsIndex(input: {
  readme: string;
  /** Vue SFC sources, keyed by component name (e.g. "BarChart"). */
  components: Record<string, string>;
  /** Tag -> component name, as registered by `src/charts/main.js`. */
  registry: Record<string, string>;
  /** `src/assets/colors.json`, `{ light: {...}, dark: {...} }`. */
  colors: { light: Record<string, string>; dark: Record<string, string> };
  version: string;
  packageName: string;
  repository: string;
}): ChartsIndex {
  const parsed = parseChartReadme(input.readme);

  const charts: ChartEntry[] = [];
  for (const [tag, component] of Object.entries(input.registry)) {
    const source = input.components[component];
    const vueProps = source ? parseVueProps(source) : [];
    const doc = parsed.charts.get(tag);

    const params: ChartParam[] = vueProps.map((vp) => {
      const shared = parsed.sharedParams.get(vp.attribute);
      const documented =
        doc?.params.get(vp.attribute) ??
        doc?.params.get(vp.prop) ??
        (shared ? { description: shared } : undefined);
      // The code is authoritative on `required`, but upstream summary tables
      // mark attributes as "obligatoire: oui" that the component declares with
      // a default (map-chart's `value`, `name`). Surfacing the discrepancy is
      // more useful than silently picking one side.
      let description = documented?.description ?? "";
      if (documented?.requiredHint && !vp.required) {
        const note =
          "documenté comme obligatoire en amont, bien que le composant déclare une valeur par défaut";
        description = description ? `${description.replace(/\.$/, "")} (${note})` : `Attribut ${note}.`;
      }
      const param: ChartParam = {
        name: vp.attribute,
        prop: vp.prop,
        type: vp.type,
        required: vp.required,
        description,
        documented: Boolean(documented),
      };
      if (vp.default !== undefined) param.default = vp.default;
      else if (documented?.default !== undefined) param.default = documented.default;
      if (documented?.allowedValues?.length) param.allowedValues = documented.allowedValues;
      return param;
    });

    // Attributes documented upstream but absent from the component (upstream
    // typos, or props inherited from a mixin): keep them, they are still real
    // documentation, but without a code-backed type.
    for (const [name, entry] of doc?.params ?? []) {
      if (params.some((p) => p.name === name || p.prop === name)) continue;
      params.push({
        name,
        prop: camel(name),
        type: entry.type ?? "",
        required: false,
        default: entry.default,
        description: entry.description,
        allowedValues: entry.allowedValues,
        documented: true,
      });
    }

    charts.push({
      name: tag,
      tag: `<${tag}>`,
      component,
      title: doc?.title ?? FALLBACK_TITLES[tag] ?? component,
      description: doc?.description ?? "",
      aliases: buildAliases(tag, component),
      documented: Boolean(doc),
      params,
      examples: doc?.examples ?? [],
      notes: doc?.notes ?? [],
    });
  }
  charts.sort((a, b) => a.name.localeCompare(b.name));

  const colorTokens: ChartColorToken[] = Object.keys(input.colors.light ?? {}).map((token) => ({
    token,
    light: input.colors.light[token],
    dark: input.colors.dark?.[token] ?? input.colors.light[token],
  }));

  return {
    version: input.version,
    package: input.packageName,
    repository: input.repository,
    charts,
    guides: parsed.guides,
    palettes: parsed.palettes,
    colorTokens,
  };
}
