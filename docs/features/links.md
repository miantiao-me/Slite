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

## Reverse proxy mode

When reverse proxy mode is enabled on a link, visiting `/:slug` makes the Slite process fetch the destination URL and stream the response directly to the client without issuing HTTP 301/302 redirects.

Slite intentionally uses a simple, single-request proxy model: it does not act as a full website proxy, does not assign separate domains or subdomains, and only forwards the single request made to the short code itself.

### Suitable use cases

- **API endpoints:** Forward API requests or webhooks with `Authorization` and custom headers passed through, returning responses directly to the caller.
- **Shell install scripts:** Support one-line commands such as `curl -fsSL https://slite.example/install | bash`.
- **Raw text and configurations:** Serve raw snippets, JSON payloads, or remote subscription configurations.
- **Single file downloads:** Provide direct file downloads without bouncing visitors through external storage links.

### Unsuitable use cases and limitations

Reverse proxy mode is **not intended for standard multi-asset web pages**.

Because proxying applies only to the single request to `/:slug`, Slite:

- **Does not rewrite asset paths** inside HTML or CSS.
- **Does not route subpaths** (requests to `/:slug/subpath` are not forwarded to the destination).
- **Does not proxy runtime requests** such as dynamic `import()`, `fetch()`, or WebSockets.

For example, if the destination page references `<script src="/assets/app.js">` or `<link rel="stylesheet" href="./style.css">`, the browser will request those files from your Slite domain (`https://slite.example/assets/app.js`), resulting in 404 errors, broken styles, and script failures. Only self-contained pages whose assets use absolute external URLs (such as CDN links) can render properly.

### How to enable

Reverse proxy mode is **off by default**.

1. **Set the environment variable:** Add `NUXT_PUBLIC_LINK_PROXY_ENABLED=true` to the process environment.
2. **Restart the process:** Restart the Node.js process or recreate the Docker container so the runtime configuration picks up the flag.

This flag only controls resolution: when disabled, links configured with proxy mode simply fall back to standard HTTP redirects when visited. Proxy and cloaking are mutually exclusive; the dashboard switch enables one and turns the other off.

### Security notes and protections

::: warning Same-origin security risk
Proxied responses are served under your Slite domain and execute in the **same origin without a CSP sandbox**.

Any active upstream content (HTML, JavaScript, SVG) runs in the same origin as your Slite dashboard and can access cookies and `localStorage` (including dashboard site tokens). **Never proxy untrusted or unknown destinations.**
:::

Slite enforces the following built-in protections:

- **Private target blocking:** Only public `http(s)` targets are allowed. Requests to `localhost`, IPv4 private/reserved ranges, and IPv6 `::`, `::1`, ULA, link-local, multicast, or `::ffff:` mapped addresses are blocked. Literal-IP checks cannot defend against DNS rebinding on hostname targets. Upstream redirects are followed automatically, and only the initial target is validated.
- **Request header filtering:** Client `cookie`, `host`, hop-by-hop headers, `content-length`, `cf-*`, `x-forwarded-*`, `x-real-ip`, and `x-link-*` headers are stripped; `authorization` and other custom headers are forwarded. Slite automatically populates `x-forwarded-for` with the trusted client IP (respecting `NUXT_TRUST_PROXY` / `NUXT_CLIENT_IP_HEADER`), plus `x-forwarded-proto` and `x-forwarded-host`.
- **Response header filtering:** Upstream hop-by-hop headers and `set-cookie` headers are stripped. Responses always include `X-Content-Type-Options: nosniff`.
- **Protected link isolation:** When a visitor confirms a password or unsafe warning form, the upstream request is made within the same request as a bodyless GET, ensuring submitted passwords are never sent upstream. API clients can stream request bodies (JSON or binary) directly by passing `x-link-password` and `x-link-confirm: true` headers. Responses for password-protected or unsafe links are always marked `Cache-Control: private, no-store`.

## Server-side health check

The **Dashboard → Check** tool (and the `/api/link/check` endpoint) probes target URLs directly from the Slite server (up to 10 URLs per batch, with timeouts between 1 and 30 seconds).

Requests to loopback addresses (`127.0.0.1`, `localhost`), private subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), and link-local ranges are blocked to prevent SSRF vulnerabilities.

## Site-wide redirect configuration

Tune instance-wide redirect behaviors through environment variables:

- **Redirect status code:** Configure `NUXT_REDIRECT_STATUS_CODE` (default `301`; supports `302`, `307`, or `308`). Unknown short-link lookups always redirect with HTTP `302`.
- **Cache control:** Set `NUXT_REDIRECT_NO_STORE=true` to send `Cache-Control: no-store` headers, preventing intermediate proxies and browsers from caching redirect responses.
- **Root redirect:** Set `NUXT_PUBLIC_HOME_URL` to redirect `/` to another website instead of rendering the Slite landing page. The deprecated `NUXT_HOME_URL` name still works.
- **Not-found redirect:** Set `NUXT_NOT_FOUND_REDIRECT` to send unmatched slugs to a custom 404 or fallback landing page.
