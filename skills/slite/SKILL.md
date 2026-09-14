---
name: slite
description: |
  Slite short-link API operations via its OpenAPI endpoints. Use when managing a self-hosted Slite instance: creating, querying, updating, deleting, listing, importing, exporting links, device routing, password protection, unsafe-link warnings, tags, and analytics exports. Also covers optional AI slug and OpenGraph metadata generation.
  Triggers: "create short link", "shorten URL", "delete link", "edit link", "list links", "export links", "import links", "link analytics", "export analytics", "AI slug", "AI OpenGraph".
---

# Slite API

Slite is a simple, self-hosted link shortener with analytics: one Node.js process with authoritative SQLite storage, a rebuildable unstorage memory link cache, DuckDB analytics, and unstorage filesystem uploads. Manage links through its REST API.

## Authentication

Every route except `GET /api/location` requires a Bearer token equal to `NUXT_SITE_TOKEN` (at least 8 characters):

```http
Authorization: Bearer YOUR_SITE_TOKEN
```

Local development listens on `http://localhost:5483`. The container also listens on port `5483`, which the supplied Compose file publishes on host `5483`. Use your public domain in production.

## Verification and location

- `GET /api/verify` returns `{ name, url, authMethod, userID, userEmail, accessEnabled }`. `name` is always `Slite` and `url` is the request origin. `accessEnabled` is always `false` because Cloudflare Access does not apply to Slite; the field is kept for Sink compatibility.
- `GET /api/location` returns `{ "latitude"?: <number>, "longitude"?: <number> }` and is the only unauthenticated API route. Missing coordinates are omitted, so the body is `{}` when no GeoIP database is loaded.

## Links

### Create

`POST /api/link/create`

```json
{
  "url": "https://example.com/long-url",
  "slug": "custom-slug",
  "comment": "optional note",
  "apple": "https://apps.apple.com/app/id123",
  "google": "https://play.google.com/store/apps/details?id=com.example",
  "title": "Example Title",
  "description": "Social preview description",
  "image": "/_assets/images/custom-slug/abc123.png",
  "tags": ["docs"],
  "password": "optional-password",
  "cloaking": false,
  "redirectWithQuery": true,
  "unsafe": false,
  "geo": {
    "US": "https://example.com/us"
  }
}
```

Required: `url`. Optional: `slug` (auto-generated when omitted), `comment`, `expiration` (unix seconds, must be in the future), `title`, `description`, `image` (URL returned by `POST /api/upload/image`, a multipart upload with `file` and `slug`), `apple` and `google` (device routing), `tags` (up to 10 tags, 1-32 characters each), `cloaking`, `redirectWithQuery`, `password`, `unsafe`, `geo` (country-code routing map). Country-based redirects execute when a GeoIP database is loaded; otherwise the default `url` is used.

When `NUXT_SAFE_BROWSING_DOH` is configured and `unsafe` is omitted, the server checks the URL through DoH and may mark it unsafe.

Returns `201` with `{ "link": { ... }, "shortLink": "https://your-domain/custom-slug" }`, or `409` when the slug already exists.

`POST /api/link/upsert` takes the same body and returns the same shape plus `status`: `created` with `201`, or `existing` with `200` when the active slug is reused.

### Query

`GET /api/link/query?slug=custom-slug` returns the link, or `404` when missing.

### Edit

`PUT /api/link/edit` with `slug` (which link to edit) and `url` (required), plus any optional fields to update. Returns `201` with `{ link, shortLink }`; `404` when missing, `409` on concurrent modification. Send `"password": ""` to remove password protection.

### Delete

`POST /api/link/delete` with `{ "slug": "slug-to-delete" }`. Returns `200 OK` with an empty body, matching Sink.

### List

`GET /api/link/list?limit=20&cursor=next-cursor&sort=newest&tag=docs&status=active`

- `limit`: 1-1000, default 20
- `cursor`: pagination cursor from the previous response
- `sort`: `az`, `za`, `newest` (default), `oldest`
- `tag`: exact normalized tag
- `status`: `active` (default), `expired`, `all`

Returns `{ "links": [...], "list_complete": false, "cursor": "next-cursor" }`. Password values are masked.

### Search, count, and tags

- `GET /api/link/search?q=keyword` or `?url=https://example.com`; a `q` or `url` selector is required, otherwise an empty array is returned. Supports `tag`, `status`, and `limit` (max 1000).
- `GET /api/link/count?q=keyword` returns `{ "count": 3 }`.
- `GET /api/link/tags` lists tags currently in use.

### Check target URLs

`POST /api/link/check` with `{ "cursor": "next-cursor", "limit": 6, "timeout": 6 }` (limit 1-10, timeout 1-30 seconds). Returns `{ "results": [...], "cursor": "next-cursor", "list_complete": false }` with per-link `status`, `ok`, `duration`, `checkedAt`, and optional `error`.

## Uploads and backups

- `POST /api/upload/image` takes a multipart body with `file` and `slug`, stores the image locally, and returns `{ "url": "/_assets/images/<slug>/<id>.<ext>", "key": "images/<slug>/<id>.<ext>" }` — the same path and response contract as Sink's R2 upload. Uploaded assets are served with immutable cache headers.
- `POST /api/backup` writes a link JSON export to local backup storage and returns `{ "success": true, "message": "Backup completed successfully" }`.

## Import and export

### Export

`GET /api/link/export?cursor=next-cursor` returns one page of up to 50 links (Sink-compatible page size):

```json
{
  "version": "1.0",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "count": 50,
  "links": [],
  "cursor": "next-cursor",
  "list_complete": false
}
```

Request pages with the returned `cursor` until `list_complete` is true, and retain every page. Passwords are exported in protected form, not plaintext.

### Import

`POST /api/link/import` with the export-shaped body:

```json
{
  "version": "1.0",
  "links": [
    { "url": "https://example1.com", "slug": "ex1" },
    { "url": "https://example2.com", "slug": "ex2", "tags": ["docs"] }
  ]
}
```

Each entry requires `url` and `slug`. Optional per entry: `id`, `createdAt`, `updatedAt`, `expiration`, and the other create fields. Send at most `NUXT_IMPORT_REQUEST_LIMIT` links per request (default 100), so import large exports in pages. The response reports per-item results:

```json
{
  "success": 1,
  "skipped": 0,
  "failed": 0,
  "successItems": [],
  "skippedItems": [],
  "failedItems": []
}
```

Expired records are accepted, active slug conflicts are skipped rather than overwritten, and protected passwords from a compatible export import without plaintext. `geo` maps are preserved through import and export round-trips and execute country-based redirects when a GeoIP database is loaded; without one they fall back to the default URL. Invalid records or requests over the limit return `400`.

## Optional AI

- `GET /api/link/ai?url=https://example.com/article` returns `{ "slug": "ai-generated-slug" }`.
- `GET /api/link/og-ai?url=https://example.com/article&locale=en-US` returns `{ "title": "...", "description": "..." }`.

`NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` are empty by default. Until both are explicitly configured for an OpenAI-compatible provider, the AI routes return `501` without any outbound request; `NUXT_AI_API_KEY` may stay empty when the provider does not require a key. Requests send only the supplied URL to the provider; page content is not fetched. When a configured provider call fails, both routes fall back to URL-derived values instead of failing.

## Analytics

- `GET /api/stats/counters` returns `{ visits, visitors, referers }`.
- `GET /api/stats/metrics?type=referer` — `type` is required; valid values are `browser`, `browserType`, `city`, `country`, `device`, `deviceType`, `ip`, `language`, `latitude`, `longitude`, `os`, `referer`, `region`, `slug`, `timezone`, `ua`, and `url`. Returns `{ name, count }` rows; `COLO` is rejected because it is Cloudflare-only.
- `GET /api/stats/views?unit=day` — `unit` is required: `minute`, `hour`, or `day`. Optional `clientTimezone` (default `Etc/UTC`). Returns `{ time, visits, visitors }` rows.
- `GET /api/stats/heatmap` — optional `clientTimezone` (default `Etc/UTC`). Returns weekday/hour rows.
- `GET /api/stats/export?startAt=1717200000&endAt=1719791999&slug=custom-slug` returns `text/csv` with `slug`, `url`, `viewer`, `views`, and `referer` columns, plus `Content-Disposition: attachment; filename="slite-access-<timestamp>.csv"` for Sink compatibility.

## OpenAPI docs

- JSON: `/_docs/openapi.json`
- Scalar UI: `/_docs/scalar`
- Swagger UI: `/_docs/swagger`

## cURL examples

Create a link:

```bash
curl -X POST https://your-domain/api/link/create \
  -H "Authorization: Bearer YOUR_SITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "tags": ["docs"]}'
```

List links:

```bash
curl "https://your-domain/api/link/list?limit=20&status=active" \
  -H "Authorization: Bearer YOUR_SITE_TOKEN"
```

Delete a link:

```bash
curl -X POST https://your-domain/api/link/delete \
  -H "Authorization: Bearer YOUR_SITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug": "my-slug"}'
```
