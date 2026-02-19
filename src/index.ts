import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

interface ComponentEntry {
  name: string;
  title: string;
  description: string;
  category: "component" | "core" | "layout" | "pattern";
  sections: string[];
}

function loadIndex(): ComponentEntry[] {
  const indexPath = join(DOCS_DIR, "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(
      `Documentation index not found at ${indexPath}. Run "pnpm run fetch-docs" first.`,
    );
  }
  return JSON.parse(readFileSync(indexPath, "utf-8"));
}

const index = loadIndex();

const server = new McpServer({
  name: "dsfr",
  version: "1.0.0",
});

// Tool 1: List all available DSFR components/entries
server.tool(
  "list_components",
  "Liste tous les composants, fondamentaux et modèles DSFR disponibles. Retourne nom, titre français, description et sections documentées.",
  {},
  async () => {
    const list = index.map((e) => ({
      name: e.name,
      title: e.title,
      description: e.description,
      category: e.category,
      sections: e.sections,
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(list, null, 2),
        },
      ],
    };
  },
);

// Tool 2: Get documentation for a specific component
server.tool(
  "get_component_doc",
  "Retourne la documentation d'un composant DSFR. La section 'code' contient la structure HTML, les classes CSS et les variantes. La section 'overview' donne une vue d'ensemble. La section 'accessibility' donne les exigences d'accessibilité.",
  {
    name: z.string().describe("Nom du composant (ex: 'button', 'input', 'accordion', 'card')"),
    section: z
      .enum(["overview", "code", "design", "accessibility", "demo"])
      .default("code")
      .describe("Section de la doc à lire (défaut: 'code')"),
  },
  async ({ name, section }) => {
    const entry = index.find(
      (e) => e.name === name || e.name === name.toLowerCase(),
    );
    if (!entry) {
      const suggestions = index
        .filter((e) => e.name.includes(name.toLowerCase()) || e.title.toLowerCase().includes(name.toLowerCase()))
        .map((e) => `${e.name} (${e.title})`)
        .slice(0, 5);
      return {
        content: [
          {
            type: "text",
            text: `Composant "${name}" non trouvé.${suggestions.length > 0 ? ` Suggestions : ${suggestions.join(", ")}` : ""}\nUtilisez list_components pour voir la liste complète.`,
          },
        ],
      };
    }

    const filePath = join(DOCS_DIR, entry.category, entry.name, `${section}.md`);
    if (!existsSync(filePath)) {
      return {
        content: [
          {
            type: "text",
            text: `Section "${section}" non disponible pour ${entry.name} (${entry.title}). Sections disponibles : ${entry.sections.join(", ")}`,
          },
        ],
      };
    }

    const content = readFileSync(filePath, "utf-8");
    return {
      content: [
        {
          type: "text",
          text: `# ${entry.title} — ${section}\n\n${content}`,
        },
      ],
    };
  },
);

// Tool 3: Search across all documentation
server.tool(
  "search_components",
  "Recherche dans la documentation DSFR par mot-clé. Cherche dans les noms, titres, descriptions et le contenu des fichiers markdown.",
  {
    query: z.string().describe("Mot-clé de recherche (ex: 'tableau', 'navigation', 'formulaire', 'fr-btn')"),
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const results: Array<{
      name: string;
      title: string;
      category: string;
      matchType: string;
      excerpt: string;
    }> = [];

    for (const entry of index) {
      // Check metadata match
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

      // Search in file contents
      for (const section of entry.sections) {
        const filePath = join(DOCS_DIR, entry.category, entry.name, `${section}.md`);
        if (!existsSync(filePath)) continue;

        const content = readFileSync(filePath, "utf-8");
        const lowerContent = content.toLowerCase();
        const idx = lowerContent.indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(content.length, idx + q.length + 80);
          const excerpt = (start > 0 ? "..." : "") + content.slice(start, end).replace(/\n/g, " ") + (end < content.length ? "..." : "");
          results.push({
            name: entry.name,
            title: entry.title,
            category: entry.category,
            matchType: `content (${section})`,
            excerpt,
          });
          break; // One match per entry is enough
        }
      }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Aucun résultat pour "${query}". Essayez un autre terme ou utilisez list_components pour voir tous les composants.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${results.length} résultat(s) pour "${query}" :\n\n${results.map((r) => `- **${r.name}** (${r.title}) [${r.category}] — ${r.matchType}\n  ${r.excerpt}`).join("\n\n")}`,
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DSFR MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
