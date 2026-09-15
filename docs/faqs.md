---
title: Troubleshooting
description: Fix common deployment, permissions, login, analytics, proxy, redirect, and AI issues in Slite.
---

# Troubleshooting

## The container fails to start or reports database permissions errors

1. **Check directory permissions:** The Slite container runs under the non-root user UID `5483`. If using a host bind mount (e.g. `/srv/slite:/data`), ensure UID `5483` owns the directory:
   ```sh
   sudo chown -R 5483:5483 /srv/slite
   ```
2. **Ensure single-process exclusivity:** Only one process may hold open the SQLite and DuckDB databases. Verify no development server or secondary container has the same directory mounted.
3. **Inspect container logs:**
   ```sh
   docker compose logs -f
   ```

## Cannot sign in to `/dashboard` or API calls return 401

1. **Verify `NUXT_SITE_TOKEN`:** Ensure `NUXT_SITE_TOKEN` is explicitly defined in `.env`, contains at least 8 characters, and has no whitespace.
2. **Ephemeral random token fallback:** If `NUXT_SITE_TOKEN` is unset or empty, Slite generates a random token that exists purely in process memory. Public redirects work, but the dashboard and protected API cannot authenticate. Define a token and restart the container:
   ```sh
   docker compose up -d
   ```
3. **Authorization header format:** API requests must use the exact format `Authorization: Bearer YOUR_SITE_TOKEN`.

## Data disappeared after recreating or updating the container

- **Verify volume mounts:** Check `compose.yaml` to ensure the persistent volume (default `slite-data:/data`) is properly mounted.
- **Did you use `down -v`?** Running `docker compose down -v` deletes named volumes. During normal maintenance or upgrades, use `docker compose down` (without `-v`) or run `docker compose up -d` directly.

## Country and city analytics charts are empty

1. **GeoIP database resolution:** Release Docker images bundle the DB-IP City Lite database, which activates automatically. For source builds or custom images, ensure a valid MMDB file exists at `/data/geoip.mmdb` or set `NUXT_GEOIP_PATH`.
2. **Fail-open behavior:** When no database is found, Slite fails open by leaving geographic fields empty rather than interrupting redirects.
3. **No time-zone data:** City Lite contains country, region, city, and coordinates, but does not provide time zones. Slite never invents missing time zones.
4. **Proxy configuration:** Setting `NUXT_TRUST_PROXY=true` changes which client IP is inspected, but does not generate location data on its own.

## Client IP addresses are incorrect behind a reverse proxy

1. Ensure direct connections to the application port are blocked and all traffic passes through your reverse proxy.
2. Configure the reverse proxy to overwrite incoming `X-Forwarded-For` or provide a trusted header such as `CF-Connecting-IP`.
3. Set `NUXT_TRUST_PROXY=true` in `.env`. If using a specific header, set `NUXT_CLIENT_IP_HEADER=CF-Connecting-IP`.

## Realtime 3D globe events arrive in bursts or feel delayed

This is expected behavior. The realtime dashboard polls DuckDB approximately every 10 seconds and replays queued events at roughly one per second. It is a pseudo-live visual overview, not an SSE or WebSocket stream. Verify that the view is not paused and the browser tab remains active.

## Custom short codes lose uppercase letters

Set `NUXT_CASE_SENSITIVE=true` in `.env` and restart the container. Case sensitivity applies only to **custom** short codes; auto-generated random codes always remain lowercase. Existing links are not retroactively renamed.

## Cloaked page is blank or refuses to load

The destination website likely enforces anti-framing policies (`X-Frame-Options` or `Content-Security-Policy: frame-ancestors`). Disable cloaking for that link. Most third-party authentication and checkout pages disallow framing by design.

## Safe browsing did not flag an unsafe domain

Automated DNS-over-HTTPS checks execute only when creating or editing a link with `unsafe` left unset. An explicit manual `true` or `false` always takes priority. If the DNS lookup fails or times out, Slite allows the link instead of blocking it.

## AI suggestions return HTTP 501 or fail

1. **Both variables required:** AI stays disabled until **both** `NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` are set in `.env`.
2. **Outbound network:** Ensure the container can reach your provider's API endpoint.
3. **Model identifier:** Verify that the configured model name is valid and enabled on your provider account.

## Import skips or rejects records

- **Active slug conflicts:** Existing active short codes are skipped to protect current links from accidental overwrite.
- **Batch limits:** Ensure your batch size does not exceed `NUXT_IMPORT_REQUEST_LIMIT` (default 100).
- **Password values:** Use protected password strings from Slite/Sink JSON exports. Masked placeholder strings copied from dashboard inputs are invalid.
