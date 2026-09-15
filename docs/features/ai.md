---
title: Optional AI
description: Configure OpenAI-compatible providers using xsai for AI-suggested short codes and social preview metadata.
---

# Optional AI

Slite supports AI-assisted short-code creation and social-preview generation through [xsai](https://github.com/moeru-ai/xsai). The AI integration connects to any standard OpenAI-compatible API (such as OpenAI, DeepSeek, Ollama, or local inference engines).

AI is entirely **optional**; normal short-link creation and routing do not depend on it.

## Enabling AI

AI is disabled by default. Both `NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` must be explicitly configured:

```dotenv
NUXT_AI_BASE_URL=https://api.openai.com/v1
NUXT_AI_MODEL=gpt-4o-mini
NUXT_AI_API_KEY=sk-...
```

Until both variables are populated, AI endpoints return HTTP `501` immediately without initiating any outbound network requests. Restart the container after changing configuration.

- **Base URL:** Must include the provider's API path prefix where required (e.g. `/v1`).
- **Model:** Must be a model identifier supported by that provider.
- **API Key:** `NUXT_AI_API_KEY` may remain empty when connecting to self-hosted or local providers (e.g. Ollama) that do not require authentication.

## Supported endpoints

- `GET /api/link/ai?url=...` — suggests concise, memorable short codes based on the destination URL passed via query.
- `GET /api/link/og-ai?url=...&locale=...` — suggests OpenGraph titles and descriptions based on the destination URL passed via query. Supports an optional `locale` query parameter to specify the preferred response language.

If the upstream model call fails or times out, Slite falls back automatically to URL-derived heuristics rather than failing your link creation flow.

## Data privacy and boundary

::: tip URL-only transmission
Slite **only transmits the destination URL** you supply to the configured AI provider. Slite never scrapes, downloads, or forwards third-party webpage content to the AI model.
:::

Before enabling AI, review the terms, data retention policies, and pricing of your chosen model provider. Never submit URLs containing embedded private tokens or sensitive parameters.
