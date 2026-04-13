#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDsfrServer } from "./server.js";

// Resolve docs relative to the installed package location (build/../docs)
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

async function main() {
  const server = createDsfrServer({ docsDir: DOCS_DIR });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DSFR MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
