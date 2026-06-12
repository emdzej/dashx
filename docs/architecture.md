# DASHX architecture

## Layers

```
              ┌───────────────────────────────┐
              │   Widgets (Gauge/Bar/Lamp/…)  │   svelte 5 src-only
              └───────────────▲───────────────┘
                              │  reactive $state
              ┌───────────────┴───────────────┐
              │   apps/web — Dashboard layer  │
              │   - state.svelte.ts           │
              │   - connection.svelte.ts      │   decoder fan-out
              │   - config.ts / embedded.ts   │
              └───────────────▲───────────────┘
                              │  TimestampedCanFrame
              ┌───────────────┴───────────────┐
              │   @emdzej/dashx-can-transport │
              │   CanTransport interface +    │
              │   per-backend factories       │
              └─────▲────────▲────────▲───────┘
                    │        │        │
            RpcCan     SerialCan      SlcanWs
                    │
       @emdzej/bimmerz-rpc-can ── /rpc/can/<n>
```

## Data flow

1. **Transport opens** the bus and starts emitting `TimestampedCanFrame`
   objects to the registered handler.
2. **`connection.svelte.ts`** holds a `Map<canId, SignalDecoder[]>` built
   from the active `VehicleProfile`. On every frame, it runs the matching
   decoders, writes their values into `app.signals` (reactive), and pushes
   the raw frame into a bounded `app.frames` ring buffer.
3. **Widgets** read individual signal slots via `$derived` so they only
   re-render when their own value changes.

This split keeps the hot path simple: one frame in, one map lookup, one
or two decoder calls, N reactive mutations. The decoders themselves
are pure functions; side effects (alarms, logging, persistence) live
in the dashboard layer.

## Vehicle profiles

A `VehicleProfile` bundles a bitrate + an ordered list of
`SignalDecoder` instances. Each decoder is `(frame) → value | null`
plus metadata (`id`, `label`, `unit`, `canId`, optional `rateHz`).

Profiles live in `@emdzej/dashx-vehicles`. v1 ships:

- `bmw-e46-ms43` — E46 with MS43 DME (M54)
- `bmw-e46-ms42` — E46 with MS42 DME (M52TU)

Shared decoders (every E46 PT-CAN frame that doesn't change between
DMEs) live in `src/bmw-e46-shared.ts`; chassis profiles only override
the few that differ.

## Embedded mode

Build with `pnpm web:build:embedded` to get the dongle artefact at
`apps/web/dist-embedded/`:

- `__EMBEDDED__` compile-time flag (`vite --mode embedded` define).
- Asset paths prefixed `/dashx/` so the firmware can host
  side-by-side with `/ediabasx/`, `/inpax/`, `/ncsx/`, `/nfsx/`.
- `config.source` locked to `"rpc"` + `${origin}/rpc/can/0`.
- Settings dialog Connection panel replaced by a read-only summary.
- No PWA service worker, no sourcemaps.

The dongle exposes the canonical `@emdzej/bimmerz-rpc-can` contract
at `/rpc/can/0`; the SPA's RPC transport is a thin adapter that
maps that contract onto `CanTransport`.

## Things this isn't

- **Not a diagnostic tool.** No DS2, no KWP, no UDS, no
  `apiJob`-style requests. Pure listen / cycle messages. See
  ediabasx / inpax for diagnostic flows.
- **No CAN-FD.** Classical CAN only — BMW PT-CAN doesn't use FD and
  the dongle's TJA1051T transceivers don't either.
- **No DBC import** in v1. The `VehicleProfile` shape is rich
  enough to auto-generate from DBC later, but Phase 1 leans on
  hand-written profiles with citations.
