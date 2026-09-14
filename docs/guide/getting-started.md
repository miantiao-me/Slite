# Getting Started

1. Clone [Slite](https://github.com/miantiao-me/Slite).
2. Copy `.env.example` to `.env` and set `NUXT_SITE_TOKEN` to a strong secret of at least 8 characters.
3. Follow [Docker deployment](/deployment/docker), including a persistent local `/data` volume.
4. Open `/dashboard`, sign in, and create a short link.

Without `NUXT_SITE_TOKEN`, Slite still serves existing public short links, but it generates a random token for that process only: the dashboard and API cannot be authenticated, the value is never logged or written to disk, and it changes on every restart. Configure a token and restart to administer the instance.

For local development, install Node.js 24 or newer and pnpm 11.11.0:

```sh
pnpm install
pnpm dev
```

The development server listens on port 5483 and stores runtime data in `./data`. Do not point development and production processes at the same data directory.

For an existing instance, use [manual link export/import](/features/import-export).
