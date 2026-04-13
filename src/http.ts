#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createDsfrServer } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

const PORT = Number.parseInt(process.env.PORT ?? "10000", 10);
const HOST = "0.0.0.0";
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS?.split(",").map((s) => s.trim());

const app = createMcpExpressApp({ host: HOST, allowedHosts: ALLOWED_HOSTS });

app.get("/", (_req: Request, res: Response) => {
  res.type("text/plain").send("DSFR MCP server — POST /mcp (Streamable HTTP)\n");
});

app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const server = createDsfrServer({ docsDir: DOCS_DIR });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.listen(PORT, HOST, () => {
  console.log(`DSFR MCP HTTP server listening on http://${HOST}:${PORT}`);
});
