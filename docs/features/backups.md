# Backups and Restore

## Link backups

Application backups stored in `/data/backups` are **link JSON exports, not complete database snapshots**. They do not include the process-local unstorage memory link cache, DuckDB analytics, uploaded image files, or all application state. The link cache rebuilds automatically and does not need restoring. Keep copies outside the host: files on the same disk are not protection against disk loss.

Automatic link backups run daily by default and retain the latest 30 automatic backups. Manual backups are not removed by automatic retention. Set `NUXT_DISABLE_AUTO_BACKUP=true` on the running application to disable automatic backups; manual backups remain available.

Restore compatible exported links with the ordinary [import API](/features/import-export). Import is not a full-instance restore and does not overwrite active slug conflicts.

## Complete backup

For a consistent full backup:

1. Stop the container with `docker compose stop` and confirm no other process uses its data directory.
2. Copy or archive the **entire mounted `/data` directory** from the host or volume, including `slite.sqlite` and its sidecar files if present, `analytics.duckdb`, `files/images`, and `backups`.
3. Store deployment configuration and secrets separately and securely, together with the application revision.
4. Start the container with `docker compose start`.

Do not copy only the main database files while Slite is running. A live filesystem copy is not guaranteed to be consistent.

## Complete restore

Stop Slite, restore the entire saved directory to its local volume, ensure the container user can read and write it, and start the matching application revision. Do not merge a snapshot into a running instance. Verify sign-in, redirects, images, and analytics before reopening traffic.

The link cache uses the unstorage memory driver and lives only in the running process, so it is repopulated from SQLite on demand. Restoring cached link entries is unnecessary.
