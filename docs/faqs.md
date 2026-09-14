# Troubleshooting

## The application cannot start or write data

Use Node.js 24 or newer. Confirm `/data` (or `NUXT_DATA_DIR`) is writable by the process and that `NUXT_SITE_TOKEN`, when set, is at least 8 characters. Check container logs. Only one process may use the directory; stop other containers or development servers that have it open.

## Cannot sign in to the dashboard

Set `NUXT_SITE_TOKEN` to a value of at least 8 characters and restart the process. Without it, Slite generates a random token for that process only and never exposes it, so the dashboard and every API request return 401. The generated value changes on each restart.

## Data disappeared after replacing a container

Check that the same persistent local volume is mounted at `/data`. Data in a container's writable layer is not durable. Do not use `docker compose down -v` during upgrades.

## Country and city charts are empty

First, check which GeoIP database the process resolved. Release Docker images bundle DB-IP City Lite, so country, region, city, and coordinates work without extra setup; a source build or custom image without a readable database fails open and leaves geographic fields empty. City Lite has no time-zone or postcode data. Enabling proxy trust does not add geographic metadata; it only changes which client IP is trusted. See [GeoIP database](/deployment/docker#geoip-database).

## Client addresses are incorrect behind a proxy

Keep proxy trust disabled unless the application is reachable only through a trusted proxy. Configure that proxy to overwrite forwarded headers before setting `NUXT_TRUST_PROXY=true`.

## AI is unavailable

`NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` are empty by default; set both to enable AI. Check provider access and the selected model. `NUXT_AI_API_KEY` can be empty when the provider does not require one. AI is optional; ordinary links work without it.

## How do I migrate or restore?

For old instances, [export and import links manually](/features/import-export). For a complete Slite restore, use a [stopped-instance copy of all `/data`](/features/backups). Link backups alone do not restore analytics or images.
