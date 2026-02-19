import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const REPO_DIR = join(ROOT, ".dsfr-repo");
const DOCS_DIR = join(ROOT, "docs");
const REPO_URL = "https://github.com/GouvernementFR/dsfr.git";
const DSFR_TAG = process.env.DSFR_TAG ?? "v1.14.3";

function run(cmd: string, cwd?: string) {
  console.error(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
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

// Process core
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
      const content = readFileSync(join(outDir, "overview.md"), "utf-8");
      const { title, description } = extractFrontmatter(content);
      index.push({
        name: entry,
        title: title || entry,
        description,
        category: "core",
        sections: ["overview"],
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

// Write meta
writeFileSync(join(DOCS_DIR, "meta.json"), JSON.stringify({ dsfrVersion: DSFR_TAG }, null, 2));

// Extract icons index
interface IconEntry {
  name: string;
  category: string;
  variants: string[];
  classes: string[];
}

function extractIcons(repoDir: string, docsDir: string) {
  const iconBaseDir = join(repoDir, "src/dsfr/core/icon");
  if (!existsSync(iconBaseDir)) {
    console.error("Warning: icon directory not found, skipping icon extraction");
    return;
  }

  const groups = new Map<string, { category: string; variants: Set<string>; classes: Set<string> }>();

  for (const category of readdirSync(iconBaseDir)) {
    const catDir = join(iconBaseDir, category);
    if (!statSync(catDir).isDirectory()) continue;

    for (const file of readdirSync(catDir)) {
      if (!file.endsWith(".svg")) continue;
      const raw = file.replace(/\.svg$/, "");
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
  console.error(`Extracted ${icons.length} icons across ${new Set(icons.map((i) => i.category)).size} categories`);
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

function extractColors(docsDir: string) {
  const colors: ColorsIndex = { decisionTokens: [], families: [], illustrativeNames: [] };

  // Parse decision tokens from color/overview.md
  const colorDoc = join(docsDir, "core/color/overview.md");
  if (existsSync(colorDoc)) {
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

  // Parse families from palette/overview.md
  const paletteDoc = join(docsDir, "core/palette/overview.md");
  if (existsSync(paletteDoc)) {
    const content = readFileSync(paletteDoc, "utf-8");
    const lines = content.split("\n");

    let currentCategory: ColorFamily["category"] = "primaire";
    let currentFamilyName: string | null = null;
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
          category: currentCategory,
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
}

extractIcons(REPO_DIR, DOCS_DIR);
extractColors(DOCS_DIR);

console.error(`\nDone! Extracted ${index.length} entries:`);
for (const entry of index) {
  console.error(`  [${entry.category}] ${entry.name} — ${entry.title} (${entry.sections.join(", ")})`);
}
