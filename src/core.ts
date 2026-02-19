import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ComponentEntry, SearchResult, ToolTextResult, IconEntry, ColorsIndex } from "./types.js";
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
  const content = readFileWithCache(filePath, cache);
  if (content === undefined) {
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
        text: `# ${entry.title} — ${section}\n\n${content}`,
      },
    ],
  };
}

export function searchComponents(
  index: ComponentEntry[],
  docsDir: string,
  query: string,
  cache: LRUCache<string, string>,
): ToolTextResult {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const entry of index) {
    const metaMatch =
      entry.name.toLowerCase().includes(q) ||
      entry.title.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q);

    if (metaMatch) {
      results.push({
        name: entry.name,
        title: entry.title,
        category: entry.category,
        matchType: "metadata",
        excerpt: entry.description,
      });
      continue;
    }

    for (const section of entry.sections) {
      const filePath = join(docsDir, entry.category, entry.name, `${section}.md`);
      const content = readFileWithCache(filePath, cache);
      if (!content) continue;

      const lowerContent = content.toLowerCase();
      const idx = lowerContent.indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(content.length, idx + q.length + 80);
        const excerpt =
          (start > 0 ? "..." : "") +
          content.slice(start, end).replace(/\n/g, " ") +
          (end < content.length ? "..." : "");
        results.push({
          name: entry.name,
          title: entry.title,
          category: entry.category,
          matchType: `content (${section})`,
          excerpt,
        });
        break;
      }
    }
  }

  if (results.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Aucun résultat pour "${query}". Essayez un autre terme ou utilisez list_components pour voir tous les composants.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `${results.length} résultat(s) pour "${query}" :\n\n${results.map((r) => `- **${r.name}** (${r.title}) [${r.category}] — ${r.matchType}\n  ${r.excerpt}`).join("\n\n")}`,
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
