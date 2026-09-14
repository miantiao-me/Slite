# Optional AI

Slite can use an OpenAI-compatible provider through xsai for AI-assisted short-link and social-preview suggestions. Ordinary link management does not require it.

## Enable

`NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` are empty by default. Until both are explicitly set to an OpenAI-compatible endpoint and model, the AI routes return `501` and make no outbound request. Restart the process after changing them.

The base URL must include the provider's API prefix where required, and the model must support the operation you request. `NUXT_AI_API_KEY` may stay empty when the provider does not require a key.

The routes are `/api/link/ai` for slug suggestions and `/api/link/og-ai` for title and description; the latter accepts an optional `locale` query parameter. Once configured, a failing provider call falls back to URL-derived values instead of failing the request.

## Data sharing

AI requests send only the destination URL you provide to the configured provider; Slite does not fetch page content. Review the provider's retention policy and pricing before enabling AI, and never submit secrets. Check the endpoint, model availability, credentials, and outbound network access when generation fails.
