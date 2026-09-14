---
title: Click Webhooks
description: Enable click webhooks and verify their HMAC signatures, delivery behavior, payload, and privacy boundaries.
---

# Click Webhooks

Optional. When someone clicks a short link, Slite can POST a small JSON event to your URL. Configure `NUXT_WEBHOOK_URL` (and optional `NUXT_WEBHOOK_SECRET`) in [configuration](./).

Bot clicks excluded from analytics are also excluded here.

## Signing (optional but recommended)

If you set a secret, it must start with `whsec_`. Generate one on a machine with OpenSSL:

```sh
printf 'whsec_%s\n' "$(openssl rand -base64 32)"
```

Each request includes `webhook-id` and `webhook-timestamp`. Signed requests also include `webhook-signature: v1,<base64>` over:

```txt
<webhook-id>.<webhook-timestamp>.<raw-body>
```

Verify the **raw body** before parsing JSON. A wrong non-empty secret fails delivery (Slite will not fall back to unsigned).

## Payload

Event type `link.clicked` includes event id/time, link id/slug, and click attributes (country, city, device, browser, OS, referrer).

Country and city come from the resolved [GeoIP database](/deployment/docker#geoip-database); release Docker images bundle DB-IP City Lite, while an instance without a readable database fails open and leaves them empty.

It does **not** include IP, coordinates, full user-agent, query strings, passwords, or destination URLs.

## Delivery limits

::: tip Best-effort delivery
Delivery is async and never blocks the redirect. Failures are **not** retried. Your server must return 2xx within 10 seconds. Prefer HTTPS.
:::
