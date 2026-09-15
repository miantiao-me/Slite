---
title: Analytics and Realtime
description: Monitor link performance with local DuckDB analytics, inspect visit dimensions, view the 3D globe, and export CSV reports.
---

# Analytics and Realtime

Slite features a built-in analytics engine powered by [DuckDB](https://duckdb.org/). All visit events are stored locally at `/data/analytics.duckdb`, requiring no third-party services, cloud accounts, or external API keys.

## What is recorded

Every short-link access event captures the following dimensions:

- **Network:** Full client IP address, referer host, and preferred language from `Accept-Language`.
- **Client context:** Parsed browser name, operating system, and device category (desktop, mobile, tablet).
- **Geographic location:** Resolved country, region, city, and approximate coordinates derived from the local GeoIP database.

::: warning Privacy and data retention
Because Slite records full IP addresses, treat `/data/analytics.duckdb` as containing personal data.

Slite currently does not enforce automated time-based data pruning. Events remain in the database until the file is archived, replaced, or deleted. Operators should establish and communicate retention and notice policies appropriate for their regulatory environment.
:::

To exclude automated crawlers and bots from visit counts and [click webhooks](/configuration/webhooks), set `NUXT_DISABLE_BOT_ACCESS_LOG=true`.

## Dashboard insights

The dashboard queries DuckDB to deliver aggregated metrics:

- Total clicks, unique visitors, and daily visit distributions.
- Top referrers and incoming search domains.
- Breakdown charts by device type, browser, operating system, and geographic regions.
- Multi-dimensional filtering by slug, time window, country, device, and referrer.

The protected `GET /api/logs/events` endpoint provides recent events to authenticated dashboard users with client IP addresses sanitized out.

## Geographic resolution and GeoIP

Geographic breakdowns depend on the local GeoIP database:

- Official Docker release images bundle the **DB-IP City Lite** database (licensed under CC BY 4.0). Country, region, city, and coordinates work immediately without extra setup.
- City Lite does not include time-zone or postcode information; Slite never fabricates or infers missing time zones.
- If no readable database is available, lookups follow a **fail-open** approach: geographic dimensions stay empty, and all redirects and click counts continue normally.

For database resolution precedence, see [GeoIP database](/deployment/docker#geoip-database).

## Near-realtime 3D globe

The realtime dashboard renders a 3D Earth globe showing active access events across the globe.

::: tip Not a WebSocket stream
The realtime view does not maintain a WebSocket or SSE connection. Instead, the dashboard polls DuckDB approximately every 10 seconds for newly logged events, queuing and replaying them across client animations at roughly one event per second.

Pausing the view or switching browser tabs pauses polling, playback, and WebGL rendering.
:::

## Exporting metrics

You can export filtered metrics as CSV files directly from the dashboard or through the stats export API. CSV exports contain short codes, destination URLs, visitor counts, click totals, and referrer summaries.

Exporting short-link configuration and routing rules is a separate operation — see [Import and Export](/features/import-export).
