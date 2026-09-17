import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  ComponentEntry,
  SearchResult,
  ToolTextResult,
  IconEntry,
  ColorsIndex,
  AccessibilityIndex,
  ChartsIndex,
  ChartEntry,
  ChartGuide,
  ChartParam,
  DocsMeta,
} from "./types.js";
import type { LRUCache } from "./cache.js";

function readFileWithCache(
  filePath: string,
  cache: LRUCache<string, string>,
): string | undefined {
  const cached = cache.get(filePath);
  if (cached !== undefined) return cached;
  if (!existsSync(filePath)) return undefined;
  const content = readFileSync(filePath, "utf-8");
  cache.set(filePath, content);
  return content;
}

/**
 * Remove documentation "chrome" that is noise for an AI consumer: the leading
 * YAML frontmatter and the DSFR tab-navigation directive block (which only
 * contains dead relative links to sibling .md files). Content directives
 * (:::fr-table, code fences, etc.) are left intact — they carry real meaning.
 */
export function stripDocChrome(content: string): string {
  return content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/:::dsfr-doc-tab-navigation[\s\S]*?\n:::\n?/g, "")
    .trimStart();
}

/** Tidy a search excerpt: drop directive fences, frontmatter delimiters, nbsp, collapse whitespace. */
function cleanExcerpt(text: string): string {
  return text
    .replace(/:{3,}[^\n]*/g, " ")
    .replace(/ |&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadIndex(docsDir: string): ComponentEntry[] {
  const indexPath = join(docsDir, "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(
      `Documentation index not found at ${indexPath}. Run "pnpm run fetch-docs" first.`,
    );
  }
  return JSON.parse(readFileSync(indexPath, "utf-8"));
}

/**
 * Charts are listed alongside components so an assistant looking for "graphique
 * en barres" finds them at all, but they carry no `sections` and point at their
 * own tool: mixing Vue web components into `get_component_doc` would make two
 * of the seven tools answer wrongly rather than not at all.
 */
export function listComponents(
  index: ComponentEntry[],
  charts?: ChartsIndex,
  meta?: DocsMeta,
): ToolTextResult {
  const entries: Array<Record<string, unknown>> = index.map((e) => ({
    name: e.name,
    title: e.title,
    description: e.description,
    category: e.category,
    sections: e.sections,
  }));
  if (charts) {
    for (const chart of charts.charts) {
      entries.push({
        name: chart.name,
        title: chart.title,
        description: chart.description,
        category: "chart",
        tag: chart.tag,
        package: charts.package,
        tool: "get_chart_doc",
      });
    }
  }
  // The pinned versions travel with the catalogue: without them the caller has
  // no way to tell whether the documentation it is reading matches the DSFR
  // release its project depends on.
  // `??` alone would let an empty string through: EMPTY_CHARTS declares
  // `version: ""`, so a docs/ dir without charts.json would report a blank
  // version rather than an honest "inconnue".
  const firstSet = (...values: Array<string | undefined>) =>
    values.find((v) => v && v.length > 0) ?? "inconnue";
  const payload = {
    dsfrVersion: firstSet(meta?.dsfrVersion),
    dsfrChartVersion: firstSet(meta?.dsfrChartVersion, charts?.version),
    entries,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export function getComponentDoc(
  index: ComponentEntry[],
  docsDir: string,
  name: string,
  section: string,
  cache: LRUCache<string, string>,
): ToolTextResult {
  const entry = index.find(
    (e) => e.name === name || e.name === name.toLowerCase(),
  );
  if (!entry) {
    const suggestions = index
      .filter(
        (e) =>
          e.name.includes(name.toLowerCase()) ||
          e.title.toLowerCase().includes(name.toLowerCase()),
      )
      .map((e) => `${e.name} (${e.title})`)
      .slice(0, 5);
    return {
      content: [
        {
          type: "text" as const,
          text: `Composant "${name}" non trouvé.${suggestions.length > 0 ? ` Suggestions : ${suggestions.join(", ")}` : ""}\nUtilisez list_components pour voir la liste complète.`,
        },
      ],
    };
  }

  if (!entry.sections.includes(section)) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Section "${section}" non disponible pour ${entry.name} (${entry.title}). Sections disponibles : ${entry.sections.join(", ")}`,
        },
      ],
    };
  }

  const filePath = join(docsDir, entry.category, entry.name, `${section}.md`);
  const raw = readFileWithCache(filePath, cache);
  if (raw === undefined) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Section "${section}" non disponible pour ${entry.name} (${entry.title}). Sections disponibles : ${entry.sections.join(", ")}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `# ${entry.title} — ${section}\n\n${stripDocChrome(raw)}`,
      },
    ],
  };
}

/**
 * Section names get_component_doc can serve. Single source of truth for the
 * zod enum in server.ts: a new core sub-page extracted by fetch-docs must be
 * added here, or it is indexed and searchable but unreadable through the tool.
 */
export const DOC_SECTIONS = [
  "overview",
  "code",
  "design",
  "accessibility",
  "demo",
  "usage",
] as const;

const SEARCH_LIMIT = 15;

export function searchComponents(
  index: ComponentEntry[],
  docsDir: string,
  query: string,
  cache: LRUCache<string, string>,
  charts?: ChartsIndex,
): ToolTextResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return {
      content: [
        { type: "text" as const, text: `Requête vide. Indiquez un ou plusieurs mots-clés.` },
      ],
    };
  }

  interface Scored extends SearchResult {
    score: number;
  }
  const scored: Scored[] = [];

  for (const entry of index) {
    const name = entry.name.toLowerCase();
    const title = entry.title.toLowerCase();
    const description = entry.description.toLowerCase();

    // Metadata scoring — name/title/description carry the strongest signal.
    let metaScore = 0;
    for (const term of terms) {
      if (name === term) metaScore += 10;
      else if (name.includes(term)) metaScore += 5;
      if (title.includes(term)) metaScore += 4;
      if (description.includes(term)) metaScore += 2;
    }

    // Content scoring — pick the section matching the most terms, for an excerpt.
    let contentScore = 0;
    let bestSection: string | undefined;
    let bestExcerpt = "";
    for (const section of entry.sections) {
      const filePath = join(docsDir, entry.category, entry.name, `${section}.md`);
      const raw = readFileWithCache(filePath, cache);
      if (!raw) continue;
      const content = stripDocChrome(raw); // keep frontmatter/nav out of excerpts
      const lower = content.toLowerCase();

      let sectionScore = 0;
      let firstIdx = -1;
      for (const term of terms) {
        const idx = lower.indexOf(term);
        if (idx !== -1) {
          sectionScore += 1;
          if (firstIdx === -1 || idx < firstIdx) firstIdx = idx;
        }
      }
      if (sectionScore > contentScore) {
        contentScore = sectionScore;
        bestSection = section;
        const start = Math.max(0, firstIdx - 80);
        const end = Math.min(content.length, firstIdx + 100);
        bestExcerpt =
          (start > 0 ? "…" : "") +
          cleanExcerpt(content.slice(start, end)) +
          (end < content.length ? "…" : "");
      }
    }

    const total = metaScore + contentScore;
    if (total === 0) continue;

    scored.push({
      name: entry.name,
      title: entry.title,
      category: entry.category,
      matchType: metaScore > 0 ? "metadata" : `content (${bestSection})`,
      excerpt: metaScore > 0 ? entry.description : bestExcerpt,
      score: total,
    });
  }

  // Charts are scored on metadata only — there are no markdown files to scan —
  // and rendered as a separate block so a hit never reads like a CSS component.
  // They get the same ranking and the same cap as components: matching on a bare
  // substring of any of 175 attribute descriptions would otherwise let a common
  // term like "couleur" return the whole catalogue, unsorted.
  const chartScored: Array<{ chart: ChartEntry; score: number }> = [];
  for (const chart of charts?.charts ?? []) {
    const name = chart.name.toLowerCase();
    const title = chart.title.toLowerCase();
    const description = chart.description.toLowerCase();
    const aliases = chart.aliases.map((a) => a.toLowerCase());
    const params = chart.params.map((p) => `${p.name} ${p.description}`.toLowerCase());

    let score = 0;
    for (const term of terms) {
      if (name === term) score += 10;
      else if (name.includes(term)) score += 5;
      if (aliases.some((a) => a === term)) score += 10;
      if (title.includes(term)) score += 4;
      if (description.includes(term)) score += 2;
      if (params.some((p) => p.includes(term))) score += 1;
    }
    if (score > 0) chartScored.push({ chart, score });
  }
  chartScored.sort((a, b) => b.score - a.score || a.chart.name.localeCompare(b.chart.name));
  const CHART_LIMIT = 5;
  const chartHits = chartScored.slice(0, CHART_LIMIT).map((h) => h.chart);
  const chartTruncated = chartScored.length - chartHits.length;

  if (scored.length === 0 && chartHits.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Aucun résultat pour "${query}". Essayez un autre terme ou utilisez list_components pour voir tous les composants.`,
        },
      ],
    };
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const limited = scored.slice(0, SEARCH_LIMIT);
  const truncated = scored.length - limited.length;

  const lines = limited.map(
    (r) => `- **${r.name}** (${r.title}) [${r.category}] — ${r.matchType}\n  ${r.excerpt}`,
  );

  const blocks: string[] = [];
  const total = scored.length + chartScored.length;
  const shown = limited.length + chartHits.length;
  blocks.push(
    `${total} résultat(s) pour "${query}"${total > shown ? ` (${shown} affichés)` : ""} :`,
  );
  if (lines.length > 0) blocks.push(lines.join("\n\n"));
  if (chartHits.length > 0 && charts) {
    const more = chartTruncated > 0 ? `\n  … et ${chartTruncated} autre(s).` : "";
    blocks.push(
      `Visualisations de données (${charts.package}) :\n${chartHits.map((c) => chartSummary(c, charts)).join("\n")}${more}`,
    );
  }

  return {
    content: [{ type: "text" as const, text: blocks.join("\n\n") }],
  };
}

export function loadIcons(docsDir: string): IconEntry[] {
  const iconsPath = join(docsDir, "icons.json");
  if (!existsSync(iconsPath)) {
    throw new Error(
      `Icons index not found at ${iconsPath}. Run "pnpm run fetch-docs" first.`,
    );
  }
  return JSON.parse(readFileSync(iconsPath, "utf-8"));
}

export function loadColors(docsDir: string): ColorsIndex {
  const colorsPath = join(docsDir, "colors.json");
  if (!existsSync(colorsPath)) {
    throw new Error(
      `Colors index not found at ${colorsPath}. Run "pnpm run fetch-docs" first.`,
    );
  }
  return JSON.parse(readFileSync(colorsPath, "utf-8"));
}

export function loadAccessibility(docsDir: string): AccessibilityIndex {
  const accessibilityPath = join(docsDir, "accessibility.json");
  if (!existsSync(accessibilityPath)) {
    throw new Error(
      `Accessibility index not found at ${accessibilityPath}. Run "pnpm run fetch-docs" first.`,
    );
  }
  return JSON.parse(readFileSync(accessibilityPath, "utf-8"));
}

export const ICON_CATEGORIES = [
  "arrows", "buildings", "business", "communication", "design",
  "development", "device", "document", "editor", "finance",
  "health", "logo", "map", "media", "others", "system", "user", "weather",
] as const;

export function searchIcons(
  icons: IconEntry[],
  query: string,
  category?: string,
): ToolTextResult {
  const q = query.toLowerCase();

  let candidates = icons;
  if (category) {
    candidates = candidates.filter((i) => i.category === category);
  }

  const scored: Array<{ icon: IconEntry; score: number }> = [];

  for (const icon of candidates) {
    const name = icon.name.toLowerCase();
    let score = 0;

    if (name === q) {
      score = 3;
    } else if (name.startsWith(q)) {
      score = 2;
    } else if (name.includes(q)) {
      score = 1;
    } else if (icon.classes.some((c) => c.toLowerCase().includes(q))) {
      score = 1;
    }

    if (score > 0) {
      scored.push({ icon, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name));

  const limited = scored.slice(0, 20);

  if (limited.length === 0) {
    const catList = category
      ? `Catégorie "${category}" filtrée.`
      : `Catégories disponibles : ${ICON_CATEGORIES.join(", ")}`;
    return {
      content: [
        {
          type: "text" as const,
          text: `Aucune icône trouvée pour "${query}". ${catList}`,
        },
      ],
    };
  }

  const lines = limited.map(({ icon }) => {
    const variants = icon.variants.length > 0 ? icon.variants.join(", ") : "sans variante";
    return `- **${icon.name}** [${icon.category}] — ${variants}\n  Classes : ${icon.classes.join(", ")}`;
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `${limited.length} icône(s) trouvée(s) pour "${query}"${category ? ` dans "${category}"` : ""} :\n\n${lines.join("\n")}`,
      },
    ],
  };
}

export function getColorTokens(
  colors: ColorsIndex,
  options: { context?: string; usage?: string; family?: string },
): ToolTextResult {
  const { context, usage, family } = options;

  // No filters: return summary
  if (!context && !usage && !family) {
    const contexts = [...new Set(colors.decisionTokens.map((t) => t.context))];
    const familyNames = colors.families.map((f) => `${f.name} (${f.category})`);
    return {
      content: [
        {
          type: "text" as const,
          text: `Tokens de couleur DSFR disponibles :\n\n**Contextes :** ${contexts.join(", ")}\n**Familles :** ${familyNames.join(", ")}\n**Couleurs illustratives :** ${colors.illustrativeNames.join(", ")}\n\nUtilisez les paramètres context, usage ou family pour filtrer.`,
        },
      ],
    };
  }

  const sections: string[] = [];

  // Filter decision tokens
  let tokens = colors.decisionTokens;
  if (context) {
    tokens = tokens.filter((t) => t.context === context);
  }
  if (usage) {
    const u = usage.toLowerCase();
    tokens = tokens.filter(
      (t) =>
        t.token.toLowerCase().includes(u) ||
        t.description.toLowerCase().includes(u),
    );
  }
  if (family) {
    const f = family.toLowerCase();
    tokens = tokens.filter((t) => t.token.toLowerCase().includes(f));
  }

  if (tokens.length > 0) {
    const tokenLines = tokens.map(
      (t) =>
        `- \`${t.token}\`\n  ${t.description}\n  Clair : ${t.light} | Sombre : ${t.dark}`,
    );
    sections.push(`### Tokens de décision\n${tokenLines.join("\n")}`);
  }

  // Filter families
  if (family) {
    const f = family.toLowerCase();
    const matched = colors.families.filter(
      (fam) => fam.name.toLowerCase().includes(f) || fam.category.toLowerCase().includes(f),
    );
    for (const fam of matched) {
      const corrLines = Object.entries(fam.correspondences).map(
        ([key, val]) => `  ${key} : ${val.light} (clair) / ${val.dark} (sombre)`,
      );
      sections.push(
        `### Famille "${fam.name}" (${fam.category})\n${corrLines.join("\n")}`,
      );
    }
  }

  if (sections.length === 0) {
    const parts: string[] = [];
    if (context) parts.push(`context="${context}"`);
    if (usage) parts.push(`usage="${usage}"`);
    if (family) parts.push(`family="${family}"`);
    return {
      content: [
        {
          type: "text" as const,
          text: `Aucun token trouvé pour ${parts.join(", ")}. Contextes disponibles : background, text, artwork. Familles : ${colors.families.map((f) => f.name).join(", ")}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: sections.join("\n\n"),
      },
    ],
  };
}

export function getComponentAccessibility(
  index: ComponentEntry[],
  accessibility: AccessibilityIndex,
  name: string,
): ToolTextResult {
  const entry = index.find(
    (e) => e.name === name || e.name === name.toLowerCase(),
  );
  if (!entry) {
    const suggestions = index
      .filter(
        (e) =>
          e.name.includes(name.toLowerCase()) ||
          e.title.toLowerCase().includes(name.toLowerCase()),
      )
      .map((e) => `${e.name} (${e.title})`)
      .slice(0, 5);
    return {
      content: [
        {
          type: "text" as const,
          text: `Composant "${name}" non trouvé.${suggestions.length > 0 ? ` Suggestions : ${suggestions.join(", ")}` : ""}\nUtilisez list_components pour voir la liste complète.`,
        },
      ],
    };
  }

  const a11y = accessibility[entry.name];
  if (!a11y) {
    const available = Object.keys(accessibility).sort();
    return {
      content: [
        {
          type: "text" as const,
          text: `Pas de section accessibilité pour ${entry.name} (${entry.title}). Utilisez get_component_doc pour la documentation générale.\nComposants avec accessibilité : ${available.slice(0, 20).join(", ")}${available.length > 20 ? "…" : ""}`,
        },
      ],
    };
  }

  const sections: string[] = [`# ${a11y.title} — Accessibilité`];

  if (a11y.keyboardInteractions.length > 0) {
    const lines = a11y.keyboardInteractions.map(
      (k) => `- ${k.key}${k.action ? ` : ${k.action}` : ""}`,
    );
    sections.push(`## Interactions clavier\n${lines.join("\n")}`);
  }

  if (a11y.rules.text || a11y.rules.guidelines.length > 0) {
    let s = `## Règles d'accessibilité`;
    if (a11y.rules.text) s += `\n${a11y.rules.text}`;
    if (a11y.rules.guidelines.length > 0) {
      const g = a11y.rules.guidelines.map(
        (gl) => `${gl.type === "do" ? "✅" : "❌"} ${gl.caption || gl.label}`,
      );
      s += `\n\n${g.join("\n")}`;
    }
    sections.push(s);
  }

  if (a11y.contrasts.length > 0) {
    const blocks = a11y.contrasts.map((c) => {
      const rows = c.rows
        .map((r) => `  - ${r.state} : ${r.lightTheme} (clair) / ${r.darkTheme} (sombre)`)
        .join("\n");
      return `**${c.label}**${rows ? `\n${rows}` : ""}`;
    });
    sections.push(`## Contrastes de couleurs\n${blocks.join("\n")}`);
  }

  if (a11y.screenReader) {
    sections.push(`## Restitution par les lecteurs d'écran\n${a11y.screenReader}`);
  }

  if (a11y.rgaaCriteria.length > 0) {
    const lines = a11y.rgaaCriteria.map(
      (c) => `- **${c.topic}** : ${c.criteria.join(", ")}`,
    );
    sections.push(`## Critères RGAA applicables\n${lines.join("\n")}`);
  }

  if (a11y.references.length > 0) {
    const lines = a11y.references.map((r) => `- ${r.label} : ${r.url}`);
    sections.push(`## Références\n${lines.join("\n")}`);
  }

  return {
    content: [{ type: "text" as const, text: sections.join("\n\n") }],
  };
}

export function getComponentCode(
  index: ComponentEntry[],
  docsDir: string,
  name: string,
  cache: LRUCache<string, string>,
): ToolTextResult {
  const entry = index.find(
    (e) => e.name === name || e.name === name.toLowerCase(),
  );
  if (!entry) {
    const suggestions = index
      .filter(
        (e) =>
          e.name.includes(name.toLowerCase()) ||
          e.title.toLowerCase().includes(name.toLowerCase()),
      )
      .map((e) => `${e.name} (${e.title})`)
      .slice(0, 5);
    return {
      content: [
        {
          type: "text" as const,
          text: `Composant "${name}" non trouvé.${suggestions.length > 0 ? ` Suggestions : ${suggestions.join(", ")}` : ""}\nUtilisez list_components pour voir la liste complète.`,
        },
      ],
    };
  }

  if (!entry.sections.includes("code")) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Pas de section code pour ${entry.name} (${entry.title}). Sections disponibles : ${entry.sections.join(", ")}. Utilisez get_component_doc pour la documentation.`,
        },
      ],
    };
  }

  const filePath = join(docsDir, entry.category, entry.name, "code.md");
  const raw = readFileWithCache(filePath, cache);
  if (raw === undefined) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Section code introuvable pour ${entry.name} (${entry.title}).`,
        },
      ],
    };
  }
  const content = stripDocChrome(raw);

  // Extract fenced code blocks, each tagged with the nearest preceding label.
  const lines = content.split("\n");
  const blocks: { label: string; lang: string; code: string }[] = [];
  let lastLabel = "";
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = (fence[1] || "html").toLowerCase();
      const codeLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (/^```\s*$/.test(lines[j])) break;
        codeLines.push(lines[j]);
      }
      blocks.push({ label: lastLabel, lang, code: codeLines.join("\n") });
      i = j;
      continue;
    }
    const trimmed = lines[i].trim();
    if (/^#{2,6}\s+/.test(trimmed)) lastLabel = trimmed.replace(/^#+\s+/, "");
    else if (/^\*\*(.+)\*\*$/.test(trimmed)) lastLabel = trimmed.replace(/\*\*/g, "");
  }

  // Collect DSFR CSS classes from code (class="…") and from prose backticks.
  const classes = new Set<string>();
  let m: RegExpExecArray | null;
  for (const b of blocks) {
    const classAttrRe = /class="([^"]*)"/g;
    while ((m = classAttrRe.exec(b.code))) {
      for (const c of m[1].split(/\s+/)) if (c.startsWith("fr-")) classes.add(c);
    }
  }
  const backtickRe = /`(fr-[\w-]+)`/g;
  while ((m = backtickRe.exec(content))) classes.add(m[1]);

  if (blocks.length === 0 && classes.size === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Aucun exemple de code extrait pour ${entry.name}. Utilisez get_component_doc avec section="code".`,
        },
      ],
    };
  }

  const sections: string[] = [`# ${entry.title} — Code`];
  if (classes.size > 0) {
    sections.push(
      `## Classes CSS\n${[...classes].sort().map((c) => `\`${c}\``).join(", ")}`,
    );
  }
  if (blocks.length > 0) {
    const examples = blocks.map((b) => {
      const head = b.label ? `### ${b.label}\n` : "";
      return `${head}\`\`\`${b.lang}\n${b.code}\n\`\`\``;
    });
    sections.push(`## Exemples\n${examples.join("\n\n")}`);
  }

  return {
    content: [{ type: "text" as const, text: sections.join("\n\n") }],
  };
}

// --- DSFR Chart ------------------------------------------------------------

export function loadCharts(docsDir: string): ChartsIndex {
  const chartsPath = join(docsDir, "charts.json");
  if (!existsSync(chartsPath)) {
    throw new Error(
      `Charts index not found at ${chartsPath}. Run "pnpm run fetch-docs" first.`,
    );
  }
  return JSON.parse(readFileSync(chartsPath, "utf-8"));
}

export function loadMeta(docsDir: string): DocsMeta {
  const metaPath = join(docsDir, "meta.json");
  if (!existsSync(metaPath)) {
    throw new Error(
      `Metadata not found at ${metaPath}. Run "pnpm run fetch-docs" first.`,
    );
  }
  return JSON.parse(readFileSync(metaPath, "utf-8"));
}

/**
 * Used alone, dsfr-chart visualizations are not RGAA-compliant: the data is
 * unreachable for screen readers and keyboard users. Every chart answer repeats
 * it, because it is the single most consequential thing to get wrong on a
 * public-sector site and the easiest for an assistant to skip over.
 */
const CHART_A11Y_WARNING =
  "⚠️ Accessibilité : utilisés seuls, les graphiques DSFR Chart sont non conformes au RGAA (critères 1.1, 1.6, 3.1, 3.3, 4.8, 4.9, 4.12, 10.13, 10.14). Une alternative textuelle adjacente (tableau, liste ou texte structuré) est obligatoire — voir get_chart_doc(name=\"accessibility\").";

function chartHeader(charts: ChartsIndex): string {
  return `${charts.package} ${charts.version} — web-components Vue.js, paquet npm distinct du DSFR : ces graphiques s'utilisent via des balises personnalisées et des attributs HTML, sans classes \`fr-*\`.`;
}

function formatParam(p: ChartParam): string {
  const bits = [p.type || "type non déclaré"];
  if (!p.required && p.default !== undefined) bits.push(`défaut ${p.default}`);
  const head = `- \`${p.name}\` (${bits.join(", ")})`;
  const lines = [p.description ? `${head} — ${p.description}` : head];
  if (p.allowedValues?.length) {
    lines.push(`  Valeurs : ${p.allowedValues.map((v) => `\`${v}\``).join(", ")}`);
  }
  return lines.join("\n");
}

function formatChart(charts: ChartsIndex, chart: ChartEntry): string {
  const sections: string[] = [
    `# ${chart.title} — \`${chart.tag}\``,
    chartHeader(charts),
  ];
  // The upstream description is often just "… accessibles à travers la balise :
  // `<x>`", which the title line above already says.
  if (chart.description && !/balise\s*:/.test(chart.description)) {
    sections.push(chart.description);
  }
  if (!chart.documented) {
    sections.push(
      `> Ce web-component est bien enregistré par ${charts.package} mais n'a pas de section dédiée dans la documentation amont. Les attributs ci-dessous sont lus directement dans le composant \`${chart.component}\`.`,
    );
  }

  const required = chart.params.filter((p) => p.required);
  const optional = chart.params.filter((p) => !p.required && p.documented);
  const undocumented = chart.params.filter((p) => !p.required && !p.documented);

  if (required.length > 0) {
    sections.push(`## Attributs obligatoires\n${required.map(formatParam).join("\n")}`);
  }
  if (optional.length > 0) {
    sections.push(`## Attributs optionnels\n${optional.map(formatParam).join("\n")}`);
  }
  if (undocumented.length > 0) {
    sections.push(
      `## Attributs non documentés en amont\nPrésents dans le composant \`${chart.component}\` mais absents du README de ${charts.package} — utilisables, mais sans garantie de stabilité :\n${undocumented.map(formatParam).join("\n")}`,
    );
  }

  if (chart.examples.length > 0) {
    const blocks = chart.examples.map(
      (e) => `${e.label ? `### ${e.label}\n` : ""}\`\`\`html\n${e.code}\n\`\`\``,
    );
    sections.push(`## Exemples\n${blocks.join("\n\n")}`);
  }
  if (chart.notes.length > 0) {
    sections.push(`## Notes et conseils\n${chart.notes.map((n) => `- ${n}`).join("\n")}`);
  }

  sections.push(CHART_A11Y_WARNING);
  sections.push(
    `Sujets transverses : get_chart_doc(name="install"), "colors", "accessibility", "databox".`,
  );
  return sections.join("\n\n");
}

function formatGuide(charts: ChartsIndex, guide: ChartGuide): string {
  const sections = [`# ${guide.title}`, chartHeader(charts), guide.markdown];
  if (guide.name !== "accessibility") sections.push(CHART_A11Y_WARNING);
  if (guide.name === "colors" && charts.colorTokens.length > 0) {
    const rows = charts.colorTokens.map(
      (t) => `- \`${t.token}\` : ${t.light} (clair) / ${t.dark} (sombre)`,
    );
    sections.push(`## Jetons de couleur (src/assets/colors.json)\n${rows.join("\n")}`);
  }
  return sections.join("\n\n");
}

/** Tolerant lookup: exact tag, `<tag>`, PascalCase component, or dashless form. */
function resolveChart(charts: ChartsIndex, name: string): ChartEntry | undefined {
  const q = name.trim().replace(/^<|>$/g, "").toLowerCase();
  return (
    charts.charts.find((c) => c.name.toLowerCase() === q) ??
    charts.charts.find((c) => c.component.toLowerCase() === q) ??
    charts.charts.find((c) => c.aliases.some((a) => a.toLowerCase() === q)) ??
    charts.charts.find((c) => c.name.replace(/-/g, "") === q.replace(/-/g, ""))
  );
}

export function getChartDoc(charts: ChartsIndex, name: string): ToolTextResult {
  const text = (t: string): ToolTextResult => ({ content: [{ type: "text" as const, text: t }] });

  if (charts.charts.length === 0) {
    return text(
      `Documentation DSFR Chart indisponible (docs/charts.json absent ou vide). Lancez "pnpm run fetch-docs".`,
    );
  }

  const q = name.trim().toLowerCase();
  const guide = charts.guides.find((g) => g.name.toLowerCase() === q);
  if (guide) {
    // "databox" names both a cross-cutting topic and an alias of <data-box>.
    // The topic wins, as the tool description advertises — but the caller is
    // told where the component's own attributes live, otherwise the alias is
    // a dead end they cannot discover.
    const shadowed = resolveChart(charts, name);
    const pointer = shadowed
      ? `\n\nPour les attributs du web-component lui-même : get_chart_doc(name="${shadowed.name}").`
      : "";
    return text(formatGuide(charts, guide) + pointer);
  }

  const chart = resolveChart(charts, name);
  if (chart) return text(formatChart(charts, chart));

  const catalogue = charts.charts.map((c) => `${c.name} (${c.title})`).join(", ");
  const guides = charts.guides.map((g) => g.name).join(", ");
  const footer = `Graphiques disponibles : ${catalogue}\nSujets transverses : ${guides}\n\nSi vous cherchiez un composant CSS du DSFR (bouton, carte, tableau…) et non une visualisation de données, utilisez list_components ou get_component_doc.`;

  if (!q) {
    return text(`Indiquez une balise, un nom de composant ou un sujet transverse.\n\n${footer}`);
  }

  // Near-misses first, then the full catalogue: a wrong guess should still
  // leave the caller with everything it needs to pick the right name. The query
  // is tokenized so a natural phrasing ("graphique en barres") still suggests.
  const tokens = q.split(/[\s_]+/).filter(Boolean);
  const suggestions = charts.charts
    .filter((c) =>
      tokens.some(
        (t) =>
          c.name.includes(t) ||
          c.title.toLowerCase().includes(t) ||
          c.aliases.some((a) => a.toLowerCase().includes(t)),
      ),
    )
    .map((c) => c.name);
  return text(
    `Graphique "${name}" non trouvé.${suggestions.length > 0 ? ` Suggestions : ${suggestions.join(", ")}` : ""}\n\n${footer}`,
  );
}

/** Compact chart lines for list_components / search_components. */
function chartSummary(chart: ChartEntry, charts: ChartsIndex): string {
  return `- **${chart.name}** (${chart.title}) [chart] — web-component ${charts.package}\n  → get_chart_doc(name="${chart.name}")`;
}
