# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# GeoIP stage: download the public DB-IP City Lite database. This stage never
# receives build secrets; see scripts/download-dbip.mjs for download,
# validation, and attribution generation.
# ---------------------------------------------------------------------------
FROM node:24-trixie-slim AS geoip
# Optional YYYY-MM pin; without it the script tries the current month first and
# falls back to the previous month.
ARG DBIP_VERSION=
COPY scripts/download-dbip.mjs /download-dbip.mjs
RUN DBIP_VERSION="${DBIP_VERSION}" node /download-dbip.mjs

# ---------------------------------------------------------------------------
# Build stage: install dependencies, build the Nuxt server output, and assemble
# the production node_modules required by the native DuckDB driver.
# ---------------------------------------------------------------------------
FROM node:24-trixie-slim AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN npm install --global pnpm@11.11.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# Keep the full `pnpm deploy` output so the runtime layout stays self-contained.
RUN pnpm --filter . deploy --prod --legacy /runtime
# Distroless has no shell, so prepare /data with nonroot ownership (5483) here.
RUN install -d -m 0755 -o 5483 -g 5483 /data-root && touch /data-root/.keep

# ---------------------------------------------------------------------------
# Runtime stage: distroless Node.js 24 without a shell or package manager.
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime

LABEL org.opencontainers.image.title="Slite" \
      org.opencontainers.image.description="A Simple, Self-Hosted Link Shortener with Analytics." \
      org.opencontainers.image.source="https://github.com/miantiao-me/Slite" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5483 \
    NUXT_DATA_DIR=/data \
    PATH=/nodejs/bin:$PATH
WORKDIR /app

COPY --from=build --chown=5483:5483 /app/.output ./.output
COPY --from=build --chown=5483:5483 /runtime/node_modules ./node_modules
COPY --from=geoip --chown=5483:5483 /geoip ./geoip
COPY --from=build --chown=5483:5483 /data-root /data

USER 5483:5483
VOLUME ["/data"]
EXPOSE 5483

# Shell-free healthcheck: any 2xx-3xx response from `/` counts as healthy, and
# redirects (for example NUXT_HOME_URL) are never followed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "--input-type=module", "-e", "const response = await fetch(`http://127.0.0.1:${process.env.PORT || 5483}/`, { redirect: 'manual' }); process.exit(response.status >= 200 && response.status < 400 ? 0 : 1);"]

CMD ["/app/.output/server/index.mjs"]
