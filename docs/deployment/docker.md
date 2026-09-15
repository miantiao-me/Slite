---
title: Deploy with Docker and Compose
description: Deploy Slite using the official GHCR container image or local Compose build with persistent local storage.
---

# Docker and Compose

Slite is distributed as a lightweight container image on GitHub Container Registry (GHCR) and can also be built directly from source using the repository's Dockerfile and Compose setup.

The container image is built on [distroless](https://github.com/GoogleContainerTools/distroless): it contains only the Node.js runtime without a shell or package manager, and runs under the non-root user UID `5483`.

## 1. Quick start with Compose

The repository's `compose.yaml` pulls the official image by default:

```sh
git clone https://github.com/miantiao-me/Slite.git
cd Slite
cp .env.example .env
docker compose up -d
```

This starts Slite on host port `5483` and mounts a named Docker volume `slite-data` to `/data`. Open `http://localhost:5483/dashboard` and sign in with your configured `NUXT_SITE_TOKEN`.

To build the image locally from source instead of pulling from GHCR:

```sh
docker compose up -d --build
docker compose logs -f
```

## 2. Persistent storage and permissions

All authoritative state, analytics data, uploads, and backups are written under `/data`:

- **Named volumes (recommended):** The default `slite-data` volume in `compose.yaml` automatically sets correct permissions for user `5483`.
- **Host bind mounts:** If mounting a host folder (e.g. `/srv/slite:/data`), ensure UID `5483` owns the directory on the host:

```sh
mkdir -p /srv/slite
sudo chown -R 5483:5483 /srv/slite
```

::: warning Keep bind mounts outside build context
Ensure custom host data directories stay outside your Git checkout or are explicitly excluded in `.dockerignore`. Otherwise, local SQLite files, uploads, and backups may get copied into Docker build contexts.
:::

## 3. Site token and security

`NUXT_SITE_TOKEN` secures the `/dashboard` administrative interface and all `/api/**` endpoints (except the public `GET /api/location` compatibility endpoint).

- Set `NUXT_SITE_TOKEN` to a private string of at least 8 characters with no whitespace.
- If left empty or unset, Slite generates an ephemeral random token that exists only in memory for that process run. Public link redirects keep functioning, but administration is inaccessible.
- For public-facing deployments, place Slite behind a TLS reverse proxy (such as Caddy, Nginx, or Traefik). Leave `NUXT_TRUST_PROXY=false` unless all requests strictly pass through a proxy that rewrites forwarding headers.

## 4. GeoIP database {#geoip-database}

Release images bundle the monthly **DB-IP City Lite** database at `/app/geoip/dbip-city-lite.mmdb`, enabling geographic analytics out of the box.

DB-IP City Lite is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):

> Contains the DB-IP City Lite database (https://db-ip.com). DB-IP City Lite is licensed under the Creative Commons Attribution 4.0 International License.

The database resolution priority order is:

1. `NUXT_GEOIP_PATH` (explicit path to a custom or commercial MMDB)
2. `/data/geoip.mmdb` (mounted into the persistent volume)
3. `/data/dbip-city-lite.mmdb` (mounted into the persistent volume)
4. `/app/geoip/dbip-city-lite.mmdb` (bundled in the container image)

Lookups follow a **fail-open** policy: if no valid database is found, geographic fields remain empty while all link resolution and analytics logging continue uninterrupted. Note that City Lite provides country, region, city, and coordinates, but does not contain time-zone data.

## 5. Custom image builds

When building the image yourself, you can specify a pinned [DB-IP](https://db-ip.com) City Lite release:

```sh
docker build --build-arg DBIP_VERSION=2026-09 -t slite:local .
```

If omitted, the build fetches the current month's release, falling back to the previous month if unavailable.

## 6. Operating constraints

- **Single process:** Run only one container and one Node.js process against a given data directory. Do not scale replicas or use process-manager clustering.
- **Local storage only:** Never share `/data` across multiple instances or place it on network filesystems (NFS, SMB).
- **Volume retention:** Never run `docker compose down -v` during maintenance or upgrades, as it deletes persistent named volumes.
- **Scheduled backups:** Automatic link backups run every 24 hours after process startup and retain the latest 30 snapshots. Set `NUXT_DISABLE_AUTO_BACKUP=true` in `.env` to disable them.

For routine upgrades, see [Upgrading Slite](/deployment/upgrading).
