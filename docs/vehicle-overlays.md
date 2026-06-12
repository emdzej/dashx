# Vehicle profiles: DBC + overlays

DASHX supports two ways to define a vehicle:

1. **Inline TypeScript** — a `VehicleProfile` written as code in
   `@emdzej/dashx-vehicles/src/<vendor>-<chassis>-<variant>.ts`.
   Hardcoded, type-checked, requires a rebuild to change.
2. **DBC + overlay** — a declarative pair of files: a `.dbc`
   (industry-standard CAN database) for the bit-level decode plus a
   companion `.overlay.json` for derived signals, widget hints, and
   UI grouping. Loaded at runtime via the bimmerz VFS — no rebuild.

The two coexist. The Settings dropdown lists both flavours so you
can A/B-compare while a DBC profile is being validated.

This guide explains **how to author the DBC + overlay pair** so you
can add a vehicle to DASHX without touching its source.

## Anatomy

A profile lives in its own folder:

```
profiles/
└── my-car/
    ├── index.json              ← VFS manifest (HttpDirectory needs this)
    ├── my-car.dbc              ← bit-level decode
    └── my-car.overlay.json     ← UI + derived signals
```

You can drop this folder anywhere DASHX can read it via the VFS:

- **Bundled** — committed to `apps/web/public/profiles/<id>/`. Pick
  it from the Settings dropdown.
- **Local folder** — Settings → "Load custom DBC folder…" pops the
  File System Access picker; pick any folder containing a `.dbc` +
  `.overlay.json`. The chosen folder is read in-process via
  `FsaDirectory`; the browser never uploads anything.
- **HTTP** — any URL serving the manifest layout works. Useful for
  team-shared profiles hosted on a Gist / S3 / static page.

## DBC file

The DBC grammar is Vector's CANdb text format — the de-facto
standard. Most CAN tooling reads it: Wireshark, SocketCAN
(`canplayer`), Vector CANalyzer, BUSMASTER, cantools, candle-bus,
plus this project's `parseDbc()` parser.

A minimal DBC for one frame:

```dbc
VERSION "my car v1"
BU_: DME DSC

BO_ 790 DME1: 8 DME
   SG_ ENGINE_RPM : 16|16@1+ (0.15625,0) [0|7000] "RPM"  Vector__XXX
   SG_ COOLANT   : 8|8@1+ (0.75,-48) [-48|143] "degC"   Vector__XXX

CM_ SG_ 790 ENGINE_RPM "Engine speed N_ENG. Idle ~700, redline ~6500.";

BA_DEF_ BO_ "GenMsgCycleTime" INT 0 30000;
BA_DEF_DEF_ "GenMsgCycleTime" 0;
BA_ "GenMsgCycleTime" BO_ 790 10;
```

What each piece does:

- `BU_:` — list of nodes / ECUs on the bus. Pure documentation.
- `BO_ <id> <name>: <dlc> <sender>` — message header. `id` is the
  decimal CAN ID (0x316 → 790). `dlc` is the payload length in
  bytes (almost always 8 on E46).
- `SG_ <name> : <start>|<len>@<endian><sign> (<scale>,<offset>) [<min>|<max>] "<unit>" <receivers>`
  — one signal:
  - `<start>|<len>` — bit start position + length.
  - `@<endian>` — `1` = Intel/little-endian, `0` = Motorola/big-endian.
  - `<sign>` — `+` unsigned, `-` signed (two's complement).
  - `(<scale>,<offset>)` — physical value = `raw × scale + offset`.
  - `[<min>|<max>]` — informational bounds.
  - `"<unit>"` — display unit suffix.
  - `<receivers>` — list of ECUs (informational).
- `CM_ SG_ <id> <name> "<text>";` — signal comment. DASHX surfaces
  this as the widget tooltip when no overlay description overrides it.
- `BA_DEF_` / `BA_` / `BA_DEF_DEF_` — attribute schema + values.
  `GenMsgCycleTime` (in ms) is the conventional name for message
  cycle time; DASHX reads it and sets `SignalDecoder.rateHz`.
- `VAL_` / `VAL_TABLE_` — enum value tables. Map raw integers to
  human labels (`0 "off" 1 "on" …`).

### Intel vs Motorola bit positions

**Intel (little-endian)** — start bit is the LSB. A 13-bit signal
at `start_bit=11, length=13` occupies bits 11..23, which is
*byte 1 bits 3-7* (low 5 bits of the field) + *byte 2 bits 0-7*
(high 8 bits). This is the format BMW PT-CAN uses everywhere except
LWS1 steering.

**Motorola (big-endian)** — start bit is the MSB. A 16-bit signal
at `start_bit=7, length=16` occupies bits 7..0 of byte 0 (high 8)
then bits 7..0 of byte 1 (low 8). LWS1 steering angle uses this.

DBC editors visualise the bit layout — open the `.dbc` in
[Kvaser DBC editor](https://kvaser.com/) or BUSMASTER and click
through the signals to see the actual byte layout.

### Multiplexed signals (mux groups)

When one byte carries different meanings depending on a selector:

```dbc
BO_ 809 DME2: 8 DME
   SG_ MUX_CODE M : 6|2@1+ (1,0) [0|3] ""  Vector__XXX
   SG_ CanLevelInfo m0 : 0|6@1+ (1,0) [0|63] "" Vector__XXX
   SG_ ObdSteuerInfo m2 : 0|6@1+ (1,0) [0|63] "" Vector__XXX

VAL_ 809 MUX_CODE 0 "CAN_LEVEL" 2 "OBD_STEUER" 3 "MD_NORM" ;
```

- `M` marks the selector signal.
- `m<n>` marks a variant that's active only when the selector
  equals `<n>`.

DASHX's compiler returns `null` from the variant's decoder when the
selector doesn't match — which the dashboard treats as "no data
this frame" and leaves the previous value on screen.

## Overlay file (JSON)

The overlay is a JSON document. Top-level shape:

```json
{
  "source": "my-car.dbc",
  "profile": {
    "id": "my-car",
    "label": "My car (DBC)",
    "bitrate": 500000
  },
  "description": "Free-text profile description.",
  "groups": [
    { "id": "dme", "label": "Engine", "order": 100 }
  ],
  "overrides": [
    { "signal": "ENGINE_RPM", "widget": "gauge", "min": 0, "max": 7000, "redline": 6500, "group": "dme" }
  ],
  "derived": [
    {
      "id": "VEHICLE_SPEED",
      "label": "Speed",
      "unit": "km/h",
      "expr": "max(0, (VSS_RAW - 0x160) * 0.0625)"
    }
  ]
}
```

### `profile`

- `id` — stable identifier. Must be unique across all profiles
  (bundled + user-loaded). UI layouts and persisted Settings
  reference it.
- `label` — picker display name.
- `bitrate` — bus bitrate in bps. Must match what the DBC describes
  (DBC doesn't carry bitrate by convention). One of `10000`,
  `20000`, `50000`, `100000`, `125000`, `250000`, `500000`,
  `800000`, `1000000`.

### `groups`

Section headers in the dashboard. Each group has:

- `id` — referenced from `overrides[].group` and `derived[].group`.
- `label` — section heading.
- `order` — sort key (lower = shown first; default 100, derived
  default = creation index × 100).
- `description` — optional hover/tooltip text on the section header.

A signal without a `group` lands in a fallback `"Other"` group at
order 9999.

### `overrides`

One per signal you want to customise. The signal must already exist
in the DBC (`overrides` doesn't create new signals — `derived` does
that). Fields:

| Field | Type | Use |
|---|---|---|
| `signal` | string | DBC signal name to modify. |
| `label` | string | Override the human label. |
| `unit` | string | Override the unit. |
| `hidden` | bool | Drop from the dashboard. Still decoded — useful when a raw signal is only an input to derived signals. |
| `description` | string | Tooltip text (overrides `CM_ SG_` from DBC). |
| `widget` | enum | `"value"`, `"bar"`, `"gauge"`, or `"lamp"`. |
| `fractionDigits` | int | Decimal places for `ValueWidget`. |
| `group` | string | Group id this signal belongs to. |
| `min`, `max` | number | Bar/gauge bounds. |
| `redline` | number | Gauge redline threshold. |
| `alias` | string | Rename the signal id (rare — only when you need to disambiguate from an unrelated existing id). |

### `derived`

Computed signals. Each entry creates a new "virtual" signal whose
value is the result of an expression evaluated over the current
decoded primitives.

| Field | Required | Use |
|---|---|---|
| `id` | yes | Stable id (UPPER_SNAKE_CASE). |
| `label` | yes | Display label. |
| `unit` | yes | Unit suffix. |
| `expr` | yes | Expression source — see grammar below. |
| `description` | no | Tooltip text. |
| `widget`, `fractionDigits`, `group`, `min`, `max`, `lampVariant` | no | Same semantics as `overrides`. |

### Expression grammar

The expression layer is a sandboxed subset of arithmetic. Variables
are signal ids (referenced by name). No `eval`, no member access,
no function definitions — the worst a malicious expression can do
is return `NaN`.

Operators:

- Arithmetic: `+ - * / %`, parentheses, `^` (power).
- Comparison: `< > <= >= == !=`.
- Logical: `&& || !`.
- Ternary: `cond ? a : b`.

Functions:

- `abs(x)`, `min(a, b, …)`, `max(a, b, …)`.
- `floor(x)`, `ceil(x)`, `round(x)`, `trunc(x)`, `sign(x)`.
- `sqrt(x)`, `pow(a, b)`, `exp(x)`, `log(x)`.
- `sin(x)`, `cos(x)`, `tan(x)`, `atan(x)`, `atan2(y, x)`.
- `clamp(x, lo, hi)`, `inRange(x, lo, hi)`.
- `bool(x)` — coerce to boolean.

Literals:

- Numbers: `1`, `2.5`, `1e-3`.
- Hex: `0x160` (= 352).
- Booleans: `true`, `false`.
- Constants: `PI`, `E`.

Null propagation: when any referenced signal hasn't been received
yet, the expression returns `null` and the widget shows "—". This
keeps "no data" distinguishable from "0".

#### Worked examples

```jsonc
// Speed with the BMW 0x160 noise-floor offset, clamped to ≥0:
"max(0, (VSS_RAW - 0x160) * 0.0625)"

// Wheel speed from the per-wheel raw value:
"max(0, (WHEEL_SPEED_1_RAW - 44) / 15.875)"

// Boolean from a multi-bit enum:
"CRUISE_ACTIVE_STATE != 0"

// Composite warning: overheating OR oil-pressure-low:
"COOLANT_TEMP > 110 || LAMP_OIL_PRESSURE_LOW"

// Engine load proxy from torque + RPM:
"TORQUE_INDICATED * ENGINE_RPM / 1000"

// Yaw rate from wheel speed delta:
"(WHEEL_SPEED_1 - WHEEL_SPEED_2) / 2"

// Coolant alert tiered enum:
"COOLANT_TEMP > 110 ? 2 : COOLANT_TEMP > 100 ? 1 : 0"
```

## VFS manifest (`index.json`)

`HttpDirectory` reads an index file per folder to know what's
there. Format:

```json
[
  {
    "type": "file",
    "fullName": "my-car.dbc",
    "originalFullName": "my-car.dbc",
    "size": 0
  },
  {
    "type": "file",
    "fullName": "my-car.overlay.json",
    "originalFullName": "my-car.overlay.json",
    "size": 0
  }
]
```

`fullName` is the lowercased lookup key (matches the VFS's
case-insensitive `file(name)` API); `originalFullName` is what
appears on disk. `size` is informational; 0 is fine.

When users load a folder from their local filesystem via the
Settings picker (`FsaDirectory`), the index is built automatically
from the folder's entries — no `index.json` needed locally.

## Workflow

1. **Author the DBC** — start with an existing example
   (`apps/web/public/profiles/bmw-e46-ms43/bmw-e46-ms43.dbc` is a
   good template) and a DBC editor.
2. **Author the overlay** — copy the closest existing
   `.overlay.json` and edit. The JSON is plain text — no special
   tools needed.
3. **Drop a folder into `apps/web/public/profiles/<id>/`** with the
   pair + an `index.json` if you want it bundled with DASHX.
4. **Or load it via Settings** — "Load custom DBC folder…", pick
   the folder containing your `.dbc` + `.overlay.json`. The browser
   reads them in-process — your files never leave the device.
5. **Verify on the bus** — open the Frame log; the new profile's
   signal grid populates as frames arrive. Compare against the
   inline TS profile if available (Settings dropdown shows both).

## Limitations

- **DBC's linear formula is `raw × scale + offset`.** Anything
  non-linear (lookup tables, conditional decode) goes through the
  overlay's expression layer.
- **No multi-message dependencies in DBC.** A signal in one frame
  can't reference a signal in another. That's what the overlay's
  `derived` is for.
- **Expression layer is pure functions.** No state, no timers, no
  history. Rolling averages / derivatives are future work.
- **Motorola / Intel are well-supported; CAN-FD is not.** DASHX
  targets classical CAN (8-byte payload); CAN-FD's 64-byte payload
  would need parser changes.

## Cross-references

- `packages/vehicles/src/dbc/parser.ts` — DBC grammar implementation.
- `packages/vehicles/src/dbc/compiler.ts` — DBC → `SignalDecoder[]`.
- `packages/vehicles/src/overlay/loader.ts` — overlay → `VehicleProfile`.
- `packages/vehicles/src/overlay/expr.ts` — expression sandbox.
- `apps/web/public/profiles/bmw-e46-ms43/` — canonical example.
