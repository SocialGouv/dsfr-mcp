import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const REPO_DIR = join(ROOT, ".dsfr-repo");
const DOCS_DIR = join(ROOT, "docs");
const REPO_URL = "https://github.com/GouvernementFR/dsfr.git";

function run(cmd: string, cwd?: string) {
  console.error(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// Step 1: Clone or update the DSFR repo (sparse checkout)
if (existsSync(join(REPO_DIR, ".git"))) {
  console.error("Updating existing DSFR repo...");
  run("git fetch --depth=1 origin main", REPO_DIR);
  run("git checkout FETCH_HEAD", REPO_DIR);
} else {
  console.error("Cloning DSFR repo (sparse)...");
  if (existsSync(REPO_DIR)) rmSync(REPO_DIR, { recursive: true });
  run(`git clone --filter=blob:none --sparse --depth=1 ${REPO_URL} ${REPO_DIR}`);
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

console.error(`\nDone! Extracted ${index.length} entries:`);
for (const entry of index) {
  console.error(`  [${entry.category}] ${entry.name} — ${entry.title} (${entry.sections.join(", ")})`);
}
