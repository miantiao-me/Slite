---
title: Getting Started
description: Prepare local storage, run Slite with Docker or Compose, configure the site token, and create your first short link.
---

# Getting Started

Slite is a simple, self-hosted short-link application with visit analytics. It runs as a single Node.js process on your own server or workstation, requiring no cloud account.

## 1. Get Slite

Clone the repository to your host:

```sh
git clone https://github.com/miantiao-me/Slite.git
cd Slite
```

Alternatively, download `compose.yaml` and `.env.example` directly if deploying via Docker Compose.

## 2. Choose how to run

- **[Docker and Compose](/deployment/docker)** — recommended for production and self-hosting
- **Source execution:** requires Node.js 24 or newer and pnpm 11.11.0:

```sh
pnpm install
pnpm dev
```

The development server listens on port `5483` and writes state to `./data` by default.

## 3. Understand local storage

All persistent state lives in a single local directory (`/data` by default, configured by `NUXT_DATA_DIR`):

| Relative path      | Role                   | Description                                          |
| ------------------ | ---------------------- | ---------------------------------------------------- |
| `slite.sqlite`     | Authoritative database | Stores all links and application state               |
| `analytics.duckdb` | Analytics database     | Records visit events and powers dashboard statistics |
| `files/images`     | Image storage          | Stores uploaded social preview images                |
| `backups`          | Backup storage         | Stores automatic and manual link JSON backups        |

Mount a **persistent local volume** to `/data`. Slite does not require external database services; SQLite and DuckDB are managed directly by the process.

## 4. Configure environment variables

Copy `.env.example` to `.env` and configure your settings:

```dotenv
NUXT_SITE_TOKEN=replace-with-a-strong-private-token
NUXT_DATA_DIR=/data
NUXT_TRUST_PROXY=false
```

::: warning Set `NUXT_SITE_TOKEN` yourself
This token is your **dashboard login password** and the credential used by API tools. It must be at least 8 characters long and contain no whitespace. Keep it stable — changing it invalidates existing sessions.

If you leave it empty or unset, Slite still serves public short links, but it generates an ephemeral random token in memory that is never logged or written to disk. The dashboard and API will remain inaccessible until you configure an explicit token and restart the container.
:::

Other configuration options: [Configuration Reference](/configuration/).

## 5. First login and first link

1. Start the service with Docker Compose:

```sh
docker compose up -d
```

2. Open `http://localhost:5483/dashboard` (or your domain)
3. Sign in with the `NUXT_SITE_TOKEN` you configured
4. Create your first short link

Unlike Cloudflare-based setups, Slite initializes its SQLite schema automatically on startup and manages an in-memory link cache that rebuilds on demand. No manual migration or storage warmup step is needed.

The dashboard supports multiple languages. Documentation is available in English and Simplified Chinese.
