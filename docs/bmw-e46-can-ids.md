# BMW E46 PT-CAN identifiers

Frames decoded by `@emdzej/dashx-vehicles` for the E46 chassis
(MS42/M52TU + MS43/M54 DMEs, MK60 DSC, IKE, optional EGS). PT-CAN
runs at 500 kbps, 11-bit IDs, DLC=8.

## Source

The canonical reference is the [MS4X wiki](https://www.ms4x.net/).
Each CAN ID has its own page; DASHX decoders mirror those tables
byte-for-byte. Add a citation when you add a new ID.

**DME-sent (transmitting ECU)**:
- 0x316 DME1 — MS43 + MS42 (with byte-level differences, see below)
- 0x329 DME2 — MS43 + MS42 (identical layout per wiki)
- 0x338 DME3 — MS43 only (Alpina Roadster sport button) — not decoded
- 0x545 DME4 — MS43 (full) + MS42 (B0-B3 only; B4-B7 unused)

**Pages for received frames** (DME-received, sent by another ECU):
- 0x153 [ASC1](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x153_ASC1) — DSC traction control
- 0x1F0 [ASC2](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F0_ASC2) — per-wheel speeds
- 0x1F3 [ASC3](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F3_ASC3) — accelerations + BAS
- 0x1F5 [LWS1](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F5_LWS1) — steering wheel angle sensor
- 0x1F8 [ASC4](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F8_ASC4) — brake pressure, HDC
- 0x43D [AMT1](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x43D_AMT1) — SMG transmission (not decoded yet)
- 0x43F [EGS1](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x43F_EGS1) — automatic transmission
- 0x445 TXU1 — page empty
- 0x610 [ICL1](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x610_ICL1) — VIN remote frame (not decoded — passive sniffer)
- 0x613 [ICL2](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x613_ICL2) — odometer / fuel / clock
- 0x615 [ICL3](https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x615_ICL3) — AC / ambient / lighting

> **Wiki caveat for MS42:** the [MS42 CAN Bus](https://www.ms4x.net/index.php?title=Siemens_MS42_CAN_Bus)
> page itself says "values are copied from the MS43 page, so these have
> to be verified". Treat MS42-only byte positions as tentative until
> confirmed with real captures.

## MS42 vs MS43 — byte-level differences

DME-sent frames where MS42 and MS43 put a signal in a DIFFERENT place,
or omit it entirely:

| Signal | MS43 location | MS42 location |
|---|---|---|
| `TQI_MAF_CAN` (post-charge torque) | DME1 **B7** | DME1 **B6** |
| `ERR_AMT_CAN` (AMT err 2-bit) | DME1 **B6.6-7** | DME1 **B7.0-1** |
| Oil temp `TOIL_CAN` | DME4 **B4** | not broadcast (B4 unused) |
| Upshift indicator | DME4 **B3.7** | not broadcast (B3.7 unused) |
| Oil pressure low | DME4 **B7.7** | not broadcast (B7 unused) |
| Tire pressure (MSS54) | DME4 **B7.0** | not broadcast |
| Alpina battery lamp | DME4 **B5.0** | not broadcast |
| Oil level (MSS54HP) | DME4 **B6** | not broadcast |

The DASHX `bmwE46Ms42` profile drops the MS43-only signals from the
displayed signal list, and re-defines `TQI_MAF_CAN` + `ERR_AMT_CAN`
at the MS42 byte positions. See `packages/vehicles/src/bmw-e46-ms42.ts`.

## Conventions

- Multi-byte integers are documented with explicit endianness.
- Bit positions are `B<byte>.<bit>`; bit 0 is LSB.
- Per-cent scaling is the canonical `0.390625 = 100/256` BMW factor.
- Decoders return `null` only when the frame doesn't carry the
  signal (multiplexed cases); never for "value unknown" — that's the
  cluster's job, not DASHX's.

## Frame tables

### 0x316 — DME1 (10 ms)
**Source:** DME. **Tx by:** MS42 + MS43.

| Byte | Field | Formula / notes |
|---|---|---|
| B0.0 | LV_SWI_IGK (ignition) | bit |
| B0.1 | LV_F_N_ENG (crank err) | bit |
| B0.2 | LV_ACK_TCS (ASC ack) | bit |
| B0.3 | LV_ERR_GC (gear chg permitted) | bit |
| B0.4-5 | SF_TQD (charge int) | 2-bit enum |
| B0.7 | LV_F_SUB_TQI (MAF err) | bit |
| B1 | TQI_TQR_CAN (torque req) | × 0.390625 % |
| B2-B3 LE | N_ENG (RPM) | × 0.15625 RPM |
| B4 | TQI_CAN (torque ind) | × 0.390625 % |
| B5 | TQ_LOSS_CAN (torque loss) | × 0.390625 % |
| B6 *(MS43)* | TQI_MAF_CAN.bits 0-5 + ERR_AMT.bits 6-7 | see split |
| B6 *(MS42)* | TQI_MAF_CAN | × 0.390625 % |
| B7 *(MS43)* | TQI_MAF_CAN | × 0.390625 % |
| B7 *(MS42)* | ERR_AMT_CAN at bits 0-1 | 2-bit |

### 0x329 — DME2 (10 ms)
**Source:** DME. Identical layout MS42/MS43 per wiki.

| Byte | Field | Formula |
|---|---|---|
| B0.0-5 | MUX_INFO | depends on MUX_CODE |
| B0.6-7 | MUX_CODE | 0=CAN_LEVEL, 2=OBD_STEUER, 3=MD_NORM |
| B1 | TEMP_ENG (coolant) | × 0.75 − 48 → °C |
| B2 | AMP_CAN (ambient pressure) | × 2 + 598 → hPa |
| B3.0 | LV_SWI_CLU (clutch) | bit |
| B3.1 | LV_LEVEL_IS (idle low) | bit |
| B3.2 | LV_ACK_CRU_AD_ECU (ACC1 ack) | bit |
| B3.3 | LV_ERU_CAN (running) | bit |
| B3.5-7 | STATE_MSW_CAN (cruise sw) | 3-bit |
| B4 | TPS_VIRT_CRU_CAN | × 0.390625 % |
| B5 | TPS_CAN (pedal) | × 0.390625 % |
| B6.0 | LV_BS (brake) | bit |
| B6.1 | LV_ERR_BS (brake sw err) | bit |
| B6.2 | LV_KD_CAN (kickdown) | bit |
| B6.3-5 | STATE_CRU_CAN | 3-bit |
| B6.6-7 | REQ_SHIFTLOCK | 2-bit (0=none, 3=active) |

> Wiki B3.4 is annotated `(STATE_CRU_CAN)???` — DASHX (and
> opencluster) treat B3.5-7 as the 3-bit `STATE_MSW_CAN` field and
> leave B3.4 undecoded.

### 0x545 — DME4 (10 ms)
**Source:** DME.

Shared (MS42 + MS43):

| Byte | Field |
|---|---|
| B0.1 | LV_MIL |
| B0.3 | LV_MAIN_SWI_CRU |
| B0.4 | LV_ETC_DIAG (EML) |
| B0.6 | LV_FUC_CAN (fuel cap; MS42 wiki says B0.6 unused) |
| B1-B2 LE | FCO (fuel consumption raw) |
| B3.0 | Oil consumption (MS43) / Oil Level Error LED M5 (MS42) |
| B3.1 | Oil loss (MS43) / Oil Level Warning LED (MS42) |
| B3.2 | Oil sensor fault (MS43) / Oil Level Error LED M5 (MS42 — wiki appears typo'd) |
| B3.3 | LV_TEMP_ENG (overheat) |
| B3.4-6 | M-Cluster warm-up LEDs (3-bit) |

MS43 only:

| Byte | Field | Formula |
|---|---|---|
| B3.7 | Upshift indicator | bit |
| B4 | TOIL_CAN (oil temp) | raw − 48 → °C |
| B5.0 | Alpina Roadster battery chargelight | bit |
| B6 | Oil level (MSS54HP) | (raw − 158) / 10 → L |
| B7.0 | Tire pressure (MSS54) | bit |
| B7.7 | Oil pressure low | bit |

### 0x153 — ASC1 (10-20 ms)
**Source:** ASC/DSC.

| Byte | Field | Formula |
|---|---|---|
| B0.0 | LV_ASC_REQ | bit |
| B0.1 | LV_MSR_REQ | bit |
| B0.2 | LV_ASC_PASV (status for EGS) | bit |
| B0.3 | LV_ASC_SW_INT | bit |
| B0.4 | LV_BLS (brake light) | bit |
| B0.5 | LV_BAS (Brake Assist) | bit |
| B0.6 | LV_EBV (Electronic Brake-force distribution) | bit |
| B0.7 | LV_ABS_LED (ABS warning lamp) | bit |
| B1.3-7 + B2 | VSS (vehicle speed) | 13-bit, `((MSB*256) + LSB - 0x160) * 0.0625` km/h |
| B3 | MD_IND_ASC (ASC tq reduction) | × 0.390625 % |
| B4 | MD_IND_MSR (MSR tq increase) | × 0.390625 % |
| B6 | MD_IND_ASC_LM | × 0.390625 % |
| B7.0-3 | Alive counter | 4-bit (0-15) |

> **Speed-offset detail:** wiki states `formula = ((MSB*256) + LSB) * 0.0625`
> AND `Min: 0x160 (0 Km/h)`. The two are inconsistent unless 0x160 is
> subtracted before scaling — DASHX applies the offset and clamps to ≥0
> so stationary cars read 0 km/h. The `opencluster` C transcription
> doesn't subtract; that's a transcription bug it inherited from the
> wiki's incomplete formula.

### 0x1F0 — ASC2 (10-20 ms) — per-wheel speeds
**Source:** DSC.

| Byte | Field | Formula |
|---|---|---|
| B0-B1 LE | Wheel 1 (commonly FL) | `(raw - 44) / 15.875` km/h |
| B2-B3 LE | Wheel 2 (commonly FR) | same |
| B4-B5 LE | Wheel 3 (commonly RL) | same |
| B6-B7 LE | Wheel 4 (commonly RR) | same |

Min raw `0x002C` (=44) → 0 km/h; clamped to ≥0 by DASHX.

### 0x1F3 — ASC3 (20 ms) — accelerations + BAS
**Source:** DSC.

| Byte | Field | Formula |
|---|---|---|
| B0.0 | FDR_COM | bit |
| B0.1-7 + B1 | FDR_MUL | 15-bit |
| B2.0 | BAS_DEF | bit |
| B2.1 | Q_ACC_BAS | bit |
| B2.2-3 | BAS_FBR | 2-bit |
| B2.4-7 | BAS_STAT | 4-bit |
| B3 + B4.0-1 | AX_REF (longitudinal acceleration) | 10-bit signed raw |
| B4.2 | DSC_REG | bit |
| B4.3 | S_HBA (steering helper) | bit |
| B4.4-5 | BAS_CODE | 2-bit |
| B4.6-7 + B5 | AY_REF (lateral acceleration) | 10-bit signed raw |
| B6 | BAS_DATEN | raw |

> Wiki doesn't give scale formulas for AX/AY; DASHX surfaces them
> as signed 10-bit raw.

### 0x1F5 — LWS1 (10 ms) — steering wheel sensor
**Source:** Steering angle sensor (part of DSC).

| Byte | Field | Formula |
|---|---|---|
| B0-B1 BE | ANG_PSTE (steering angle) | signed × 0.04394° |
| B2-B3 BE | VEL_ANG_PSTE (angular velocity) | signed × 0.04394 °/s |
| B4 | PSTE_ID (zero-set ID) | raw |
| B5.0-3 | PSTE_STATUS (internal status) | 4-bit |
| B5.4-7 | PSTE_CNT (telegram counter) | 4-bit |
| B6-B7 LE | PSTE_MPX (multiplex info) | raw 16-bit |

> Wiki claims max raw `0x7FFF` = +1439.99° — the formula × 0.04394
> actually gives 1439.78°. The wiki rounded the scale to 5 sig figs;
> the true scale is ≈ 0.04395. DASHX uses the wiki scale verbatim.

### 0x1F8 — ASC4 (20 ms) — brake pressure + HDC
**Source:** DSC.

| Byte | Field | Formula |
|---|---|---|
| B0 | S_WHEEL_ACC (wheel acceleration sum) | raw |
| B1.0-2 | S_HDC (Hill Descent Control state) | 3-bit enum (0=off, 6=active, etc.) |
| B1.3 | L_HDC (HDC enabled) | bit |
| B1.5 | B_TW_MSR (trailer MSR) | bit |
| B1.6 | B_TW_ASC (trailer ASC) | bit |
| B1.7 | B_Offroad | bit |
| B2 | P_BRAKE | × 1 bar (0-255) |
| B3 | RDR (per-wheel) | 4 × 2-bit |
| B4-B5 LE | TW_IND_ASR | raw 16-bit |
| B6-B7 LE | TW_IND_MSR | raw 16-bit |

### 0x43F — EGS1 (10 ms) — automatic transmission
**Source:** TCU (or MSS54 for E46 M3 SMG2 — different layout, not
yet decoded by DASHX).

| Byte | Field | Formula |
|---|---|---|
| B0.0-2 | GEAR_INFO (active gear) | 3-bit (0=N, 1-6=gears, 7=R) |
| B0.3 | LV_GS (shifting) | bit |
| B0.4 | OBD_F (OBD DTC active) | bit |
| B0.5 | LV_GP_CAN (gearbox protection) | bit |
| B0.6-7 | STATE_CC (converter clutch) | 2-bit (0=open, 1=reg, 2=closed) |
| B1.0-3 | GEAR_SEL_DISP (lever position) | 4-bit (5=D, 6=N, 7=R, 8=P, etc.) |
| B1.4-7 | STATE_ETCU_OBD (TCU OBD state) | 4-bit |
| B2.0-1 | SMG_WHL_ANZ | 2-bit |
| B2.5-7 | PRG_INF_ANZ (mode display) | 3-bit (0=E, 1=M, 2=S, 4=A) |
| B3 | TQI_ETCU_CAN (TCU torque request) | × 0.390625 % (0xFF=no reduction) |
| B4 | N_ABTR (output shaft speed) | raw |
| B7 | TQ_CONV_CAN (converter torque) | raw |

### 0x613 — ICL2 (200 ms) — odometer + fuel + clock
**Source:** IKE.

| Byte | Field | Formula |
|---|---|---|
| B0-B1 LE | KM_CTR_CAN (odometer) | × 10 → km |
| B2.0-6 | FTL_CAN (fuel level) | 7-bit raw |
| B2.7 | FTL_RES_CAN (reserve) | bit |
| B3-B4 LE | T_REL_CAN (running clock) | uint16 → minutes |
| B5.0-5 | FTL_CAN_L (driver-side fuel) | 6-bit raw |

### 0x615 — ICL3 (200 ms) — AC / ambient / lighting
**Source:** IKE.

| Byte | Field | Formula |
|---|---|---|
| B0.0-4 | TQ_ACCIN_CAN (AC torque offset) | 5-bit Nm |
| B0.5 | LV_REQ_TCO_L (cool ↓) | bit |
| B0.6 | LV_ACCIN (compressor) | bit |
| B0.7 | LV_ACIN (request) | bit |
| B1.0 | LV_REQ_HEAT (heat ↑) | bit |
| B1.1 | LV_TOW (trailer) | bit |
| B1.2 | LV_LGT (night) | bit (1 = night) |
| B1.3 | LV_HS (hood) | bit |
| B1.4-7 | N_ECF (cooling fan) | 4-bit (0-15) |
| B2.6 | Request raised idle | bit |
| B3 | TAM_CAN (ambient temp) | raw (cluster maps to °C) |
| B4.0 | LV_DOOR | bit |
| B4.1 | LV_HBR (handbrake) | bit |
| B4.2-3 | LV_SUSP | 2-bit |
| B5.6-7 + B6 | VSS_DIS (displayed speed) | 10-bit raw — no formula |

> Wiki duplicates the AC bits (`LV_REQ_TCO_L`, `LV_ACCIN`, `LV_ACIN`)
> at B0.5-7 AND B4.5-7. DASHX decodes the B0 copy.

## What's NOT decoded (intentional)

| Frame / Signal | Reason |
|---|---|
| 0x338 DME3 | MS43 only; Alpina Roadster sport button — niche |
| 0x43D AMT1 | SMG transmission — useful once we have a real SMG capture |
| 0x445 TXU1 | Wiki page empty |
| 0x610 ICL1 | Remote frame (VIN request); DASHX is a passive sniffer |
| Battery voltage | Not broadcast on PT-CAN by any of the documented DMEs; available via DS2 diagnostics only |

## Adding a new ID

1. Find or create the MS4X wiki page for the CAN ID.
2. Add a row to this file with a link to the wiki page.
3. Add the decoder to `bmw-e46-shared.ts` (shared) or the chassis-
   specific file. Use the `bytes.ts` helpers — never inline bit math.
4. Add a fixture-driven test in `bmw-e46-shared.test.ts` whose
   expected value derives from the wiki formula in a comment above
   the assertion.
5. Push the decoder onto the relevant `VehicleProfile.signals` array
   and add a widget in `Dashboard.svelte`.
