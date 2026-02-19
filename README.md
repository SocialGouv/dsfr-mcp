# DSFR MCP Server

An [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that exposes the documentation of the **French State Design System** ([DSFR](https://www.systeme-de-design.gouv.fr/) — Systeme de Design de l'Etat) to AI assistants.

## Why?

When integrating Figma mockups based on the DSFR into a React (or any other) codebase, AI assistants need access to the official documentation to produce compliant components: correct HTML structure, CSS classes, variants, and accessibility requirements.

This MCP server gives assistants structured access to the full DSFR documentation — directly within the conversation context.

## Quick Start

### Via npx (recommended)

No installation needed — just configure your MCP client:

```json
{
  "mcpServers": {
    "dsfr": {
      "command": "npx",
      "args": ["dsfr-mcp"]
    }
  }
}
```

### From source

```bash
pnpm install
pnpm run setup    # Fetches DSFR docs and builds the server
```

## Available Tools

| Tool | Description |
|---|---|
| `list_components` | Lists all DSFR components, fundamentals, and patterns with their name, French title, description, and available doc sections. |
| `get_component_doc` | Returns the documentation for a specific component section (`overview`, `code`, `design`, `accessibility`, `demo`). Defaults to `code`. Suggests alternatives if the component name is not found. |
| `search_components` | Full-text search across all DSFR documentation — metadata and markdown content. Returns matching components with excerpts. |

## Configuration

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "dsfr": {
      "command": "npx",
      "args": ["dsfr-mcp"]
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
      "command": "npx",
      "args": ["dsfr-mcp"]
    }
  }
}
```

### Cursor

Add an MCP server in Cursor settings with command `npx` and argument `dsfr-mcp`.

## DSFR Version

The documentation is extracted from a pinned version of the [official DSFR repository](https://github.com/GouvernementFR/dsfr). The current DSFR version is tracked in `docs/meta.json` and visible at build time.

To fetch a specific version:

```bash
DSFR_TAG=v1.14.3 pnpm run fetch-docs
```

## Development

```bash
pnpm build            # Compile TypeScript
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm run fetch-docs   # Re-fetch DSFR documentation
```

### Releases

Releases are automated with [semantic-release](https://github.com/semantic-release/semantic-release). Use [Conventional Commits](https://www.conventionalcommits.org/):

- `fix:` — patch release
- `feat:` — minor release
- `feat!:` or `BREAKING CHANGE:` — major release

Pushing to `main` triggers the release workflow which publishes to npm and creates a GitHub Release.

### Required Secrets

- `NPM_TOKEN` — npm access token for publishing

## License

MIT
