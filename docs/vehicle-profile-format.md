# Vehicle profile format

A `VehicleProfile` is the unit DASHX surfaces in the picker UI. One
profile = one (bus, signal-table) pair.

```ts
interface VehicleProfile {
  /** Stable identifier — e.g. `"bmw-e46-ms43"`. Lowercase, hyphenated. */
  id: string;
  /** Human label for the picker — e.g. `"BMW E46 MS43 (M54)"`. */
  label: string;
  /** Bus bitrate. PT-CAN on E46 is 500 kbps; K-CAN is 100 kbps. */
  bitrate: CanBitrate;
  /** Ordered list of signals the dashboard offers. */
  signals: SignalDecoder[];
}
```

## Identifier conventions

`id` is the API key the rest of the system uses — UI layouts
reference it, persisted config stores it as `app.config.vehicle`,
and lookups go through `findProfile(id)`. Treat as **public**:
don't rename without a migration path.

Pattern: `<vendor>-<chassis>-<variant>`.

- `bmw-e46-ms43` ✓
- `bmw-e90-jbe` ✓ (future)
- `bmwE46Ms43` ✗ — wrong case
- `e46` ✗ — no vendor

Some chassis have multiple buses (E46 PT-CAN at 500 + K-CAN at 100).
Either:

1. Bundle into one profile if the signal set is well-separated by
   ID (no ID collisions). The transport opens a single bus, so the
   profile picks one. Add a `bmw-e46-ms43-pt` and `bmw-e46-ms43-k`
   pair if both buses matter.
2. Ship one profile per bus and let users switch. v1 only does PT-CAN.

## Signal table

Order matters — the dashboard layout currently keys on signal
ordering for the future layout editor. Group by:

1. Primary readouts first (RPM, coolant — gauges)
2. Numeric readouts (speed, steering — values)
3. Secondary readouts (throttle, battery — bars)
4. Lamps (last, since they're the smallest widgets)

Per-engine variants on the same chassis should **share** decoders
where possible:

```ts
// shared.ts
export const engineRpm: SignalDecoder = { … };

// bmw-e46-ms43.ts
import { engineRpm } from "./bmw-e46-shared.js";
export const bmwE46Ms43: VehicleProfile = {
  signals: [engineRpm, …],
};
```

Only override when the byte layout actually differs (e.g. battery
voltage byte position between MS42 and MS43 — see
`docs/bmw-e46-can-ids.md` for the citations).

## Testing

Every new signal ships with a fixture test:

```ts
it("decodes idle RPM from B2-B3 LE", () => {
  /* 700 RPM × 6.4 = 4480 = 0x1180 → LE bytes 0x80, 0x11 */
  const f = frame(0x316, [0, 0, 0x80, 0x11, 0, 0, 0, 0]);
  expect(engineRpm.decode(f)).toBe(700);
});
```

Don't roll fixtures by hand — derive them from the canonical raw
value that produces a known engineering value. The math being
visible in the test comment is what makes it auditable.
