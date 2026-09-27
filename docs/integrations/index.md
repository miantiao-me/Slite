---
title: Integrations
description: Connect Slite to AI coding assistants through its built-in MCP server, plus OpenAPI-to-MCP proxies, browser extensions, Raycast, Apple Shortcuts, and mobile apps.
---

# Integrations

Slite provides an authenticated REST API and automatically generated OpenAPI specifications for automation and third-party tooling.

Because Slite maintains API contract compatibility with Sink, applications designed for Sink that support custom endpoint URLs and site tokens can connect seamlessly to your self-hosted Slite instance.

## AI Skills

Install the official Slite skill for AI coding assistants:

```sh
npx skills add miantiao-me/Slite
```

The skill definition lives in [`skills/slite/SKILL.md`](https://github.com/miantiao-me/Slite/blob/master/skills/slite/SKILL.md) in the repository.

## MCP Server

Slite serves a Model Context Protocol endpoint at `POST /api/mcp`. It uses the official [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server) SDK v2 entry point, serving modern clients over the per-request transport and 2025-era clients over the stateless fallback with JSON responses, so current MCP clients work without extra configuration and older protocol versions stay compatible through the SDK's own version negotiation.

The endpoint authenticates with the same bearer token as the REST API, so no separate credential is needed. See [API authentication](/api/#authentication).

```sh
claude mcp add --transport http slite https://your-domain/api/mcp --header "Authorization: Bearer YOUR_SITE_TOKEN"
```

Any client that supports an HTTP transport with custom headers can connect the same way:

```json
{
  "mcpServers": {
    "slite": {
      "type": "http",
      "url": "https://your-domain/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SITE_TOKEN"
      }
    }
  }
}
```

### Tools

| Tool                     | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `list_links`             | List links newest first, with cursor pagination.      |
| `search_links`           | Search links by keyword or exact destination URL.     |
| `get_link`               | Read a single link by slug.                           |
| `count_links`            | Count links matching a keyword, URL, tag, or status.  |
| `list_tags`              | List tags in use and how many links carry each.       |
| `create_link`            | Create a link, generating a slug when none is given.  |
| `update_link`            | Replace every writable field of an existing link.     |
| `upsert_link`            | Return the existing link for a slug, or create it.    |
| `delete_link`            | Permanently delete a link.                            |
| `check_links`            | Check stored link targets, paginated by slug.         |
| `get_analytics_counters` | Total visits, visitors, and referers.                 |
| `get_analytics_views`    | Visits and visitors bucketed by minute, hour, or day. |
| `get_analytics_metrics`  | Top values for one access-log dimension.              |
| `get_analytics_heatmap`  | Visits and visitors by weekday and hour of day.       |

The write tools honor `NUXT_PUBLIC_PREVIEW_MODE` exactly as the REST API does. For `update_link`, sending an empty `password` clears protection while omitting it keeps the stored one.

The endpoint sits under `/api/` so it stays out of the short-link namespace: a slug cannot contain a slash, so no link can shadow it and no reserved slug is needed. Upgrading never takes a slug away from an instance that already uses one.

## OpenAPI to MCP

An OpenAPI proxy is an alternative when a client cannot reach the built-in endpoint, for example because it only supports stdio servers.

Prerequisites: Install [`uv`](https://github.com/astral-sh/uv) so the `uvx` runner is available.

```json
{
  "mcpServers": {
    "slite": {
      "command": "uvx",
      "args": ["mcp-openapi-proxy"],
      "env": {
        "OPENAPI_SPEC_URL": "https://your-domain/_docs/openapi.json",
        "API_KEY": "YOUR_SITE_TOKEN",
        "TOOL_WHITELIST": "/api/link"
      }
    }
  }
}
```

Replace `https://your-domain` with your deployed instance address, and replace `YOUR_SITE_TOKEN` with the value configured in `NUXT_SITE_TOKEN`. Protect client configuration files containing this token as secrets.

## Compatible apps and extensions

- **Browser Extension:** [Sink Tool](https://github.com/zhuzhuyule/sink-extension)
- **Chrome Extension:** [Sink Quick Shorten](https://chromewebstore.google.com/detail/sink-quick-shorten/emlojomjpenjgkaphajcokijobpkejih)
- **Raycast Extension:** [Raycast-Sink](https://github.com/foru17/raycast-sink)
- **Apple Shortcuts:** [Sink Shortcuts](https://s.search1api.com/sink001)
- **iOS App:** [Sink for iOS](https://apps.apple.com/app/id6745417598)

When configuring third-party extensions, input your Slite deployment URL (e.g. `https://links.example.com`) and your `NUXT_SITE_TOKEN` in the settings dialog.

::: tip Browser extensions and CORS
Because `NUXT_API_CORS` is a build-time option that cannot be toggled at runtime in official release Docker images, configure your reverse proxy (such as Caddy or Nginx) to allow the necessary CORS headers and origins if an extension makes cross-origin requests directly to `/api/**`.
:::

::: warning Protect your site token
Never hardcode `NUXT_SITE_TOKEN` into public GitHub repositories, client-side web pages, or untrusted scripts. Anyone possessing the site token has full administrative authority over your links and data.
:::
