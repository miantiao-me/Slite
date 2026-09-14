# Slite Repository Guide

## Sibling versions

- Slite and [Sink](https://github.com/miantiao-me/Sink) are sibling versions of the same link-management and analytics project. Sink is not legacy or deprecated, and Slite is not a fork replacement for it.
- Keep features, API contracts, and file organization compatible with Sink wherever practical.
- The intended differences are limited to runtime and storage: Slite removes the Cloudflare runtime and runs as a local Node.js/Docker process with SQLite authoritative storage, an unstorage memory link cache, unstorage filesystem images and backups, and DuckDB analytics.
- When porting a feature from Sink, compare against the Sink implementation first and avoid unnecessary renames or contract drift.

## Non-obvious constraints

- Write all documentation and code comments in English.
- Use Node.js 24 or newer and pnpm 11.11.0 (`package.json` is authoritative). The root package is the Nuxt app; `docs/` is the `@slite/docs` VitePress workspace package.
- Do not hand-edit `app/components/ui/**`; it is managed by shadcn-vue and excluded from ESLint.
- Read `DESIGN.md` before UI work. The authoritative design sources are `app/assets/css/tailwind.css` and `app/components/ui/**`; `DESIGN.md` is a derived summary.
- Do not invent undocumented design tokens.
- Feature-level classes should stay focused on layout and composition. Prefer shared component variants and sizes over overriding primitive chrome such as radius, border, shadow, background, typography, padding, height, or focus, hover, and disabled states. Recurring product-specific exceptions should become app-owned wrappers outside `app/components/ui/**`.
- Use `DropdownMenu` for compact contextual action lists and `Popover` for richer anchored content; do not simulate menu items with buttons inside a `Popover`.
- Compose dashboard navigation and utilities with `SidebarMenu`, `SidebarMenuItem`, and `SidebarMenuButton`; do not recreate sidebar hover, focus, radius, or collapsed behavior with raw controls.
- After changing design tokens or `DESIGN.md`, run `npx @google/design.md lint DESIGN.md` and resolve all errors.
- Nuxt and server utilities are auto-imported. Follow nearby code before adding explicit imports for framework globals.
- Use `@lucide/vue` for Lucide icons; do not add `lucide-vue-next`.
- Application forms must live in dedicated `*Form.vue` components and should prefer `@tanstack/vue-form`. Generated components under `app/components/ui/form/**` may use `vee-validate` internally.
- Business dialogs must live in dedicated `*Dialog.vue` or `*Modal.vue` components; use `AlertDialog` for confirmations and `ResponsiveModal` for task content that adapts between dialog and drawer, and do not inline these implementations in unrelated components.
- Locale messages live in `i18n/locales/<locale>/*.json` and are loaded through the module list in `i18n/i18n.ts`. Organize feature messages by their owning product domain; do not introduce cross-cutting `ux`, `ui`, or `messages` namespaces at the top level or across product domains.
- Keep every locale directory aligned on module files, translation keys, and interpolation placeholders. When moving a key or changing the module list, update every locale and all application references in the same change.

## Setup and commands

```bash
pnpm install                              # also runs build:map, nuxt prepare, and hook setup
pnpm dev                                  # Nuxt dev server on port 5483
pnpm build                                # production build with an 8 GB Node heap
pnpm preview                              # requires existing .output build artifacts
pnpm dev:docs                             # VitePress docs dev server
pnpm build:docs                           # production docs build
pnpm preview:docs                         # preview the docs build
pnpm lint                                 # check only
pnpm lint:fix                             # modifies files
pnpm types:check
pnpm test --run                           # full Vitest run, not watch mode
pnpm test --run tests/api/link.spec.ts    # one test file
pnpm test --run -t 'creates new link'     # tests matching a name
```

- ESLint and TypeScript extend generated `.nuxt` files. If they are missing, run `pnpm postinstall` (or `pnpm install`) before diagnosing config errors.
- Tests that authenticate against a running server configure their own `NUXT_SITE_TOKEN`; local values are loaded from `.env`, with `.env.example` as the template.
- There is no validation CI workflow. Run the relevant lint, typecheck, and test commands locally.
- The pre-commit hook only runs `eslint --fix` on staged JS/TS/Vue files; it does not replace full-project verification.

## Architecture and data flow

- `app/` is a client-only Nuxt 4 UI (`ssr: false`), and `/dashboard` redirects to `/dashboard/links`. `server/` is the Nitro Node.js backend. Run one process per local persistent data directory; no clustered workers, shared network volumes, or replicas sharing data.
- `shared/` owns schemas, cross-runtime utilities, and shared types. Prefer `#shared/...`; `app/types/index.ts` only re-exports selected shared types for UI use. Never import `app/**` from `server/**`; move cross-runtime code to `shared/**` instead.
- Use `useAPI()` for authenticated internal APIs, mutations, polling, searches, and abortable user flows. Reserve Nuxt `useFetch` for read-only data where AsyncData caching, deduplication, or shared state provides a concrete benefit.
- SQLite at `/data/slite.sqlite` remains the authoritative link and application-state store. The link cache uses the unstorage memory driver: it is process-local, rebuildable, and never a second source of truth. A new process starts with an empty cache and repopulates it from SQLite on demand; committed writes synchronously invalidate cached entries. Cache failures disable caching and fall back to SQLite. Route link persistence through `server/utils/link-store.ts` and cache operations through `server/services/link-store/cache.ts`.
- Link validation has separate create, edit, import, and stored contracts in `shared/schemas/link.ts`. Preserve the distinct validation behavior and compatible protected-password import/export.
- `server/middleware/1.redirect.ts` intentionally runs before `2.auth.ts`: public short-link resolution happens first. `GET /api/location` remains public for Sink compatibility; every other `/api/**` request requires the site token. When `NUXT_SITE_TOKEN` is unset or empty, startup generates a process-local random token that is never logged or persisted, so public redirects keep working while dashboard and protected API access stays unavailable; a configured token must be at least 8 characters.
- `NUXT_DATA_DIR` defaults to `/data` (`./data` under `nuxt dev`). Analytics lives in `analytics.duckdb`; uploaded images and link-export backups are written through the unstorage filesystem driver under `files/images` and `backups`, relative to that directory.
- AI is disabled by default and uses xsai: set `NUXT_AI_BASE_URL` and `NUXT_AI_MODEL` for an OpenAI-compatible provider; `NUXT_AI_API_KEY` may be empty when the provider does not require a key. Do not reintroduce platform bindings.
- `NUXT_TRUST_PROXY` defaults to `false`. Trust forwarded headers only behind a controlled proxy. Geographic metadata is empty by default; do not fabricate location data.
- The realtime dashboard is intentionally pseudo-live: it polls analytics every 10 seconds, then replays the initial and newly discovered access events through a bounded client-side queue at roughly one event per second. Pausing stops polling, queue replay, and WebGL motion; it is not an SSE or WebSocket stream.

## Database and deployment

```bash
docker compose up -d --build  # build and run one instance with persistent /data
docker compose logs -f       # inspect application logs
docker compose stop         # stop before a full data-directory backup
docker compose start        # restart after the backup
```

- Keep schema changes and their initialization/migration behavior together. Prefer the existing database utilities and Drizzle patterns for SQLite; use DuckDB for analytics.
- Docker and Compose use local persistent storage. Do not remove volumes during upgrades or run old and new processes against the same directory.
- DuckDB uses a native module. Install dependencies for the target Node.js 24-or-newer runtime, operating system, and architecture; do not copy host `node_modules` into Docker images. SQLite uses Node's built-in `node:sqlite`.
- Keep custom host data directories outside the Docker build context or exclude the entire directory in `.dockerignore`; database filename exclusions do not protect uploaded files and backups.
- Application backups are link JSON exports, not full snapshots, and exclude the process-local link cache. A complete backup requires stopping the process and copying all of `/data`; preserve configuration and secrets separately. The link cache rebuilds automatically and does not need restoring.
- Automatic link backups run daily by default and retain the latest 30 automatic backups; manual backups are never removed by automatic retention. Set `NUXT_DISABLE_AUTO_BACKUP=true` to disable the schedule.

## Testing

- Tests must use isolated temporary local data, never the production `/data` directory.
- Use unique slugs and existing cleanup helpers; do not make state-sharing suites concurrent.
- Read the active Vitest configuration before assuming whether a test imports source or exercises built output. Build first when testing the production server artifact.

## Generated artifacts

- `pnpm install` regenerates ignored `public/world.json` via `build:map`.
- `pnpm build` regenerates `public/sphere.bin` through its prebuild hook.
