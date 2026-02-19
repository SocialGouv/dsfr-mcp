import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ComponentEntry, SearchResult, ToolTextResult } from "./types.js";
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
