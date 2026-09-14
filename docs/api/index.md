# REST API

Use your own instance's API reference:

- `/_docs/openapi.json`: OpenAPI schema
- `/_docs/scalar`: interactive reference
- `/_docs/swagger`: Swagger UI

Authenticate API requests with the configured site token:

```http
Authorization: Bearer YOUR_SITE_TOKEN
```

The token must match `NUXT_SITE_TOKEN`. Never put the token in a public client application.

| Group         | Routes                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Links         | `/api/link/create`, `/api/link/edit`, `/api/link/upsert`, `/api/link/delete`, `/api/link/query`, `/api/link/search`, `/api/link/list`, `/api/link/check`, `/api/link/tags` |
| Import/export | `/api/link/import`, `/api/link/export`                                                                                                                                     |
| Optional AI   | `/api/link/ai`, `/api/link/og-ai`                                                                                                                                          |
| Analytics     | `/api/stats/**`, `/api/logs/**`                                                                                                                                            |
| Utilities     | `/api/verify`, `/api/location`, `/api/upload/image`, `/api/backup`                                                                                                         |

`upsert` returns an existing active short code rather than overwriting it. `check` probes destination URLs from the server. Image uploads use the unstorage filesystem driver under `/data/files/images`. Geographic fields come from the resolved GeoIP database: release Docker images bundle DB-IP City Lite, while an instance without a readable database fails open and leaves them empty. See [GeoIP database](/deployment/docker#geoip-database).

See [import/export](/features/import-export) and [backup scope](/features/backups) before moving data.
