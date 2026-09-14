# Upgrading Slite

1. Record the current source revision and save configuration securely.
2. Stop the container and take a [complete data backup](/features/backups).
3. Update to the intended source revision.
4. Rebuild and start with `docker compose up -d --build`, retaining the existing `/data` volume.
5. Inspect logs, sign in, and verify a short-link redirect and analytics.

Only one process may open the data directory. Do not run old and new containers simultaneously against it. If an upgrade changes data formats, rolling back the application alone may not be sufficient: stop the container and restore the matching full data backup and application revision.

## Moving an existing instance

Export links from the old instance and import them manually into Slite. Keep the old instance available until you have verified the imported links. Transfer image files separately and check any absolute image URLs. Analytics is not included in link exports.
