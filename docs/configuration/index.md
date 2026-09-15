---
title: Configuration Reference
description: Every supported Slite environment variable — core settings, AI options, public overrides, runtime behaviors, and advanced defaults.
---

# Configuration Reference

All environment variables are strings. Boolean switches accept `true` and `false`. Restart the Node.js process or recreate the Docker container after modifying configuration.

## Core configuration

| Variable                   | Default | Purpose                                                                                                                                                                                 |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_SITE_TOKEN`          | Empty   | Dashboard and API authentication token (at least 8 characters, no whitespace). When unset, generates an in-memory random token; administration remains inaccessible.                    |
| `NUXT_DATA_DIR`            | `/data` | Writable local persistent directory where SQLite, DuckDB, images, and backups reside.                                                                                                   |
| `NUXT_TRUST_PROXY`         | `false` | Set to `true` only when running behind a trusted reverse proxy that strips or rewrites untrusted incoming forwarding headers.                                                           |
| `NUXT_CLIENT_IP_HEADER`    | Empty   | Optional proxy header containing the client IP (e.g. `CF-Connecting-IP`). When set, trusts only this header ahead of `X-Forwarded-For`.                                                 |
| `NUXT_GEOIP_PATH`          | Empty   | Optional path to an MMDB database file. Takes precedence over `/data/geoip.mmdb` and the bundled DB-IP City Lite database.                                                              |
| `NUXT_DISABLE_AUTO_BACKUP` | `false` | Set to `true` to disable automatic link backups (scheduled every 24 hours after startup). The latest 30 automatic backups are retained; manual backups are never removed automatically. |

::: warning Set `NUXT_SITE_TOKEN`
Always configure an explicit `NUXT_SITE_TOKEN` in production. It must be at least 8 characters long and contain no whitespace. Without it, Slite generates an ephemeral random token that exists only in memory for that process run. Public links will resolve, but the dashboard and protected API endpoints will refuse login.
:::

## Optional AI

AI capabilities are completely disabled until **both** `NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` are set. While unset, AI endpoints return HTTP `501` without making external requests. See [Optional AI](/features/ai).

| Variable            | Default  | Purpose                                                                                                    |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `NUXT_AI_BASE_URL`  | Empty    | OpenAI-compatible API base URL, including any required path prefix (e.g. `https://api.openai.com/v1`).     |
| `NUXT_AI_MODEL`     | Empty    | Model identifier supported by your provider (e.g. `gpt-4o-mini`).                                          |
| `NUXT_AI_API_KEY`   | Empty    | Provider API key; may be left empty when using local or self-hosted models that require no authentication. |
| `NUXT_AI_PROMPT`    | Built-in | Custom prompt for the short-code assistant. Must retain the `{slugRegex}` placeholder.                     |
| `NUXT_AI_OG_PROMPT` | Built-in | Custom prompt for generating OpenGraph social preview titles and descriptions.                             |

## Public overrides

Settings applied at the frontend / UI level:

| Variable                          | Default | Purpose                                                                                                                                     |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_PREVIEW_MODE`        | `false` | Read-only demo mode: link edits and deletions are disabled, and new links expire automatically after 5 minutes.                             |
| `NUXT_PUBLIC_SLUG_DEFAULT_LENGTH` | `6`     | Character length of auto-generated random short codes.                                                                                      |
| `NUXT_PUBLIC_IMPORT_BATCH_LIMIT`  | `50`    | Dashboard import batch chunk size; each batch request sends at most half this number (default 25 records). Export page size is fixed at 50. |

## Optional runtime options

| Variable                  | Default | Purpose                                                                                                         |
| ------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `NUXT_HOME_URL`           | Empty   | Redirect the root path `/` to this URL; when empty, shows the built-in Slite homepage.                          |
| `NUXT_NOT_FOUND_REDIRECT` | Empty   | Destination URL for unknown short codes (**always HTTP 302**).                                                  |
| `NUXT_SAFE_BROWSING_DOH`  | Empty   | DNS-over-HTTPS JSON endpoint for unsafe-link verification (e.g. `https://family.cloudflare-dns.com/dns-query`). |
| `NUXT_WEBHOOK_URL`        | Empty   | HTTP(S) endpoint URL for asynchronous [click webhooks](/configuration/webhooks).                                |
| `NUXT_WEBHOOK_SECRET`     | Empty   | HMAC signing secret for webhooks. Must start with `whsec_`.                                                     |

## Advanced defaults

| Variable                      | Default | Purpose                                                                                                                    |
| ----------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_REDIRECT_STATUS_CODE`   | `301`   | HTTP status code for successful short-link redirects (`301`, `302`, `307`, or `308`). Unknown-slug redirects remain `302`. |
| `NUXT_REDIRECT_WITH_QUERY`    | `false` | `true` appends visitor query strings (e.g. `?utm_source=...`) to the destination URL.                                      |
| `NUXT_REDIRECT_NO_STORE`      | `false` | `true` instructs browsers not to cache short-link redirect responses (`Cache-Control: no-store`).                          |
| `NUXT_CASE_SENSITIVE`         | `false` | `true` treats custom short codes as case-sensitive (`Docs` ≠ `docs`). Auto-generated codes remain lowercase.               |
| `NUXT_IMPORT_REQUEST_LIMIT`   | `100`   | Maximum number of links accepted in a single `POST /api/link/import` request.                                              |
| `NUXT_LIST_QUERY_LIMIT`       | `500`   | Maximum number of records returned in dashboard list queries.                                                              |
| `NUXT_DISABLE_BOT_ACCESS_LOG` | `false` | `true` drops detected bot traffic from DuckDB analytics and click webhook events.                                          |
| `NUXT_API_CORS`               | `false` | Build-time option: `true` enables CORS on `/api/**` for source builds and `nuxt dev`. Baked into build output.             |

## Security and storage best practices

- **Keep `/data` private:** Never expose the data directory through static web servers or public reverse proxy paths.
- **Single process:** Run only one Node.js process per persistent data directory. Do not run clustered instances against the same SQLite or DuckDB files.
- **Docker Compose environment precedence:** Compose applies shell variables over `.env`, and `.env` over the default values specified in `compose.yaml`.
- **Proxy trust:** Only enable `NUXT_TRUST_PROXY=true` if your deployment sits strictly behind a reverse proxy that overwrites incoming client IP headers.
