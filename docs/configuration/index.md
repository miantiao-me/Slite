# Configuration

Set runtime environment variables on the Node.js process or through Compose. Use `.env.example` as the configuration template. Restart the process after changing runtime configuration.

## Core

| Variable                   | Requirement / default                    | Purpose                                                                                                                                                 |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_SITE_TOKEN`          | Optional; at least 8 characters when set | Dashboard and API authentication; unset starts with a process-only random token that is never logged or persisted                                       |
| `NUXT_DATA_DIR`            | `/data`                                  | Writable local persistent directory                                                                                                                     |
| `NUXT_TRUST_PROXY`         | `false`                                  | Trust forwarded client information only behind a controlled proxy                                                                                       |
| `NUXT_GEOIP_PATH`          | Empty                                    | Optional MMDB file with priority over `/data/geoip.mmdb` and the DB-IP City Lite database bundled in the image                                          |
| `NUXT_DISABLE_AUTO_BACKUP` | `false`                                  | Set to `true` to disable daily automatic link backups; the latest 30 automatic backups are retained, while manual backups are not automatically removed |

## Optional AI

AI is disabled until `NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` are explicitly set; while either is empty, the AI routes return `501` and make no outbound request. See [AI](/features/ai) for endpoint behavior and data-sharing considerations.

| Variable           | Default  | Purpose                                                                                                                  |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NUXT_AI_BASE_URL` | Empty    | OpenAI-compatible API base URL, including the provider's API prefix; required together with the model to enable AI       |
| `NUXT_AI_MODEL`    | Empty    | Model identifier supported by that provider; required together with the base URL to enable AI                            |
| `NUXT_AI_API_KEY`  | Empty    | AI provider API key; may stay empty when the provider does not require one                                               |
| `NUXT_AI_PROMPT`   | Built-in | Custom slug-assistant prompt; keep the `{slugRegex}` placeholder                                                         |
| `NUXT_AI_OG_PROMPT` | Built-in | Custom OpenGraph title and description prompt                                                                          |

## Public overrides

| Variable                          | Default | Purpose                                                                                                  |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_PREVIEW_MODE`        | `false` | Read-only preview deployment: link edits and deletes are rejected, and new links expire after 5 minutes |
| `NUXT_PUBLIC_SLUG_DEFAULT_LENGTH` | `6`     | Length of auto-generated slugs                                                                           |
| `NUXT_PUBLIC_IMPORT_BATCH_LIMIT`  | `50`    | Dashboard import page size; each import request carries at most half of it                               |

## Optional runtime

| Variable                  | Default  | Purpose                                                                              |
| ------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `NUXT_HOME_URL`           | Empty    | Redirect `/` to this URL; empty shows the built-in homepage                          |
| `NUXT_NOT_FOUND_REDIRECT` | Empty    | Where to send unknown slugs (always HTTP 302)                                        |
| `NUXT_SAFE_BROWSING_DOH`  | Empty    | DNS-over-HTTPS JSON endpoint for unsafe-link detection; empty disables the check     |
| `NUXT_WEBHOOK_URL`        | Optional | Click-event delivery endpoint                                                        |
| `NUXT_WEBHOOK_SECRET`     | Optional | Webhook signing secret; must start with `whsec_`                                     |

## Advanced defaults

| Variable                      | Default | Purpose                                                                                                                                |
| ----------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_REDIRECT_STATUS_CODE`   | `301`   | Redirect status for link hits (`302` / `307` / `308` also work); unknown-slug redirects stay `302`                                     |
| `NUXT_REDIRECT_WITH_QUERY`    | `false` | `true` appends the visitor's query parameters to the target URL                                                                        |
| `NUXT_REDIRECT_NO_STORE`      | `false` | `true` asks browsers not to cache redirects                                                                                            |
| `NUXT_CASE_SENSITIVE`         | `false` | `true` keeps custom slug case (`Docs` ≠ `docs`); `false` tries the lowercase slug first                                                |
| `NUXT_IMPORT_REQUEST_LIMIT`   | `100`   | Maximum links accepted per `POST /api/link/import` request                                                                             |
| `NUXT_LIST_QUERY_LIMIT`       | `500`   | Maximum rows returned by dashboard list queries                                                                                        |
| `NUXT_DISABLE_BOT_ACCESS_LOG` | `false` | `true` drops detected bots from analytics and webhook delivery                                                                         |
| `NUXT_API_CORS`               | `false` | Build-time only: exactly `true` enables CORS on `/api/**` when building or running from source; baked into the server output and ignored by the released image |

## Security and persistence

Never commit real secrets. Anyone with the site token can administer your instance. Keep `/data` outside public static directories and mount it on local persistent storage. Do not run multiple processes against it.

When `NUXT_SITE_TOKEN` is unset or empty, the process generates a random token that exists only in memory: public short-link redirects keep working, but `/dashboard` and `/api/**` cannot be authenticated until you configure a token and restart. The generated value is never logged, written to disk, or exposed through an API, and it changes on every restart. A configured token shorter than 8 characters refuses startup.

Keep custom host data directories outside the Docker build context, or exclude the entire directory in `.dockerignore`, so uploads and backups cannot be copied into the image. With Compose, `NUXT_DATA_DIR` is the container path, not the host volume location. The supplied Compose service loads the project `.env` through `env_file`, so variables defined there reach the container; its `environment` entries are interpolated at `docker compose` time, where shell environment values override `.env` and `.env` overrides the defaults written in `compose.yaml`.

Leave proxy trust disabled if the application is directly reachable. Enable it only when a trusted proxy strips or replaces incoming forwarded headers and the application cannot be reached around that proxy. Proxy trust only determines which client IP is used for an available GeoIP database; it does not provide geographic metadata by itself.

## GeoIP

Geographic metadata is optional. Slite uses the first readable database it finds: `NUXT_GEOIP_PATH`, then `/data/geoip.mmdb`, then `/data/dbip-city-lite.mmdb`, and finally the DB-IP City Lite database bundled in release images. Lookups fail open when no database exists, and City Lite does not contain time-zone data. See [Docker and Compose](/deployment/docker#geoip-database) for the bundled data and its CC BY 4.0 attribution.
