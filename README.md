# DASHX

Live CAN dashboard for BMW (and future) vehicles. Connects to a CAN bus,
decodes broadcast frames, surfaces a configurable widget grid (RPM,
coolant, speed, lamps, …) plus a raw frame log.

Pure listen / cycle messages — no diagnostic protocols (no DS2, no UDS,
no EDIABAS). For diagnostics see [ediabasx](https://github.com/emdzej/ediabasx)
or [inpax](https://github.com/emdzej/inpax).

## Status

Early. v1 targets BMW E46 PT-CAN — MS42 (M52TU) + MS43 (M54), DSC III /
MK60 ABS, and IKE clock/odo. Extensible: new vehicles drop in as
`VehicleProfile` modules.

## Transports

DASHX talks to a CAN bus through one of three backends:

| Source | What |
|---|---|
| `serial` | SLCAN-compatible USB dongle (CANable, USB2CANFD V1, Innomaker MCP25xx, …) over Web Serial |
| `serial-ws` | Same SLCAN protocol, tunnelled over a WebSocket — for remote/headless setups |
| `rpc` | The [bimmerz-box](https://github.com/emdzej/bimmerz-box) dongle's `/rpc/can/<n>` endpoint, via [`@emdzej/bimmerz-rpc-can`](https://github.com/emdzej/bimmerz) |

The web app picks at runtime; the `rpc` path is the only one wired in
the embedded (dongle-hosted) build.

**Why no K+DCAN?** The cable's MCU firmware is hard-wired to BMW's
diagnostic adapter protocol — it filters all CAN traffic down to the
configured ISO-TP request/response IDs and never forwards broadcast
frames. Stock K+DCAN cables can't be used for the bus-monitoring DASHX
needs. Use a SLCAN adapter (or the RPC backend) instead. For diagnostic
KWP2000 / D-CAN work on a K+DCAN cable, see [inpax](https://github.com/emdzej/inpax).

## Packages

| Package | Role |
|---|---|
| [`@emdzej/dashx-can-decoder`](packages/can-decoder) | `CanFrame` type + `SignalDecoder` contract + byte-helper utilities. |
| [`@emdzej/dashx-vehicles`](packages/vehicles) | Per-vehicle frame tables. MS42 / MS43 PT-CAN + E46 DSC + IKE in v1. |
| [`@emdzej/dashx-can-transport`](packages/can-transport) | `CanTransport` interface + the five transport implementations. |
| [`@emdzej/dashx-widgets`](packages/widgets) | Svelte 5 source-only components (Gauge, Bar, Lamp, Value, FrameLog). |
| [`@emdzej/dashx-web`](apps/web) | The SPA. Two build modes — browser + dongle-embedded. |

## Build

```bash
pnpm install
pnpm web              # vite dev server
pnpm web:build        # apps/web/dist/         (browser bundle, PWA)
pnpm web:build:embedded  # apps/web/dist-embedded/  (dongle bundle, /dashx/ base)
```

## Acknowledgements

E46 CAN ID tables documented from community sources — see
[docs/bmw-e46-can-ids.md](docs/bmw-e46-can-ids.md) for citations.

## License

[PolyForm Noncommercial 1.0.0](LICENSE).
