# Architecture

Slite is a client-only Nuxt application served by a Nitro Node.js server. Public short-link resolution runs before API authentication; administration and `/api/**` requests require the site token.

## Local storage

All persistent data lives under `NUXT_DATA_DIR` (default `/data`):

| Relative path      | Responsibility                                         |
| ------------------ | ------------------------------------------------------ |
| `slite.sqlite`     | Authoritative links and application state              |
| `analytics.duckdb` | Analytics events and queries                           |
| `files/images`     | Uploaded image files (unstorage filesystem driver)     |
| `backups`          | Link-export backup files (unstorage filesystem driver) |

SQLite remains authoritative. The link cache uses the unstorage memory driver: it is process-local, rebuildable, and never a second source of truth. A new process starts with an empty cache and repopulates it from SQLite on demand. Committed link writes synchronously invalidate cached entries. If cache operations fail, caching is disabled and reads fall back to SQLite. Uploaded images and link-export backups are written through the unstorage filesystem driver under `files/images` and `backups`.

Access link persistence through `server/utils/link-store.ts` and cache operations through `server/services/link-store/cache.ts`.

## Process model

Run one Node.js process per local data directory. SQLite, the in-memory link cache, and DuckDB are not a distributed storage layer. Multiple replicas, clustered workers, and network volumes are unsupported. Container replacement is safe only when the persistent volume is retained and no old process still uses it.

## Optional services

AI uses xsai with an OpenAI-compatible endpoint. It is not required for ordinary link management. Webhooks send click events to an explicitly configured endpoint. Geographic metadata uses the first readable GeoIP database, with DB-IP City Lite bundled in release Docker images; without one, lookups fail open and geographic fields stay empty. City Lite provides country, region, city, and coordinates but no time-zone or postcode data. See [GeoIP database](/deployment/docker#geoip-database).

The realtime dashboard polls and replays events; it is not an SSE or WebSocket stream.
