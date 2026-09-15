---
title: REST API Reference
description: Interactive OpenAPI specifications, Bearer authentication, CORS, and endpoint reference for Slite.
---

# REST API Reference

Slite exposes an authenticated REST API for all dashboard management tasks, link resolution operations, and data exports.

## Interactive documentation

Every running Slite instance serves its own interactive API reference:

- `https://your-domain/_docs/openapi.json` — Machine-readable OpenAPI 3.0 specification
- `https://your-domain/_docs/scalar` — Modern interactive API explorer
- `https://your-domain/_docs/swagger` — Classic Swagger UI interface

## Authentication

Authenticate requests by passing your site token in the `Authorization` header:

```http
Authorization: Bearer YOUR_SITE_TOKEN
```

The token must match `NUXT_SITE_TOKEN` exactly and contain at least 8 characters. Administrative endpoints and all `/api/**` routes (except the public `GET /api/location` compatibility endpoint) reject requests lacking valid authentication with HTTP `401`.

## CORS configuration

By default, cross-origin browser requests to `/api/**` are forbidden. For source builds and local development, you can set `NUXT_API_CORS=true` at build time to enable CORS. This setting is baked into the Nitro build artifacts; the official release container image does not enable CORS by default.

## Endpoint behavior notes

- **`upsert`:** Creates a new link if the short code is available. If the code already exists, returns the existing record with `status: "existing"` without overwriting it.
- **`search`:** Performs case-insensitive matching across short codes, target URLs, comments, and tags.
- **`check`:** Probes target URLs from the server. Automatically blocks loopback and private subnets to prevent SSRF attacks.
- **`verify`:** Validates your Bearer token and returns current session status.
- **`location`:** Returns geographic coordinates and metadata resolved from the local GeoIP database.
- **Image upload:** Multipart upload (`multipart/form-data`) requiring both `file` and the target link `slug`. Accepts JPEG, PNG, WebP, and GIF files up to 5 MB, persisting them locally to `/data/files/images`.

## Endpoint groups

| Group         | Routes                                                                                     | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Links         | `/api/link/create`, `edit`, `upsert`, `delete`, `query`, `search`, `list`, `check`, `tags` | Core link creation, management, validation, and tags                                 |
| Import/Export | `/api/link/import`, `/api/link/export`                                                     | Paginated link export and batch ingestion ([Import/Export](/features/import-export)) |
| Optional AI   | `/api/link/ai`, `/api/link/og-ai`                                                          | AI-suggested short codes and OpenGraph text ([AI](/features/ai))                     |
| Analytics     | `/api/stats/**`, `/api/logs/**`                                                            | Metrics, dimension summaries, and event logs ([Analytics](/features/analytics))      |
| Utilities     | `/api/verify`, `/api/location`, `/api/upload/image`, `/api/backup`                         | Session verification, GeoIP lookups, file uploads, and link backups                  |

For complete request and response schemas, inspect your instance's live `/_docs/scalar` interface.
