# @emdzej/dashx-web

Browser SPA for DASHX — live CAN dashboard. Pick a vehicle profile,
connect to a CAN transport, watch gauges / lamps / frame log update
from decoded broadcast frames.

## Run locally

```bash
pnpm --filter @emdzej/dashx-web dev          # http://localhost:5176
pnpm --filter @emdzej/dashx-web build        # → apps/web/dist/
pnpm --filter @emdzej/dashx-web preview      # serve dist/ on :4173
pnpm --filter @emdzej/dashx-web typecheck
```

## Embedded build (dongle-hosted)

The `embedded` mode targets the [Bimmerz Box](https://github.com/emdzej/bimmerz-box)
dongle scenario, where this SPA is served by the dongle itself at
`http://172.16.7.1/dashx/` alongside the dongle's `/rpc/can/0`
WebSocket endpoint. The build differs from the default browser build
in four ways:

- **CAN source is locked to the dongle** — no transport picker;
  connect always targets `${origin}/rpc/can/0` (see
  [`lib/embedded.ts`](src/lib/embedded.ts)).
- **Auto-connect on open** — the `useEmbeddedAutoConnect` hook from
  `@emdzej/bimmerz-ui` opens the RPC session on mount, retries with
  exponential backoff on transient drops (1 → 2 → 4 → 8 → 16 → 30 s
  cap), and disconnects cleanly on `beforeunload` / `pagehide`. No
  `isReady` gate — dashx doesn't require an install like inpax /
  ncsx. The manual Connect button is still rendered but is a fallback
  path.
- **No PWA / service worker** — the dongle has no internet, precache
  + autoUpdate flows are noise on hardware the user doesn't manage.
  Source-maps are stripped and the base path is rewritten to
  `/dashx/`.
- **Bimmerz Box `manifest.json`** — a small Vite plugin emits
  `dist-embedded/manifest.json` (name, description, version pulled
  from `package.json`, icon, `requires: ["can"]`) so the dongle
  dashboard auto-discovers the app and renders a tile. Schema
  documented in [bimmerz-box's App manifest section](https://github.com/emdzej/bimmerz-box#app-manifest).

```bash
pnpm web:build:embedded          # → apps/web/dist-embedded/
pnpm web:preview:embedded        # serve dist-embedded/ locally on :4173
# → http://localhost:4173/dashx/  (note the /dashx/ prefix)
```

Ship `dist-embedded/` to the dongle's HTTP root under `/dashx/`. The
Bimmerz Box firmware picks it up from `/sdcard/apps/dashx/`.

Release builds attach `dashx-web-embedded-<version>.zip` to the
GitHub Release so dongle packagers can drop the zip straight onto
the SD card without cloning + building.
