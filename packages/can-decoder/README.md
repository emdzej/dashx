# @emdzej/dashx-can-decoder

Frame + signal contracts for DASHX. Three things live here:

- **`CanFrame` / `TimestampedCanFrame`** — the shape every transport
  emits and every decoder consumes.
- **`SignalDecoder<T>`** — one named scalar extracted from a frame.
  Pure function, returns `null` when the frame doesn't carry the
  signal.
- **`VehicleProfile`** — bundles signals with bitrate + a stable
  `id` for picker UIs.
- **Byte helpers** — `leU16` / `beU16` / `leI16` / `beI16` / `leU32`
  / `beU32` / `u8` / `bit` / `scaled`. The canonical way to assemble
  multi-byte scalars; direct shifts in decoder code are a smell.

```ts
import type { SignalDecoder } from "@emdzej/dashx-can-decoder";
import { leU16, scaled } from "@emdzej/dashx-can-decoder";

export const engineRpm: SignalDecoder = {
  id: "ENGINE_RPM",
  label: "Engine RPM",
  unit: "RPM",
  canId: 0x316,
  rateHz: 10,
  decode: (frame) => scaled(leU16(frame.data, 2), 1 / 6.4),
};
```

## License

[PolyForm Noncommercial 1.0.0](../../LICENSE).
