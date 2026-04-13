import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { loadIndex, listComponents, getComponentDoc, searchComponents, loadIcons, loadColors, searchIcons, getColorTokens } from "./core.js";
import { LRUCache } from "./cache.js";
import type { ComponentEntry, IconEntry, ColorsIndex } from "./types.js";

function resolveDocsDir(hint?: string): string {
  const candidates = [
    hint,
    process.env.DSFR_DOCS_DIR,
    join(process.cwd(), "docs"),
    join(process.cwd(), "build", "..", "docs"),
  ].filter((x): x is string => Boolean(x));
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.json"))) return dir;
  }
  return join(process.cwd(), "docs");
}

interface DsfrData {
  docsDir: string;
  index: ComponentEntry[];
  icons: IconEntry[];
  colors: ColorsIndex;
  cache: LRUCache<string, string>;
}

function makeLazyData(docsDirHint?: string): () => DsfrData {
  let cached: DsfrData | undefined;
  return () => {
    if (cached) return cached;
    const docsDir = resolveDocsDir(docsDirHint);
    cached = {
      docsDir,
      index: loadIndex(docsDir),
      icons: loadIcons(docsDir),
      colors: loadColors(docsDir),
      cache: new LRUCache<string, string>(50),
    };
    return cached;
  };
}

export function createDsfrServer(opts: { docsDir?: string } = {}): McpServer {
  const getData = makeLazyData(opts.docsDir);

  const server = new McpServer({
    name: "dsfr",
    version: "1.0.0",
  });

  server.tool(
    "list_components",
    "Liste tous les composants, fondamentaux et modèles DSFR disponibles. Retourne nom, titre français, description et sections documentées.",
    {},
    async () => listComponents(getData().index),
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
    async ({ name, section }) => {
      const d = getData();
      return getComponentDoc(d.index, d.docsDir, name, section, d.cache);
    },
  );

  server.tool(
    "search_components",
    "Recherche dans la documentation DSFR par mot-clé. Cherche dans les noms, titres, descriptions et le contenu des fichiers markdown.",
    {
      query: z.string().describe("Mot-clé de recherche (ex: 'tableau', 'navigation', 'formulaire', 'fr-btn')"),
    },
    async ({ query }) => {
      const d = getData();
      return searchComponents(d.index, d.docsDir, query, d.cache);
    },
  );

  server.tool(
    "search_icons",
    "Recherche des icônes DSFR par nom ou catégorie. Retourne le nom, la catégorie, les variantes (fill/line) et les classes CSS correspondantes.",
    {
      query: z.string().describe("Terme de recherche (ex: 'download', 'arrow', 'user')"),
      category: z
        .enum([
          "arrows", "buildings", "business", "communication", "design",
          "development", "device", "document", "editor", "finance",
          "health", "logo", "map", "media", "others", "system", "user", "weather",
        ])
        .optional()
        .describe("Filtrer par catégorie d'icônes (optionnel)"),
    },
    async ({ query, category }) => searchIcons(getData().icons, query, category),
  );

  server.tool(
    "get_color_tokens",
    "Retourne les tokens de couleur DSFR par contexte, usage ou famille de couleur. Inclut les correspondances thème clair/sombre.",
    {
      context: z
        .enum(["background", "text", "artwork"])
        .optional()
        .describe("Contexte d'utilisation (fond, texte, illustration)"),
      usage: z
        .string()
        .optional()
        .describe("Usage fonctionnel (ex: 'action', 'error', 'disabled', 'active', 'success')"),
      family: z
        .string()
        .optional()
        .describe("Famille de couleur (ex: 'blue-france', 'grey', 'error', 'green-tilleul-verveine')"),
    },
    async ({ context, usage, family }) => getColorTokens(getData().colors, { context, usage, family }),
  );

  return server;
}
