---
title: Upgrading Slite
description: Upgrade Slite using Docker Compose, back up local data, and verify services after deployment.
---

# Upgrading Slite

Upgrading Slite is straightforward when using Docker Compose. Because SQLite and DuckDB are local single-process databases, proper backup before upgrading is essential.

## 1. Before you upgrade

1. **Take a full stopped-instance backup:** Always stop the container before copying the data directory:
   ```sh
   docker compose stop
   ```
   Copy or archive the entire `/data` directory (including `slite.sqlite`, `analytics.duckdb`, `files/images`, and `backups`). Live filesystem copies while the database is active can produce corrupted snapshots.
2. Save your `.env` configuration and record the current image or commit version.
3. Review upstream release notes for any breaking changes or configuration adjustments.

## 2. Standard upgrade

Pull the latest official image or update your local repository checkout:

```sh
# If using the official image:
docker compose pull
docker compose up -d

# If building from source:
git pull origin master
docker compose up -d --build
```

::: danger Never delete volumes
Never run `docker compose down -v` during an upgrade. The `-v` flag deletes named Docker volumes, including your authoritative database and analytics history.
:::

Only one process may open the data directory at any time. Do not run old and new containers against the same directory simultaneously.

## 3. Moving an existing instance

If you are migrating from another shortener or an older Slite instance across servers:

1. Use the [Import and Export](/features/import-export) API or dashboard to export your links as JSON.
2. Import the JSON file into the new Slite instance.
3. Copy uploaded preview images from `files/images` to the new host.
4. Keep the old instance online until you have verified routing and redirects on the new deployment.

Note: Link exports do not include DuckDB visit analytics. To retain historical analytics when moving servers, copy the entire `/data` directory in a stopped state.

## 4. After upgrade — quick check

After restarting the container, complete this checklist:

1. Check application logs:
   ```sh
   docker compose logs -f
   ```
2. Sign in to `/dashboard` with your `NUXT_SITE_TOKEN`.
3. Create, resolve, edit, and delete a test link.
4. Verify that existing short links redirect as expected.
5. Check that visit analytics and the realtime 3D globe display correctly.
