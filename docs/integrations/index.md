---
title: Integrations
description: Connect Slite to AI coding assistants, OpenAPI-to-MCP proxies, browser extensions, Raycast, Apple Shortcuts, and mobile apps.
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

## OpenAPI to MCP

While Slite does not bundle a native Model Context Protocol (MCP) server, you can expose its OpenAPI schema to any MCP client using an OpenAPI-to-MCP proxy.

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
