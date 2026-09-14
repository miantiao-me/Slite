# Docker and Compose

Run Slite with the released image from GHCR, or build it locally with the repository's Dockerfile and Compose configuration. The runtime image is [distroless](https://github.com/GoogleContainerTools/distroless): it contains Node.js and nothing else, without a shell or package manager, and runs as the non-root user `5483`.

## Configure

Copy `.env.example` to `.env`, then set:

```dotenv
NUXT_SITE_TOKEN=replace-with-a-long-random-secret
NUXT_DATA_DIR=/data
NUXT_TRUST_PROXY=false
```

The supplied Compose service loads `.env` through `env_file`, so variables defined there reach the container. Its `environment` entries are interpolated when you run `docker compose`: shell environment values override `.env`, and `.env` overrides the fallback defaults written in `compose.yaml`.

Ensure the Compose service mounts a persistent **local** volume at `/data`. The container user must be able to write it; the image prepares `/data` for user `5483`, so the default named volume works without extra steps. Publish the application port through your host or reverse proxy according to the Compose configuration. Uploaded images and link backups are written through the unstorage filesystem driver under `/data/files/images` and `/data/backups`.

## Site token

`NUXT_SITE_TOKEN` protects `/dashboard` and every `/api/**` request except the public `GET /api/location` compatibility endpoint; when set, it must be at least 8 characters. The service starts without it, but then the process generates a random token for itself only: public short-link redirects keep working, the dashboard and protected API stay inaccessible, the value is never logged or written to disk, and it changes on every restart. Configure a token and restart the container to administer the instance.

## Released image

`compose.yaml` defaults to the released image, so no edits are required:

```sh
docker compose up -d
```

Pushes to the default `master` branch publish the `latest` image without requiring a tag, while a tag push publishes only that tag:

```sh
docker pull ghcr.io/miantiao-me/slite:vX.Y.Z
```

Replace `vX.Y.Z` with a released version tag. The [`Container` workflow](https://github.com/miantiao-me/Slite/actions/workflows/docker.yml) also supports manual dispatch runs.

## Local build

Build from source with Compose; the `slite` service keeps `build: .` and tags the result with the released image reference:

```sh
docker compose up -d --build
docker compose logs -f
```

Use Node.js 24 or newer. SQLite uses the built-in `node:sqlite` module, while DuckDB is a native module: install dependencies inside the image for its runtime, operating system, and architecture rather than copying host `node_modules`.

The supplied Compose configuration maps host port `5483` to container port `5483` and mounts the named volume `slite-data` at `/data`. For a custom host bind mount, keep its directory outside the Docker build context or exclude the entire directory in `.dockerignore`; excluding database files alone does not protect uploads and backups.

When you build the image yourself, pass `DBIP_VERSION=YYYY-MM` to pin a specific [DB-IP](https://db-ip.com) City Lite release:

```sh
docker build --build-arg DBIP_VERSION=2026-09 -t slite:local .
```

Without the argument, the build downloads the current month and falls back to the previous month.

Open `/dashboard` on your instance and use the site token to sign in.

Automatic link backups run daily and retain the latest 30 automatic backups; manual backups are not automatically removed. To disable the schedule, set `NUXT_DISABLE_AUTO_BACKUP=true` in `.env` and recreate the container.

## GeoIP database

Images bundle the monthly DB-IP City Lite database at `/app/geoip/dbip-city-lite.mmdb`, so geographic metadata works without extra setup. DB-IP City Lite is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the image ships the attribution next to the database in `/app/geoip/ATTRIBUTION.txt`, and the upstream data is published at [db-ip.com](https://db-ip.com).

A database is resolved in this order:

1. `NUXT_GEOIP_PATH`, when set to an existing file. This is the override for a custom or commercial database.
2. `/data/geoip.mmdb`, when present. Mount it through the volume to replace the bundled release.
3. `/data/dbip-city-lite.mmdb`, when present.
4. The bundled `/app/geoip/dbip-city-lite.mmdb`.

Lookups fail open: without a readable database, geographic fields stay empty and the rest of the application keeps working. City Lite provides country, region, city, and coordinates but no time-zone data, so Slite never reports a time zone from it. See [configuration](/configuration/) for the variable reference.

## Operating constraints

- Run a single container and a single Node.js process. Do not scale replicas or enable a process-manager cluster.
- Never share `/data` between running instances or place it on a network filesystem.
- Keep the volume when rebuilding or replacing the container. `docker compose down -v` destroys named volumes and must not be used for routine upgrades.
- Put a TLS reverse proxy in front of public installations. Set `NUXT_TRUST_PROXY=true` only if direct access is blocked and the proxy overwrites untrusted forwarded headers.
- Do not expose database files, backups, or environment files through a static web server.
- AI is optional; see [configuration](/configuration/).

For a full snapshot, stop the container and copy all of `/data`, including `slite.sqlite`, `analytics.duckdb`, `files/images`, and `backups`. The link cache uses the unstorage memory driver, so it is process-local and rebuilds automatically. Link JSON backups exclude the rebuildable link cache. See [backups](/features/backups) before an [upgrade](/deployment/upgrading).
