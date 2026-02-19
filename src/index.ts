import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIndex, listComponents, getComponentDoc, searchComponents } from "./core.js";
import { LRUCache } from "./cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

const index = loadIndex(DOCS_DIR);
const cache = new LRUCache<string, string>(50);

const server = new McpServer({
  name: "dsfr",
  version: "1.0.0",
});

server.tool(
  "list_components",
  "Liste tous les composants, fondamentaux et modèles DSFR disponibles. Retourne nom, titre français, description et sections documentées.",
  {},
  async () => listComponents(index),
);

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
  async ({ name, section }) => getComponentDoc(index, DOCS_DIR, name, section, cache),
);

server.tool(
  "search_components",
  "Recherche dans la documentation DSFR par mot-clé. Cherche dans les noms, titres, descriptions et le contenu des fichiers markdown.",
  {
    query: z.string().describe("Mot-clé de recherche (ex: 'tableau', 'navigation', 'formulaire', 'fr-btn')"),
  },
  async ({ query }) => searchComponents(index, DOCS_DIR, query, cache),
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
