# @emdzej/dashx-vehicles

Per-vehicle CAN signal tables for DASHX. v1 ships:

- **`bmw-e46-ms43`** — BMW E46 with MS43 DME (M54 engine, 1999-2006)
- **`bmw-e46-ms42`** — BMW E46 with MS42 DME (M52TU, 1998-2001)

Both share the E46 PT-CAN bus (500 kbps). The shared decoders live
in `src/bmw-e46-shared.ts` and the chassis profiles only override
the few fields that differ between DMEs (battery voltage byte on
0x329).

See [`docs/bmw-e46-can-ids.md`](../../docs/bmw-e46-can-ids.md) for
the full CAN ID table with citations.

## Adding a profile

1. Create `src/<vendor>-<chassis>-<variant>.ts` exporting a
   `VehicleProfile` from `@emdzej/dashx-can-decoder`.
2. Cite each new CAN ID in `docs/<vendor>-<chassis>-can-ids.md` —
   include a community link or quoted source for every byte layout.
3. Add a fixture-driven test in `src/<profile>.test.ts`. Real
   byte patterns, not hand-rolled ones.
4. Register the profile in `src/index.ts`'s `PROFILES` array.

## License

[PolyForm Noncommercial 1.0.0](../../LICENSE).
