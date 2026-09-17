# DSFR MCP Server

An [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that exposes the documentation of the **French State Design System** ([DSFR](https://www.systeme-de-design.gouv.fr/) — Systeme de Design de l'Etat) to AI assistants.

## Why?

When integrating Figma mockups based on the DSFR into a React (or any other) codebase, AI assistants need access to the official documentation to produce compliant components: correct HTML structure, CSS classes, variants, and accessibility requirements.

This MCP server gives assistants structured access to the full DSFR documentation — directly within the conversation context.

It also covers **DSFR Chart** (`@gouvfr/dsfr-chart`), the government's data-visualization add-on. That matters for a public-sector site: used on their own, DSFR Chart visualizations are **not RGAA-compliant** (criteria 1.1, 1.6, 3.1, 3.3, 4.8, 4.9, 4.12, 10.13, 10.14) and require an adjacent text alternative. It is the single easiest thing for an assistant to omit, so `get_chart_doc` states it on every answer.

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
| `list_components` | Lists all DSFR components, fundamentals, and patterns, plus the DSFR Chart visualizations. Returns the pinned DSFR and DSFR Chart versions, then, per entry, its name, French title, description, and available doc sections. Entries in the `chart` category carry a `tool: "get_chart_doc"` pointer instead of `sections`. |
| `get_component_doc` | Returns the documentation for a specific component section (`overview`, `code`, `design`, `accessibility`, `demo`, `usage`). Defaults to `code`. Output is cleaned of YAML frontmatter and DSFR navigation chrome. Suggests alternatives if the component name is not found. |
| `search_components` | Ranked full-text search across all DSFR documentation — metadata and markdown content — plus the DSFR Chart catalogue, returned in a separate block. Tokenizes the query, scores matches (metadata weighted above content), and returns the top results with the matching section and a clean excerpt. |
| `search_icons` | Search DSFR icons by name or category. Returns icon name, category, variants (fill/line), and CSS classes. Supports filtering by category (`arrows`, `system`, `business`, etc.). |
| `get_color_tokens` | Returns DSFR color tokens filtered by context (`background`, `text`, `artwork`), functional usage (`action`, `error`, `disabled`, etc.), or color family (`blue-france`, `grey`, `green-tilleul-verveine`, etc.). Includes light/dark theme mappings. |
| `get_component_accessibility` | Returns structured RGAA accessibility data for a component: keyboard interactions, accessibility rules (with do/don't guidelines), color contrasts, screen-reader behavior, applicable RGAA criteria, and references. Suggests alternatives when the component has no accessibility section. |
| `get_component_code` | Extracts ready-to-use HTML code examples (with their labels) and the deduplicated list of `fr-*` CSS classes from a component's `code` section. Suggests alternatives when the component or its code section is missing. |
| `get_chart_doc` | Returns the documentation for a DSFR Chart visualization (`bar-chart`, `line-chart`, `pie-chart`, `map-chart`, `data-box`, …): custom element tag, required and optional HTML attributes with their type and default, and ready-to-use examples. Also serves four cross-cutting topics: `install`, `colors`, `accessibility`, `databox`. **DSFR Chart is a separate npm package (`@gouvfr/dsfr-chart`) of Vue web components, not DSFR CSS classes.** |

## Configuration

### Claude Code

Available across all your projects (recommended):

```bash
claude mcp add dsfr --scope user -- npx dsfr-mcp
```

Or for a single project, add to your `.mcp.json`:

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

## Upstream versions

Documentation is extracted from two pinned upstream repositories:

| Source | Env var | Current pin |
|---|---|---|
| [GouvernementFR/dsfr](https://github.com/GouvernementFR/dsfr) | `DSFR_TAG` | `v1.15.3` |
| [GouvernementFR/dsfr-chart](https://github.com/GouvernementFR/dsfr-chart) | `DSFR_CHART_TAG` | `v2.1.1` |

Both pins, their resolved commits, the fetch timestamp and the extraction counts land in `docs/meta.json`. `list_components` reports the two versions, so a client always knows which release it is reading about.

To fetch different versions:

```bash
DSFR_TAG=v1.14.3 DSFR_CHART_TAG=v2.0.5 pnpm run fetch-docs   # pin an older release
```

`fetch-docs` fails (non-zero exit) if any extractor falls below its sanity floor — for instance if upstream moves a documentation page and the colour tokens come out empty. This is deliberate: `prepublishOnly` runs `fetch-docs`, and a half-extracted corpus must never reach npm.

> Charts are read from git rather than npm: the `@gouvfr/dsfr-chart` tarball ships no `src/` (only the minified `dist/`, plus the README), while the Vue sources and `src/assets/colors.json` are the authoritative list of attributes, types and defaults.

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
