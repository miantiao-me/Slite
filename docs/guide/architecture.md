---
title: Architecture
description: How Slite handles the dashboard, API, redirects, local storage, memory caching, and DuckDB analytics.
---

# Architecture

Slite runs a client-only Nuxt 4 frontend served by a single Nitro Node.js backend process, storing all data locally without external cloud dependencies.

## What happens when someone opens a short link

1. **Resolution:** A visitor requests a short link on your domain. Public redirect resolution executes before administrative authentication.
2. **Lookup & cache:** Slite checks its in-memory link cache. If missing, it fetches the record from authoritative SQLite storage and populates the cache.
3. **Evaluation:** Slite evaluates stored link rules: expiration, password protection, the persisted unsafe flag (DoH checks occur at link creation or editing time, never during redirects), and smart routing (device or country overrides).
4. **Redirect & logging:** Slite returns the HTTP redirect (default 301) and asynchronously records a visit event into local DuckDB analytics.
5. **Administration:** You manage links, export data, and inspect reports through `/dashboard` or the REST API, both authenticated by `NUXT_SITE_TOKEN`.

## Local storage

All persistent state lives inside the local directory specified by `NUXT_DATA_DIR` (defaults to `/data`):

| Relative path      | Storage engine   | Required?   | Description                                                   |
| ------------------ | ---------------- | ----------- | ------------------------------------------------------------- |
| `slite.sqlite`     | SQLite / Drizzle | Yes         | Authoritative link store, tags, and core application settings |
| `analytics.duckdb` | DuckDB           | Recommended | Visit events, click metrics, and geographic query logs        |
| `files/images`     | unstorage fs     | Optional    | Uploaded social preview images                                |
| `backups`          | unstorage fs     | Optional    | Automatic daily link JSON backups and manual exports          |

### SQLite and the in-memory cache

**SQLite** is the single authoritative source of truth for all links and application state.

The **link cache** uses the unstorage memory driver:

- It resides entirely within the memory of the active Node.js process.
- It is process-local, rebuildable on demand, and never acts as a secondary authoritative store.
- When a process starts, the cache is empty and populates lazily from SQLite.
- Committed link mutations synchronously invalidate corresponding cached entries.
- If a cache operation encounters an issue, caching is safely disabled and lookups fall back directly to SQLite.

Uploaded images and link JSON backups are written via the unstorage filesystem driver under `files/images` and `backups`.

## Process model and constraints

Slite is designed for a **single-process architecture**:

- Run only one container and one Node.js process per persistent data directory.
- SQLite, DuckDB, and in-memory caches are not distributed systems. Clustered process managers, horizontal replicas, and shared network filesystems (NFS, SMB) are unsupported.
- Container replacement or upgrades are safe as long as the underlying local volume is retained and previous processes have stopped before new ones launch.

## Optional services

- **AI assistance:** Uses xsai to connect with any OpenAI-compatible provider (OpenAI, DeepSeek, Ollama, etc.). Requests submit only destination URLs without fetching page content.
- **Click webhooks:** Asynchronously posts signed JSON event payloads to an external webhook endpoint upon link clicks.
- **GeoIP metadata:** Resolves geographic dimensions using local MMDB databases. Release Docker images bundle the DB-IP City Lite database; lookups fail open if no database is present.
- **Near-realtime dashboard:** Employs a 10-second analytics polling loop paired with a client-side queue that replays events at roughly one per second; it does not rely on SSE or WebSocket connections.
