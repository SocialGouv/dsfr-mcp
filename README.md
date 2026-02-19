# DSFR MCP Server

An [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that exposes the documentation of the **French State Design System** ([DSFR](https://www.systeme-de-design.gouv.fr/) — Système de Design de l'État) to AI assistants.

## Why?

When integrating Figma mockups based on the DSFR into a React (or any other) codebase, AI assistants need access to the official documentation to produce compliant components: correct HTML structure, CSS classes, variants, and accessibility requirements.

This MCP server gives assistants structured access to the full DSFR documentation — directly within the conversation context.

## Available Tools

| Tool | Description |
|---|---|
| `list_components` | Lists all DSFR components, fundamentals, and patterns with their name, French title, description, and available doc sections. |
| `get_component_doc` | Returns the documentation for a specific component section (`overview`, `code`, `design`, `accessibility`, `demo`). Defaults to `code`. Suggests alternatives if the component name is not found. |
| `search_components` | Full-text search across all DSFR documentation — metadata and markdown content. Returns matching components with excerpts. |

## Setup

### Prerequisites

- Node.js >= 18
- pnpm

### Installation

```bash
pnpm install
pnpm run setup    # Fetches DSFR docs from GitHub and builds the server
```

The `setup` script clones the [official DSFR repository](https://github.com/GouvernementFR/dsfr) (sparse checkout), extracts the markdown documentation, and compiles the TypeScript server.

## Configuration

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "dsfr": {
      "command": "node",
      "args": ["/absolute/path/to/dsfr-mcp/build/index.js"]
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dsfr": {
      "command": "node",
      "args": ["/absolute/path/to/dsfr-mcp/build/index.js"]
    }
  }
}
```

### Cursor

Add an MCP server in Cursor settings with command `node` and argument pointing to the built `build/index.js`.

## Development

```bash
pnpm build            # Compile TypeScript
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm run fetch-docs   # Re-fetch DSFR documentation
```

## License

MIT
