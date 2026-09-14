# Import and Export

Use authenticated `/api/link/export` and `/api/link/import` requests to move links between compatible instances. Send `Authorization: Bearer YOUR_SITE_TOKEN`; see [API](/api/).

## Export

Export returns JSON pages. Request subsequent pages using the returned cursor until `list_complete` is true. Retain every page. Exported records include link settings and protected password values rather than plaintext passwords.

## Import

Submit records in batches within the API's request limit. Inspect per-item results and retry failures only after correcting their cause.

- Expired records are accepted.
- Active short-code conflicts are skipped rather than overwritten.
- Short codes follow the destination instance's case setting.
- Compatible protected passwords can be imported; masked dashboard placeholders are not valid passwords.

## Moving an existing instance

Export from the original instance and import into Slite manually. Keep the original deployment available until you have verified the imported links.

Link exports do not include the rebuildable process-local link cache, analytics, uploaded image files, or a full snapshot of application state. The link cache does not need restoring. Copy images separately and review URLs that still point to the original host. Keep the original deployment until redirects and protected links have been verified. For a complete backup of an existing Slite instance, [stop it and copy `/data`](/features/backups).
