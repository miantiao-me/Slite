---
title: Link Features
description: Custom short codes, smart routing, expiration, passwords, safety checks, social previews, cloaking, tags, health checks, and redirects.
---

# Link Features

Create and manage short links through the dashboard or REST API. A destination URL is required; all other settings are optional.

## Short codes (slugs) and tags

Leave the short code field empty to generate a random 6-character lowercase code.

- **Case sensitivity:** When `NUXT_CASE_SENSITIVE=true`, custom short codes preserve case distinctions (`Docs` and `docs` are separate links). Auto-generated codes remain lowercase.
- **Tags:** Group links with tags. Tags are automatically converted to lowercase. Each link supports up to 10 tags, 1–32 characters each.

## Expiration and preview mode

Set an expiration timestamp to deactivate a short link automatically after a specific date and time. Expired links stop redirecting. The import API deliberately permits expired records to preserve historical archives.

::: warning Preview mode
`NUXT_PUBLIC_PREVIEW_MODE=true` turns on a read-only demonstration mode: link edits and deletions are disabled, and new links expire automatically after 5 minutes. Use this setting only for ephemeral public testing.
:::

## Passwords and unsafe warnings

Password-protected links prompt browser visitors with an authentication form. API requests pass the link password in the `x-link-password` header. Passwords are stored as PBKDF2 hashes before persisting to authoritative SQLite storage.

The `unsafe` setting controls the phishing and malware warning interstitial:

- Manually flag a link as safe or unsafe in the dashboard.
- If `NUXT_SAFE_BROWSING_DOH` is configured and `unsafe` is left unset, Slite queries the configured DNS-over-HTTPS endpoint to detect potentially dangerous domains.
- If the domain is flagged by the upstream resolver, Slite marks the link as unsafe.

::: tip Safe browsing fails open
If the DNS-over-HTTPS query times out or fails, Slite allows the link instead of blocking legitimate user traffic.
:::

Visitors confirm navigation to unsafe links by submitting a form (`POST` with `confirm=true`). For links that are both password-protected and marked unsafe, API requests must include both `x-link-password` and `x-link-confirm: true`.

## Smart routing

Deliver targeted experiences based on visitor context:

- **Query parameter forwarding:** Automatically append incoming query parameters (such as `?utm_source=...`) to the destination URL.
- **Country routing:** Map specific ISO country codes (e.g. `US`, `DE`, `JP`) to dedicated destination URLs. Country detection uses the resolved local GeoIP database.
- **Device routing:** Route visitors to platform-specific URLs for Apple iOS mobile devices (iPhone, iPad, iPod) and Android devices. Device rules take precedence over country and default destinations (macOS is not included).

## Social previews (OpenGraph), bot detection, and cloaking

Customize social preview metadata (OpenGraph title, description, and image) so links render rich cards when shared on platforms like Slack, Twitter/X, Discord, and Telegram.

Uploaded preview images (JPEG, PNG, WebP, GIF, up to 5 MB) are written to local persistent storage under `/data/files/images` via the unstorage filesystem driver.

When social media crawlers request a link with preview metadata configured, Slite returns an HTML page containing OpenGraph metadata tags instead of redirecting immediately.

::: warning Cloaking is not a privacy boundary
Cloaking embeds the destination website in a full-viewport iframe while the browser address bar displays the short link. Browsers and network inspectors still make direct connections to the target host. Websites that forbid embedding (using `X-Frame-Options` or `Content-Security-Policy`), as well as most authentication and payment flows, will refuse to load in cloaked mode.
:::

## Server-side health check

The **Dashboard → Check** tool (and the `/api/link/check` endpoint) probes target URLs directly from the Slite server (up to 10 URLs per batch, with timeouts between 1 and 30 seconds).

Requests to loopback addresses (`127.0.0.1`, `localhost`), private subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), and link-local ranges are blocked to prevent SSRF vulnerabilities.

## Site-wide redirect configuration

Tune instance-wide redirect behaviors through environment variables:

- **Redirect status code:** Configure `NUXT_REDIRECT_STATUS_CODE` (default `301`; supports `302`, `307`, or `308`). Unknown short-link lookups always redirect with HTTP `302`.
- **Cache control:** Set `NUXT_REDIRECT_NO_STORE=true` to send `Cache-Control: no-store` headers, preventing intermediate proxies and browsers from caching redirect responses.
- **Root redirect:** Set `NUXT_HOME_URL` to redirect `/` to another website instead of rendering the Slite landing page.
- **Not-found redirect:** Set `NUXT_NOT_FOUND_REDIRECT` to send unmatched slugs to a custom 404 or fallback landing page.
