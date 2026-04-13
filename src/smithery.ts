import { createDsfrServer } from "./server.js";

// Smithery TypeScript runtime entry: receives a config object and returns
// the underlying low-level MCP Server. No configuration is needed for DSFR.
function createServer() {
  return createDsfrServer().server;
}

// Used by Smithery during build-time tool/resource scanning (no real config needed).
export function createSandboxServer() {
  return createServer();
}

export default createServer;
