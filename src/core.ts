import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ComponentEntry, SearchResult, ToolTextResult, IconEntry, ColorsIndex, AccessibilityIndex } from "./types.js";
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

export function listComponents(index: ComponentEntry[]): ToolTextResult {
  const list = index.map((e) => ({
    name: e.name,
    title: e.title,
    description: e.description,
    category: e.category,
    sections: e.sections,
  }));
  return {
    content: [{ type: "text" as const, text: JSON.stringify(list, null, 2) }],
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

const SEARCH_LIMIT = 15;

export function searchComponents(
  index: ComponentEntry[],
  docsDir: string,
  query: string,
  cache: LRUCache<string, string>,
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

  if (scored.length === 0) {
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

  return {
    content: [
      {
        type: "text" as const,
        text: `${scored.length} résultat(s) pour "${query}"${truncated > 0 ? ` (${limited.length} affichés)` : ""} :\n\n${lines.join("\n\n")}`,
      },
    ],
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

const ICON_CATEGORIES = [
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
