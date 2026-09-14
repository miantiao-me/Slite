# Analytics and Realtime

Slite stores analytics locally in `/data/analytics.duckdb`. The dashboard queries this data for click trends, referrers, devices, browsers, and other recorded dimensions. Preserve the file as part of a [complete stopped-instance backup](/features/backups).

Each access event persists the full client IP address, the full User-Agent string, the referer host, the preferred language from `Accept-Language`, the parsed operating system, browser, and device, and the resolved country, region, city, and coordinates. Because IP addresses are stored in full, treat `/data/analytics.duckdb` as personal data. Slite currently has no automatic analytics retention, so events remain until the file is removed or replaced; operators should define and document the retention and user-notice policies that apply to their deployment.

Dashboard APIs aggregate this data. `GET /api/logs/events` returns recent events without the stored IP, and the remaining event fields stay available to authenticated dashboard requests.

Geographic fields come from the resolved GeoIP database: release Docker images bundle DB-IP City Lite, which provides country, region, city, and coordinates but no time-zone or postcode data. An instance without a readable database fails open, so empty maps or country breakdowns do not imply that redirects failed. `NUXT_TRUST_PROXY` only controls which client IP is trusted; it does not provide geographic metadata. See [GeoIP database](/deployment/docker#geoip-database) for the resolution order.

The realtime dashboard polls approximately every 10 seconds and replays queued events at roughly one per second. Pausing stops polling, replay, and WebGL motion. It is a pseudo-live view, not an SSE or WebSocket connection.

Use a single process and local storage. Analytics files are not intended for concurrent access by multiple Slite replicas.
