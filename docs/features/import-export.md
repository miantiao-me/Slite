---
title: Import and Export
description: Transfer short links between compatible instances using paginated JSON, preserving expired links and protected passwords.
---

# Import and Export

Use the authenticated `/api/link/export` and `/api/link/import` REST APIs to transfer short links between compatible Slite and Sink instances.

Requests must include your site token:

```http
Authorization: Bearer YOUR_SITE_TOKEN
```

## Export

The export API streams records from SQLite in paginated JSON chunks:

- Request subsequent pages using the returned `cursor` parameter until `list_complete` evaluates to `true`.
- Each record exports full routing configurations, creation timestamps, tags, comments, social preview metadata, and **protected password hashes** (plaintext passwords are never exposed).
- Export uses a fixed page size of 50 records.

Retain all exported JSON pages when backing up or transferring link catalogs.

## Import

The import API ingests JSON link objects in batches up to `NUXT_IMPORT_REQUEST_LIMIT` (default 100 records per request).

In the dashboard, `NUXT_PUBLIC_IMPORT_BATCH_LIMIT` (default 50) controls client-side import chunking, sending at most half that limit (default 25 records) per request.

- **Format verification:** Slite verifies the batch payload schema before persisting records, returning individual item statuses (`success`, `skip`, or `fail`).
- **Conflict handling:** Existing active short codes are skipped rather than overwritten.
- **Expired links:** Links whose expiration timestamps have already passed are accepted to preserve historical records.
- **Case conventions:** Imported custom short codes conform to the receiving instance's `NUXT_CASE_SENSITIVE` configuration.
- **Protected passwords:** Exported protected password hashes from compatible Slite or Sink instances import seamlessly without requiring plaintext passwords. Masked placeholder strings from the dashboard UI are invalid and rejected.

## Moving an existing instance

When migrating to a new server or moving links from an existing deployment:

1. Export all link pages as JSON from the old instance.
2. Ingest the JSON files into the new Slite deployment via the import API or dashboard.
3. Transfer uploaded preview images from `files/images` to the new host.
4. Keep the original instance online until you have verified routing and redirects on the new host.

::: tip Import is not a full-system restore
Link exports do not include DuckDB visit analytics, process-local in-memory caches, or uploaded image binaries.

The in-memory link cache rebuilds automatically and requires no restoration. For a complete system-level backup of all links, analytics, and assets, perform a [stopped-instance `/data` backup](/features/backups).
:::
