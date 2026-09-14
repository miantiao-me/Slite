# Node regression tests

## Prerequisites

- Use Node.js 24 or newer for both the build and Vitest. DuckDB is a native dependency and must be installed for that runtime; SQLite uses Node's built-in `node:sqlite`.
- Build the current Node server before HTTP tests: `pnpm build`.
- The default entry is `.output/server/index.mjs`; `SLITE_TEST_ENTRY` can select another freshly built Node entry. Do not run against a stale build.

## Commands

```sh
pnpm test --run tests/unit tests/webhook.spec.ts
pnpm test --run tests/api tests/redirect.spec.ts
pnpm test --run
pnpm exec eslint tests vitest.config.ts
pnpm exec vue-tsc --noEmit -p tests/tsconfig.json
```

No real site token, production data directory, AI account, or external analytics service is required. The harness supplies a test token, allocates a loopback port, and creates a temporary data directory for each HTTP suite. It overrides data, AI, webhook, preview, and proxy settings rather than loading `.env` into tests. AI tests start a local OpenAI-compatible HTTP stub and verify both generation routes, provider errors, malformed responses, providers without an API key, and the default-disabled 501 path with zero outbound target fetches.

Tests run sequentially. The harness supports stop/start/restart with the same data directory, captures startup diagnostics, terminates child processes, and removes temporary data after the suite. Expiration fixtures stop the server before updating the isolated SQLite file and start it again afterward; no two application processes share a data directory. Native SQLite optimistic-lock tests use their own separate temporary database without starting an HTTP server.

## Evidence boundaries

- Link validation, password protection, CRUD, import/export, redirect, count/search, upload, stats validation, and platform-independent unit tests are covered.
- Real HTTP cases cover DuckDB event recording/filtering/aggregation, file and database restart persistence, private backup exports, unsafe file paths, and local AI provider calls.
- Optimistic conflict and transaction rollback behavior is tested directly against the real SQLite store, not with nondeterministic HTTP races.
- Real cache and SQLite tests cover cache hits, expiration, write invalidation, concurrent reads and writes, bulk fallback, and cache clearing. Fault-injection tests verify SQLite fallback after cache failures. Cache tests run within one test process; they do not establish crash recovery. Linux container compatibility is not covered by these tests.
- A successful unit run is not evidence that the production build or native HTTP integration works. Rebuild after application changes and rerun the HTTP suite.
