---
title: Backups and Restore
description: Understand link JSON snapshots in local storage, automatic backup retention, and full stopped-instance system backups.
---

# Backups and Restore

Slite offers two distinct backup levels: **application link JSON snapshots** for portability, and **complete stopped-instance filesystem backups** for disaster recovery.

## 1. Link JSON snapshots

Application backups are written to `/data/backups` via the unstorage filesystem driver:

- **Contents:** A complete JSON snapshot of all short-link records stored in SQLite, including custom routing rules, creation times, tags, and protected password hashes.
- **Exclusions:** Snapshots do **not** include DuckDB visit analytics, uploaded images, or the process-local in-memory link cache.
- **Automation:** Scheduled link backups run every 24 hours after process startup and automatically retain the latest 30 snapshots. Manual backups are never removed by automatic retention.
- **Disable automation:** Set `NUXT_DISABLE_AUTO_BACKUP=true` in `.env` and recreate the container.
- **Manual trigger:** Initiate a manual snapshot through the dashboard or by sending `POST /api/backup`.

File naming conventions:

- Automatic snapshots: `backups/links-<timestamp>.json`
- Manual snapshots: `backups/manual-links-<timestamp>.json`

::: warning Snapshots contain sensitive credentials
Because snapshots contain protected password hashes and unlisted destination URLs, restrict read permissions on `/data/backups` and treat snapshot files as confidential.
:::

To restore links from a JSON snapshot, submit the records through the [Import API](/features/import-export).

## 2. Complete stopped-instance backup

To preserve everything — authoritative links, DuckDB analytics history, uploaded images, and application state — take a complete cold backup of the mounted `/data` directory.

### Step-by-step full backup

1. **Stop the container:**
   ```sh
   docker compose stop
   ```
   _Do not copy database files while Slite is running; active writes can result in corrupted SQLite or DuckDB files._
2. **Archive the `/data` directory:**
   Copy or archive the entire mounted volume directory from the host:
   - `slite.sqlite` (authoritative link store)
   - `analytics.duckdb` (visit analytics database)
   - `files/images` (uploaded preview images)
   - `backups` (link JSON snapshots)
3. **Save environment configuration:**
   Securely back up `.env` and record your current Docker image tag or Git commit hash.
4. **Restart the container:**
   ```sh
   docker compose start
   ```

Store backup archives off-site or on an independent disk volume.

## 3. Complete disaster restore

To restore a Slite instance to a previous state:

1. Stop the running container (`docker compose stop`).
2. Replace the contents of the mounted `/data` volume with your saved backup archive.
3. Ensure user UID `5483` has read and write permissions across the restored directory:
   ```sh
   sudo chown -R 5483:5483 /path/to/data
   ```
4. Start the container matching the original application version (`docker compose up -d`).
5. Open `/dashboard` and verify logins, short-link redirects, analytics charts, and images.

The in-memory link cache lives purely in process memory; it repopulates from SQLite on demand and requires no manual restore steps.
