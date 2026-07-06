# Changelog

All notable changes to **dashx** are documented here. Versions follow
[Semantic Versioning](https://semver.org/); format adapted from
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.2.0 — 2026-07-06 — Embedded auto-connect + release artefact

Wires the dongle-embedded dashx-web into the shared
`useEmbeddedAutoConnect` lifecycle hook from `@emdzej/bimmerz-ui@0.2.0`
and attaches `dashx-web-embedded-<version>.zip` to every GitHub
Release so Bimmerz Box packagers can drop the SPA onto the SD card
without cloning the monorepo.

Nothing changes for the hosted browser build at `dashx.bimmerz.app` —
the auto-connect hook is a no-op when `__EMBEDDED__` is false, so the
manual Connect button stays in charge.

### Added

- **Embedded-mode auto-connect** in `apps/web`. `App.svelte` calls
  `useEmbeddedAutoConnect({ isEmbedded, connect, disconnect, isConnected, log })`
  from `@emdzej/bimmerz-ui`. The hook opens the same-origin
  `/rpc/can/0` CAN endpoint on mount, retries with exponential
  backoff on transient drops (1 → 2 → 4 → 8 → 16 → 30 s cap), and
  fires `disconnect()` on `beforeunload` / `pagehide` so the dongle
  WebSocket closes cleanly. No `isReady` gate — dashx doesn't
  require an install like inpax / ncsx; the connection can be
  attempted immediately. Attempts stream to the `dashx.autoconnect`
  bimmerz-logger category.
- **`web:preview:embedded`** — new root script that runs
  `vite preview --mode embedded`, serving `dist-embedded/` at
  `http://localhost:4173/dashx/` with the same base-path + no-PWA
  behaviour as the on-dongle bundle. Root `/` auto-redirects to the
  prefixed URL.
- **Bimmerz Box `manifest.json`** — a tiny Vite plugin
  (`dashx-embedded-manifest`) emits `dist-embedded/manifest.json` at
  build time (`name` / `description` / `version` from
  `package.json` / `icon` / `requires: ["can"]`). The bimmerz-box
  dashboard auto-discovers apps under `/sdcard/apps/` by reading
  this file — see
  [bimmerz-box's App manifest section](https://github.com/emdzej/bimmerz-box#app-manifest).
- **Embedded-build docs** — new "Embedded build (dongle-hosted)"
  section in `apps/web/README.md`.

### Release artefacts

- **`dashx-web-embedded-<version>.zip`** attached to each GitHub
  Release via `publish.yml`. Workflow runs
  `pnpm --filter @emdzej/dashx-web build:embedded`, zips
  `dist-embedded/`, and uploads via `gh release upload`. Required
  permission bumped to `contents: write`.
- **npm publish is best-effort** — `continue-on-error: true` on the
  publish step so a registry hiccup / OIDC glitch / already-
  published-version doesn't block the release artefact upload
  packagers depend on.

### Dependencies

- **`@emdzej/bimmerz-ui@^0.2.0`** — new dependency of
  `@emdzej/dashx-web`. Source-only Svelte package — added to
  `optimizeDeps.exclude` so each `.svelte` / `.svelte.ts` file is
  routed through `@sveltejs/vite-plugin-svelte`'s transform instead
  of esbuild's pre-bundler (which lacks the loader for those
  extensions and would choke on TS syntax in a `.svelte.ts` file).

## 0.1.0 — initial

Initial release. Live CAN dashboard: SLCAN / RPC transport pickers,
DBC + inline TS vehicle profiles, gauge / lamp / frame-log widgets.
