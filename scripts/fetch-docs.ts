import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAccessibility } from "./parse-accessibility.js";
import { buildChartsIndex } from "./parse-chart-readme.js";
import type { ChartsIndex, DocsCounts, DocsMeta } from "../src/types.js";

// fileURLToPath, not .pathname: the latter stays percent-encoded, so a repo
// checked out under a path containing a space would resolve to a bogus dir.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_DIR = join(ROOT, ".dsfr-repo");
const DOCS_DIR = join(ROOT, "docs");
const REPO_URL = "https://github.com/GouvernementFR/dsfr.git";
const DSFR_TAG = process.env.DSFR_TAG ?? "v1.15.3";

const CHART_REPO_DIR = join(ROOT, ".dsfr-chart-repo");
const CHART_REPO_URL = "https://github.com/GouvernementFR/dsfr-chart.git";
const CHART_PACKAGE = "@gouvfr/dsfr-chart";
const DSFR_CHART_TAG = process.env.DSFR_CHART_TAG ?? "v2.1.1";

/** Version of the docs/ layout; bump when the on-disk structure changes. */
const SCHEMA_VERSION = 2;

function run(cmd: string, cwd?: string) {
  console.error(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function capture(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8" }).trim();
}

// Step 1: Clone or update the DSFR repo (sparse checkout at pinned tag)
console.error(`Using DSFR ${DSFR_TAG}`);
if (existsSync(join(REPO_DIR, ".git"))) {
  console.error("Updating existing DSFR repo...");
  run(`git fetch --depth=1 origin tag ${DSFR_TAG}`, REPO_DIR);
  run("git checkout FETCH_HEAD", REPO_DIR);
} else {
  console.error("Cloning DSFR repo (sparse)...");
  if (existsSync(REPO_DIR)) rmSync(REPO_DIR, { recursive: true });
  run(`git clone --filter=blob:none --sparse --depth=1 --branch ${DSFR_TAG} ${REPO_URL} ${REPO_DIR}`);
  run(
    "git sparse-checkout set src/dsfr/component src/dsfr/core src/dsfr/layout",
    REPO_DIR,
  );
}

// Step 1b: Clone or update DSFR Chart, BEFORE docs/ is wiped.
//
// The npm tarball ships no src/ — `"files": ["dist/*", "README.md", …]` — so the
// Vue sources and src/assets/colors.json are only reachable from git. All the
// network work happens here: a failure must not leave the committed docs/
// half-rebuilt, which it would if this ran after the rmSync below.
console.error(`Using DSFR Chart ${DSFR_CHART_TAG}`);
if (existsSync(join(CHART_REPO_DIR, ".git"))) {
  console.error("Updating existing DSFR Chart repo...");
  run(`git fetch --depth=1 origin tag ${DSFR_CHART_TAG}`, CHART_REPO_DIR);
  run("git checkout FETCH_HEAD", CHART_REPO_DIR);
} else {
  console.error("Cloning DSFR Chart repo (sparse)...");
  if (existsSync(CHART_REPO_DIR)) rmSync(CHART_REPO_DIR, { recursive: true });
  run(
    `git clone --filter=blob:none --sparse --depth=1 --branch ${DSFR_CHART_TAG} ${CHART_REPO_URL} ${CHART_REPO_DIR}`,
  );
  // Cone mode always includes root files, so README.md comes along.
  run("git sparse-checkout set src/assets src/charts src/components", CHART_REPO_DIR);
}

// Step 2: Extract docs into flat structure
if (existsSync(DOCS_DIR)) rmSync(DOCS_DIR, { recursive: true });
mkdirSync(DOCS_DIR, { recursive: true });

interface ComponentEntry {
  name: string;
  title: string;
  description: string;
  category: "component" | "core" | "layout" | "pattern";
  sections: string[];
}

const index: ComponentEntry[] = [];

function extractFrontmatter(content: string): { title: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { title: "", description: "" };
  const fm = match[1];
  const title = fm.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const description = fm.match(/^shortDescription:\s*(.+)$/m)?.[1]?.trim()
    ?? fm.match(/^description:\s*(.+)$/m)?.[1]?.trim()
    ?? "";
  return { title, description };
}

function processDocDir(docDir: string, name: string, category: ComponentEntry["category"]) {
  if (!existsSync(docDir)) return;

  const outDir = join(DOCS_DIR, category, name);
  mkdirSync(outDir, { recursive: true });

  const sections: string[] = [];

  // Copy main index.md as overview.md
  const mainIndex = join(docDir, "index.md");
  if (existsSync(mainIndex)) {
    cpSync(mainIndex, join(outDir, "overview.md"));
    sections.push("overview");
  }

  // Copy sub-sections (code, design, accessibility, demo)
  for (const sub of ["code", "design", "accessibility", "demo"]) {
    const subIndex = join(docDir, sub, "index.md");
    if (existsSync(subIndex)) {
      cpSync(subIndex, join(outDir, `${sub}.md`));
      sections.push(sub);
    }
  }

  if (sections.length === 0) return;

  // Extract metadata from overview or first available file
  const firstFile = join(outDir, `${sections[0]}.md`);
  const content = readFileSync(firstFile, "utf-8");
  const { title, description } = extractFrontmatter(content);

  index.push({
    name,
    title: title || name,
    description,
    category,
    sections,
  });
}

// Process components
const componentDir = join(REPO_DIR, "src/dsfr/component");
if (existsSync(componentDir)) {
  for (const entry of readdirSync(componentDir)) {
    if (entry.startsWith("_")) continue;
    const docDir = join(componentDir, entry, "_part/doc");
    processDocDir(docDir, entry, "component");
  }
}

// Process core.
//
// Since DSFR 1.15.0 a core topic can carry sub-pages: `color/usage` holds the
// decision tokens that used to live in `color/index.md`. They are extracted as
// extra sections of the parent entry (`color` -> overview + usage), mirroring
// what processDocDir does for components. The `*/search` sub-pages are skipped:
// they are 26-line stubs holding a client-side `::dsfr-doc-filter` widget and
// no content, and upstream flags them itself with `sitemap: noindex`.
const CORE_SKIPPED_SUBPAGES = new Set(["search"]);
/** Section names already produced by processDocDir; a sub-page must not shadow one. */
const RESERVED_SECTIONS = new Set(["overview", "code", "design", "accessibility", "demo"]);

const coreDocDir = join(REPO_DIR, "src/dsfr/core/_part/doc");
if (existsSync(coreDocDir)) {
  for (const entry of readdirSync(coreDocDir)) {
    const entryPath = join(coreDocDir, entry);
    if (entry === "index.md" || !statSync(entryPath).isDirectory()) continue;
    // Core sub-topics have their own index.md directly
    if (existsSync(join(entryPath, "index.md"))) {
      const outDir = join(DOCS_DIR, "core", entry);
      mkdirSync(outDir, { recursive: true });
      cpSync(join(entryPath, "index.md"), join(outDir, "overview.md"));
      const sections = ["overview"];

      // withFileTypes rather than statSync: stat follows symlinks and throws
      // ENOENT on a dangling one, which would abort the whole extraction.
      for (const sub of readdirSync(entryPath, { withFileTypes: true })) {
        if (!sub.isDirectory() || CORE_SKIPPED_SUBPAGES.has(sub.name)) continue;
        if (RESERVED_SECTIONS.has(sub.name)) {
          console.error(
            `Warning: sous-page "${entry}/${sub.name}" ignorée — "${sub.name}" est un nom de section réservé.`,
          );
          continue;
        }
        const subIndex = join(entryPath, sub.name, "index.md");
        if (!existsSync(subIndex)) continue;
        cpSync(subIndex, join(outDir, `${sub.name}.md`));
        sections.push(sub.name);
      }

      const content = readFileSync(join(outDir, "overview.md"), "utf-8");
      const { title, description } = extractFrontmatter(content);
      index.push({
        name: entry,
        title: title || entry,
        description,
        category: "core",
        sections,
      });
    }
  }
}

// Process layout
const layoutDir = join(REPO_DIR, "src/dsfr/layout");
if (existsSync(layoutDir)) {
  for (const entry of readdirSync(layoutDir)) {
    if (entry.startsWith("_")) continue;
    const docDir = join(layoutDir, entry, "_part/doc");
    processDocDir(docDir, entry, "layout");

    // Also check for sub-entries (e.g. layout/page/login)
    const subDir = join(layoutDir, entry);
    if (statSync(subDir).isDirectory()) {
      for (const sub of readdirSync(subDir)) {
        if (sub.startsWith("_")) continue;
        const subDocDir = join(subDir, sub, "_part/doc");
        if (existsSync(subDocDir)) {
          processDocDir(subDocDir, `${entry}/${sub}`, "layout");
        }
      }
    }
  }
}

// Sort index
index.sort((a, b) => a.name.localeCompare(b.name));

// Write index
writeFileSync(join(DOCS_DIR, "index.json"), JSON.stringify(index, null, 2));

// meta.json is written last: it carries the counts of every extractor, which
// double as the build-time sanity assertions below.

// Extract icons index
interface IconEntry {
  name: string;
  category: string;
  variants: string[];
  classes: string[];
}

function extractIcons(repoDir: string, docsDir: string): { icons: number; classes: number } {
  const iconBaseDir = join(repoDir, "src/dsfr/core/icon");
  if (!existsSync(iconBaseDir)) {
    console.error("Warning: icon directory not found, skipping icon extraction");
    return { icons: 0, classes: 0 };
  }

  const groups = new Map<string, { category: string; variants: Set<string>; classes: Set<string> }>();

  for (const category of readdirSync(iconBaseDir)) {
    const catDir = join(iconBaseDir, category);
    if (!statSync(catDir).isDirectory()) continue;

    for (const file of readdirSync(catDir)) {
      if (!file.endsWith(".svg")) continue;
      // 39 SVG files are named `fr--something.svg`: upstream marks DSFR-specific
      // icons (as opposed to Remix Icons) that way, and its build strips the
      // marker. The real class is `fr-icon-warning-fill`, never
      // `fr-icon-fr--warning-fill`. Verified against the published
      // dist/utility/icons/*.css: keeping the prefix yields 39 classes that
      // exist in no DSFR stylesheet, including error, success, warning and info.
      const raw = file.replace(/\.svg$/, "").replace(/^fr--/, "");
      const cssClass = `fr-icon-${raw}`;

      let baseName: string;
      let variant: string | null = null;

      const match = raw.match(/^(.*)-(?:fill|line)$/);
      if (match) {
        baseName = match[1];
        variant = raw.endsWith("-fill") ? "fill" : "line";
      } else {
        baseName = raw;
      }

      const key = `${category}/${baseName}`;
      let group = groups.get(key);
      if (!group) {
        group = { category, variants: new Set(), classes: new Set() };
        groups.set(key, group);
      }
      if (variant) group.variants.add(variant);
      group.classes.add(cssClass);
    }
  }

  const icons: IconEntry[] = [];
  for (const [key, group] of groups) {
    const name = key.split("/").slice(1).join("/");
    icons.push({
      name,
      category: group.category,
      variants: [...group.variants].sort(),
      classes: [...group.classes].sort(),
    });
  }

  icons.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  writeFileSync(join(docsDir, "icons.json"), JSON.stringify(icons, null, 2));
  const classes = new Set(icons.flatMap((i) => i.classes)).size;
  console.error(`Extracted ${icons.length} icons (${classes} CSS classes) across ${new Set(icons.map((i) => i.category)).size} categories`);
  return { icons: icons.length, classes };
}

// Extract colors index
interface ColorDecisionToken {
  token: string;
  context: "background" | "text" | "artwork";
  description: string;
  light: string;
  dark: string;
}

interface ColorFamily {
  name: string;
  category: "primaire" | "neutre" | "systeme" | "illustrative";
  correspondences: Record<string, { light: string; dark: string }>;
}

interface ColorsIndex {
  decisionTokens: ColorDecisionToken[];
  families: ColorFamily[];
  illustrativeNames: string[];
}

/**
 * Locate the two colour pages, which swapped files in DSFR 1.15.0:
 *
 *   <= 1.14.x : decisions in core/color/overview.md, palette in core/palette/overview.md
 *   >= 1.15.0 : decisions in core/color/usage.md,    palette in core/color/overview.md
 *
 * Detection is by layout rather than by tag so `DSFR_TAG=v1.14.3` keeps working.
 * Two signals are crossed rather than one: on a single signal, an upstream rename
 * of `color/usage` would silently fall back to the legacy layout and hand the
 * 1.15 *palette* page to the decision-token parser — 0 tokens, 0 families, no error.
 * Each candidate is then confirmed by its own content before being accepted.
 */
function resolveColorDocs(docsDir: string): { decisions?: string; palette?: string } {
  const usage = join(docsDir, "core/color/usage.md");
  const color = join(docsDir, "core/color/overview.md");
  const legacyPalette = join(docsDir, "core/palette/overview.md");

  /** A decision page carries `$background-*` / `$text-*` rows. */
  const holdsDecisions = (file: string) =>
    existsSync(file) && /\|\s*`\$(?:background|text|artwork)-/.test(readFileSync(file, "utf-8"));
  /** A palette page carries the per-family `::::fr-table[…]` blocks. */
  const holdsPalette = (file: string) =>
    existsSync(file) && /^::::fr-table\[/m.test(readFileSync(file, "utf-8"));

  const modern = existsSync(usage) || !existsSync(legacyPalette);
  const decisions = modern ? usage : color;
  const palette = modern ? color : legacyPalette;

  return {
    decisions: holdsDecisions(decisions) ? decisions : undefined,
    palette: holdsPalette(palette) ? palette : undefined,
  };
}

function extractColors(docsDir: string): ColorsIndex {
  const colors: ColorsIndex = { decisionTokens: [], families: [], illustrativeNames: [] };
  const { decisions: colorDoc, palette: paletteDoc } = resolveColorDocs(docsDir);

  if (!colorDoc) {
    console.error("Warning: page des tokens de décision introuvable (core/color/usage.md ou core/color/overview.md)");
  }
  if (!paletteDoc) {
    console.error("Warning: page de palette introuvable (core/color/overview.md ou core/palette/overview.md)");
  }

  // Parse decision tokens
  if (colorDoc && existsSync(colorDoc)) {
    const content = readFileSync(colorDoc, "utf-8");
    let currentContext: "background" | "text" | "artwork" = "background";

    for (const line of content.split("\n")) {
      if (line.includes("couleurs de fond") || line.includes("couleurs de texte") || line.includes("couleurs d'illustrations")) {
        if (line.toLowerCase().includes("fond")) currentContext = "background";
        else if (line.toLowerCase().includes("texte")) currentContext = "text";
        else if (line.toLowerCase().includes("illustration")) currentContext = "artwork";
      }

      // Match table rows: | description | `$token` | `$light` | `$dark` |
      const rowMatch = line.match(
        /^\|\s*(.+?)\s*\|\s*`(\$[\w-]+)`\s*\|\s*`(\$[\w-]+)`\s*\|\s*`(\$[\w-]+)`\s*\|$/
      );
      if (rowMatch) {
        const description = rowMatch[1].replace(/<br>\s*/g, " ").replace(/<[^>]*>/g, "").trim();
        // Skip header rows
        if (description.startsWith("Description") || description.startsWith(":")) continue;
        colors.decisionTokens.push({
          token: rowMatch[2],
          context: currentContext,
          description,
          light: rowMatch[3],
          dark: rowMatch[4],
        });
      }
    }
  }

  // Parse families from the palette page
  if (paletteDoc && existsSync(paletteDoc)) {
    const content = readFileSync(paletteDoc, "utf-8");
    const lines = content.split("\n");

    let currentCategory: ColorFamily["category"] = "primaire";
    let currentFamilyName: string | null = null;
    // Category of the family currently being filled. Captured when the table
    // opens, NOT when it is flushed: the `### …` heading of the *next* category
    // sits between a family's last row and the next table, so reading
    // currentCategory at flush time shifted every family one category down
    // (red-marianne landed in "neutre", grey in "systeme", info in "illustrative").
    let currentFamilyCategory: ColorFamily["category"] = "primaire";
    let currentCorrespondences: Record<string, { light: string; dark: string }> = {};

    const familyNameMap: Record<string, string> = {
      "Bleu France": "blue-france",
      "Rouge Marianne": "red-marianne",
      "Gris": "grey",
    };

    function flushFamily() {
      if (currentFamilyName && Object.keys(currentCorrespondences).length > 0) {
        colors.families.push({
          name: currentFamilyName,
          category: currentFamilyCategory,
          correspondences: { ...currentCorrespondences },
        });
      }
      currentCorrespondences = {};
    }

    for (const line of lines) {
      // Detect category sections
      if (line.startsWith("### Couleurs primaires")) currentCategory = "primaire";
      else if (line.startsWith("### Couleur neutre")) currentCategory = "neutre";
      else if (line.startsWith("### Couleurs système")) currentCategory = "systeme";
      else if (line.startsWith("### Couleurs illustratives")) currentCategory = "illustrative";

      // Detect family table headers: ::::fr-table[Name]{...}
      const tableMatch = line.match(/^::::fr-table\[(.+?)\]/);
      if (tableMatch) {
        flushFamily();
        const rawName = tableMatch[1];
        currentFamilyName = familyNameMap[rawName] ?? null;
        // Handle system color example
        if (rawName.includes("Info")) currentFamilyName = "info";
        // Skip template tables for illustratives
        if (rawName.includes("Déclinaisons")) currentFamilyName = null;
        currentFamilyCategory = currentCategory;
        continue;
      }

      // Parse correspondence rows: | **key** | `$light` | `$dark` |
      if (currentFamilyName) {
        const corrMatch = line.match(
          /^\|\s*\*\*(.+?)\*\*\s*\|\s*`(\$[\w-]+)`\s*\|\s*`(\$[\w-]+)`\s*\|$/
        );
        if (corrMatch) {
          currentCorrespondences[corrMatch[1].trim()] = {
            light: corrMatch[2],
            dark: corrMatch[3],
          };
        }
      }
    }
    flushFamily();

    // Extract illustrative color names
    const illustrativeLine = lines.find((l) => l.startsWith("Les couleurs illustratives sont :"));
    if (illustrativeLine) {
      const names = illustrativeLine
        .replace("Les couleurs illustratives sont : ", "")
        .replace(".", "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      colors.illustrativeNames = names;

      // Generate system color families (warning, error, success) based on info pattern
      const infoFamily = colors.families.find((f) => f.name === "info");
      if (infoFamily) {
        for (const sysColor of ["warning", "error", "success"]) {
          const correspondences: Record<string, { light: string; dark: string }> = {};
          for (const [key, val] of Object.entries(infoFamily.correspondences)) {
            correspondences[key] = {
              light: val.light.replace(/info/g, sysColor),
              dark: val.dark.replace(/info/g, sysColor),
            };
          }
          colors.families.push({
            name: sysColor,
            category: "systeme",
            correspondences,
          });
        }
      }

      // Generate illustrative color families based on template
      const illustrativeCorrespondences: Record<string, { lightSuffix: string; darkSuffix: string }> = {
        softest: { lightSuffix: "850", darkSuffix: "200" },
        light: { lightSuffix: "925", darkSuffix: "125" },
        lighter: { lightSuffix: "950", darkSuffix: "100" },
        lightest: { lightSuffix: "975", darkSuffix: "75" },
      };

      for (const colorName of names) {
        const correspondences: Record<string, { light: string; dark: string }> = {};
        for (const [key, suffixes] of Object.entries(illustrativeCorrespondences)) {
          correspondences[key] = {
            light: `$${colorName}-${suffixes.lightSuffix}`,
            dark: `$${colorName}-${suffixes.darkSuffix}`,
          };
        }
        colors.families.push({
          name: colorName,
          category: "illustrative",
          correspondences,
        });
      }
    }
  }

  writeFileSync(join(docsDir, "colors.json"), JSON.stringify(colors, null, 2));
  console.error(`Extracted ${colors.decisionTokens.length} decision tokens, ${colors.families.length} color families`);
  return colors;
}

// Extract structured accessibility (RGAA) data per component
function extractAccessibility(docsDir: string): number {
  const result: Record<string, ReturnType<typeof parseAccessibility>> = {};
  let count = 0;

  for (const entry of index) {
    if (!entry.sections.includes("accessibility")) continue;
    const filePath = join(docsDir, entry.category, entry.name, "accessibility.md");
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, "utf-8");
      result[entry.name] = parseAccessibility(content, entry.name, entry.title);
      count++;
    } catch (err) {
      console.error(`Warning: failed to parse accessibility for ${entry.name}: ${err}`);
    }
  }

  writeFileSync(join(docsDir, "accessibility.json"), JSON.stringify(result, null, 2));
  console.error(`Extracted accessibility for ${count} components`);
  return count;
}

// Extract DSFR Chart documentation from the clone made in step 1b. The tag is
// pinned, never `main`: `prepublishOnly` runs this script, and a broken upstream
// release must not break a publication of this server.
function extractCharts(): ChartsIndex {
  const readme = readFileSync(join(CHART_REPO_DIR, "README.md"), "utf-8");

  // The registry is read from the code rather than hard-coded: it is the only
  // authoritative list of which custom elements actually exist.
  const registrySource = readFileSync(join(CHART_REPO_DIR, "src/charts/main.js"), "utf-8");
  const registry: Record<string, string> = {};
  for (const m of registrySource.matchAll(
    /customElements\.define\(\s*['"]([a-z][a-z0-9-]*)['"]\s*,\s*defineCustomElement\(\s*(\w+)/g,
  )) {
    registry[m[1]] = m[2];
  }
  if (Object.keys(registry).length === 0) {
    throw new Error("aucun web-component trouvé dans src/charts/main.js");
  }

  const componentsDir = join(CHART_REPO_DIR, "src/components");
  const components: Record<string, string> = {};
  for (const file of readdirSync(componentsDir)) {
    if (!file.endsWith(".vue")) continue;
    components[file.replace(/\.vue$/, "")] = readFileSync(join(componentsDir, file), "utf-8");
  }

  const colors = JSON.parse(readFileSync(join(CHART_REPO_DIR, "src/assets/colors.json"), "utf-8"));

  const charts = buildChartsIndex({
    readme,
    components,
    registry,
    colors,
    version: DSFR_CHART_TAG,
    packageName: CHART_PACKAGE,
    repository: CHART_REPO_URL.replace(/\.git$/, ""),
  });

  writeFileSync(join(DOCS_DIR, "charts.json"), JSON.stringify(charts, null, 2));
  const undocumented = charts.charts.filter((c) => !c.documented).map((c) => c.name);
  console.error(
    `Extracted ${charts.charts.length} charts, ${charts.guides.length} guides, ${charts.palettes.length} palettes, ${charts.colorTokens.length} color tokens`,
  );
  if (undocumented.length > 0) {
    console.error(`  (sans section dédiée dans le README amont : ${undocumented.join(", ")})`);
  }
  return charts;
}

const iconCounts = extractIcons(REPO_DIR, DOCS_DIR);
const colors = extractColors(DOCS_DIR);
const accessibilityCount = extractAccessibility(DOCS_DIR);
const charts = extractCharts();

const counts: DocsCounts = {
  entries: index.length,
  icons: iconCounts.icons,
  iconClasses: iconCounts.classes,
  decisionTokens: colors.decisionTokens.length,
  colorFamilies: colors.families.length,
  illustrativeNames: colors.illustrativeNames.length,
  accessibilityComponents: accessibilityCount,
  charts: charts.charts.length,
  documentedCharts: charts.charts.filter((c) => c.documented).length,
  documentedChartParams: charts.charts
    .flatMap((c) => c.params)
    .filter((p) => p.documented && p.description.length > 0).length,
};

// Sanity floors. The colour refactor of DSFR 1.15.0 silently emptied
// colors.json — the script exited 0, the docs shipped and every test stayed
// green. These thresholds are deliberately floors, not exact counts: they
// tolerate upstream evolution while catching a source that has moved.
const FLOORS: Array<[keyof DocsCounts, number]> = [
  ["entries", 70],
  ["icons", 500],
  ["iconClasses", 1000],
  ["decisionTokens", 25],
  ["colorFamilies", 20],
  ["illustrativeNames", 15],
  ["accessibilityComponents", 40],
  ["charts", 10],
  // Cardinality alone would not catch a parser regression: the chart list comes
  // from the component registry, so it stays at 11 even if the README yields
  // nothing. These two floors are what actually guard the extracted meaning.
  ["documentedCharts", 8],
  ["documentedChartParams", 80],
];
const breached = FLOORS.filter(([key, floor]) => counts[key] < floor);
if (breached.length > 0) {
  console.error("\nExtraction incomplète — la documentation amont a probablement changé de structure :");
  for (const [key, floor] of breached) {
    console.error(`  ${key} = ${counts[key]} (attendu >= ${floor})`);
  }
  process.exit(1);
}

const meta: DocsMeta = {
  schemaVersion: SCHEMA_VERSION,
  dsfrVersion: DSFR_TAG,
  dsfrCommit: capture("git rev-parse HEAD", REPO_DIR),
  dsfrRepository: REPO_URL.replace(/\.git$/, ""),
  dsfrChartVersion: DSFR_CHART_TAG,
  dsfrChartCommit: capture("git rev-parse HEAD", CHART_REPO_DIR),
  dsfrChartRepository: CHART_REPO_URL.replace(/\.git$/, ""),
  fetchedAt: new Date().toISOString(),
  counts,
};
writeFileSync(join(DOCS_DIR, "meta.json"), JSON.stringify(meta, null, 2));

console.error(`\nDone! Extracted ${index.length} entries:`);
for (const entry of index) {
  console.error(`  [${entry.category}] ${entry.name} — ${entry.title} (${entry.sections.join(", ")})`);
}
for (const chart of charts.charts) {
  console.error(`  [chart] ${chart.name} — ${chart.title} (${chart.params.length} attributs)`);
}
