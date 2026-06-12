/**
 * OBD-II Mode 01 PID library — formulas straight from SAE J1979 /
 * ISO 15031-5. Each entry binds a PID number to a `decode(data)`
 * function that turns the response bytes A/B/C/D into a single
 * scalar value with documented units.
 *
 * Coverage focuses on PIDs that:
 *
 *   1. Aren't in the BMW MS4X broadcast frame set (so they're
 *      genuinely new info — fuel trims, lambda voltages, battery
 *      voltage).
 *   2. Are widely supported across vehicles, so adding non-BMW
 *      profiles later doesn't need new PIDs.
 *
 * Each PID exposes a `unit` and `label` so the UI can render
 * widgets without per-PID code, and a `description` for the
 * tooltip layer.
 *
 * Wikipedia / OBD-II PID list:
 *   https://en.wikipedia.org/wiki/OBD-II_PIDs
 */

/** One value extracted from a Mode 01 response. */
export interface Obd2PidValue {
  /** Decoded numeric value in the documented unit. */
  value: number;
  /** Display unit ("°C", "%", "V", "g/s", …). */
  unit: string;
}

/** Metadata + decoder for one Mode 01 PID. */
export interface Obd2Pid {
  /** PID number (0x00-0xFF, the byte after service id in the request). */
  pid: number;
  /** Stable identifier in UPPER_SNAKE_CASE — used as a state key
   *  ("OBD2_FUEL_TRIM_STFT_B1", "OBD2_O2_B1S1_VOLTAGE", …). */
  id: string;
  /** Short display label for widgets. */
  label: string;
  /** SI-ish unit suffix. */
  unit: string;
  /** Human-readable description for tooltips. */
  description: string;
  /** Number of data bytes the response carries (1-4). */
  bytes: 1 | 2 | 3 | 4;
  /** Pure decoder: data → value. */
  decode: (data: Uint8Array) => number;
}

const u8 = (d: Uint8Array, i: number) => (i < d.length ? d[i]! : 0);

/* ── Mode 01 PIDs ────────────────────────────────────────────────
 * Ordered roughly by PID number. The "BMW availability" note in
 * the description reflects what MS43 commonly responds to; MS42
 * coverage varies (K-line only on most early E46s, so DASHX can't
 * reach it via CAN at all for MS42 cars).
 * ────────────────────────────────────────────────────────────── */

/** 0x05 — Engine coolant temperature (A − 40 °C). */
export const PID_COOLANT_TEMP: Obd2Pid = {
  pid: 0x05,
  id: "OBD2_COOLANT_TEMP",
  label: "Coolant (OBD)",
  unit: "°C",
  description: "OBD-II coolant temperature (PID 0x05). A − 40 °C. Range −40 to +215. Duplicates 0x329 B1 but available via diagnostic poll.",
  bytes: 1,
  decode: (d) => u8(d, 0) - 40,
};

/** 0x06 — Short-term fuel trim, Bank 1. `(A − 128) × 100 / 128 %`.
 *  Negative = lean correction (DME removing fuel), positive = rich
 *  correction (DME adding fuel). ±10% is healthy at idle. */
export const PID_STFT_B1: Obd2Pid = {
  pid: 0x06,
  id: "OBD2_STFT_B1",
  label: "STFT B1",
  unit: "%",
  description: "Short-Term Fuel Trim, Bank 1 (PID 0x06). (A − 128) × 100/128 %. Live closed-loop adjustment — negative = lean, positive = rich. ±10% healthy.",
  bytes: 1,
  decode: (d) => ((u8(d, 0) - 128) * 100) / 128,
};

/** 0x07 — Long-term fuel trim, Bank 1. Same formula as STFT. */
export const PID_LTFT_B1: Obd2Pid = {
  pid: 0x07,
  id: "OBD2_LTFT_B1",
  label: "LTFT B1",
  unit: "%",
  description: "Long-Term Fuel Trim, Bank 1 (PID 0x07). (A − 128) × 100/128 %. Integrated learning offset — large absolute values indicate persistent mixture issue (vacuum leak, MAF drift).",
  bytes: 1,
  decode: (d) => ((u8(d, 0) - 128) * 100) / 128,
};

/** 0x08 — Short-term fuel trim, Bank 2 (V8/V12; reads 0 on inline-6). */
export const PID_STFT_B2: Obd2Pid = {
  pid: 0x08,
  id: "OBD2_STFT_B2",
  label: "STFT B2",
  unit: "%",
  description: "Short-Term Fuel Trim, Bank 2 (PID 0x08). Same formula as B1; only meaningful on V-engines. M52TU/M54 are inline-6 — reports 0 or 'not supported'.",
  bytes: 1,
  decode: (d) => ((u8(d, 0) - 128) * 100) / 128,
};

/** 0x09 — Long-term fuel trim, Bank 2. */
export const PID_LTFT_B2: Obd2Pid = {
  pid: 0x09,
  id: "OBD2_LTFT_B2",
  label: "LTFT B2",
  unit: "%",
  description: "Long-Term Fuel Trim, Bank 2 (PID 0x09). Inline-6 BMWs report 0 here.",
  bytes: 1,
  decode: (d) => ((u8(d, 0) - 128) * 100) / 128,
};

/** 0x0B — Intake manifold absolute pressure (A kPa, 0-255). */
export const PID_INTAKE_PRESSURE: Obd2Pid = {
  pid: 0x0B,
  id: "OBD2_INTAKE_PRESSURE",
  label: "MAP",
  unit: "kPa",
  description: "Intake Manifold Absolute Pressure (PID 0x0B). A kPa. Atmospheric ≈ 100 kPa, idle ≈ 30, WOT ≈ atmospheric.",
  bytes: 1,
  decode: (d) => u8(d, 0),
};

/** 0x0C — Engine RPM. `((A × 256) + B) / 4` RPM. */
export const PID_RPM: Obd2Pid = {
  pid: 0x0C,
  id: "OBD2_RPM",
  label: "RPM (OBD)",
  unit: "RPM",
  description: "Engine RPM (PID 0x0C). ((A × 256) + B) / 4. Duplicates broadcast 0x316 — useful as a sanity check between broadcast and OBD-II.",
  bytes: 2,
  decode: (d) => (u8(d, 0) * 256 + u8(d, 1)) / 4,
};

/** 0x0D — Vehicle speed (A km/h). */
export const PID_SPEED: Obd2Pid = {
  pid: 0x0D,
  id: "OBD2_SPEED",
  label: "Speed (OBD)",
  unit: "km/h",
  description: "Vehicle speed (PID 0x0D). A km/h. Duplicates broadcast 0x153.",
  bytes: 1,
  decode: (d) => u8(d, 0),
};

/** 0x0E — Timing advance. `A / 2 − 64 °` (relative to #1 cylinder TDC). */
export const PID_TIMING_ADVANCE: Obd2Pid = {
  pid: 0x0E,
  id: "OBD2_TIMING_ADVANCE",
  label: "Timing",
  unit: "°",
  description: "Ignition timing advance for #1 cylinder (PID 0x0E). A/2 − 64 ° relative to TDC. Negative = retarded.",
  bytes: 1,
  decode: (d) => u8(d, 0) / 2 - 64,
};

/** 0x0F — Intake air temperature (A − 40 °C). */
export const PID_INTAKE_TEMP: Obd2Pid = {
  pid: 0x0F,
  id: "OBD2_INTAKE_TEMP",
  label: "IAT",
  unit: "°C",
  description: "Intake Air Temperature (PID 0x0F). A − 40. Reads ambient when off; rises during hot-soak / boost.",
  bytes: 1,
  decode: (d) => u8(d, 0) - 40,
};

/** 0x10 — Mass air flow. `((A × 256) + B) / 100` g/s. */
export const PID_MAF: Obd2Pid = {
  pid: 0x10,
  id: "OBD2_MAF",
  label: "MAF",
  unit: "g/s",
  description: "Mass Air Flow rate (PID 0x10). ((A × 256) + B) / 100 g/s. Idle ≈ 2-4, cruise ≈ 6-12, WOT ≈ 60-100.",
  bytes: 2,
  decode: (d) => (u8(d, 0) * 256 + u8(d, 1)) / 100,
};

/** 0x11 — Throttle position. `A × 100 / 255 %`. */
export const PID_THROTTLE: Obd2Pid = {
  pid: 0x11,
  id: "OBD2_THROTTLE",
  label: "Throttle",
  unit: "%",
  description: "Absolute throttle position (PID 0x11). A × 100/255 %. Distinct from pedal: throttle is the DME's commanded plate angle.",
  bytes: 1,
  decode: (d) => (u8(d, 0) * 100) / 255,
};

/* O2 sensor narrowband: byte A = voltage × 0.005, byte B = STFT
 * applied while reading this sensor (0xFF = not used). PIDs 0x14-0x1B
 * cover up to 8 sensors. On E46 M52TU/M54 only B1S1 + B1S2 are
 * meaningful (pre- and post-cat on the single bank). */

function makeO2Voltage(pid: number, sensor: string): Obd2Pid {
  return {
    pid,
    id: `OBD2_O2_${sensor}_VOLTAGE`,
    label: `O2 ${sensor} V`,
    unit: "V",
    description: `Narrowband O2 sensor ${sensor} voltage (PID 0x${pid.toString(16).toUpperCase()}). A × 0.005 V. 0.1-0.9 V swing on a healthy sensor; post-cat (S2) holds steady ~0.65 V.`,
    bytes: 2,
    decode: (d) => u8(d, 0) * 0.005,
  };
}

/** 0x14 — O2 sensor Bank 1, Sensor 1 (pre-cat). */
export const PID_O2_B1S1_VOLTAGE = makeO2Voltage(0x14, "B1S1");
/** 0x15 — O2 sensor Bank 1, Sensor 2 (post-cat). */
export const PID_O2_B1S2_VOLTAGE = makeO2Voltage(0x15, "B1S2");
/** 0x16 — O2 sensor Bank 1, Sensor 3 (rare). */
export const PID_O2_B1S3_VOLTAGE = makeO2Voltage(0x16, "B1S3");
/** 0x17 — O2 sensor Bank 1, Sensor 4 (rare). */
export const PID_O2_B1S4_VOLTAGE = makeO2Voltage(0x17, "B1S4");
/** 0x18 — O2 sensor Bank 2, Sensor 1 (V-engines only). */
export const PID_O2_B2S1_VOLTAGE = makeO2Voltage(0x18, "B2S1");
/** 0x19 — O2 sensor Bank 2, Sensor 2 (V-engines only). */
export const PID_O2_B2S2_VOLTAGE = makeO2Voltage(0x19, "B2S2");

/** 0x2F — Fuel level input. `A × 100 / 255 %`. */
export const PID_FUEL_LEVEL: Obd2Pid = {
  pid: 0x2F,
  id: "OBD2_FUEL_LEVEL",
  label: "Fuel (OBD)",
  unit: "%",
  description: "Fuel tank level (PID 0x2F). A × 100/255 %. Smoother than broadcast 0x613 FTL_CAN, but only on cars that report this PID.",
  bytes: 1,
  decode: (d) => (u8(d, 0) * 100) / 255,
};

/** 0x33 — Barometric pressure (A kPa). */
export const PID_BAROMETRIC: Obd2Pid = {
  pid: 0x33,
  id: "OBD2_BAROMETRIC",
  label: "Baro",
  unit: "kPa",
  description: "Absolute barometric pressure (PID 0x33). A kPa. Drives altitude compensation; near 100 kPa at sea level.",
  bytes: 1,
  decode: (d) => u8(d, 0),
};

/** 0x42 — Control module voltage. `((A × 256) + B) / 1000` V. */
export const PID_BATTERY_VOLTAGE: Obd2Pid = {
  pid: 0x42,
  id: "OBD2_BATTERY_VOLTAGE",
  label: "Battery",
  unit: "V",
  description: "Control module supply voltage (PID 0x42). ((A × 256) + B) / 1000 V. 14.0-14.5 running, 12.4-12.8 off. The ONE way to read battery voltage on E46 — NOT broadcast on PT-CAN.",
  bytes: 2,
  decode: (d) => (u8(d, 0) * 256 + u8(d, 1)) / 1000,
};

/** 0x43 — Absolute load value. `((A × 256) + B) × 100 / 255 %`. */
export const PID_ABS_LOAD: Obd2Pid = {
  pid: 0x43,
  id: "OBD2_ABS_LOAD",
  label: "Abs load",
  unit: "%",
  description: "Absolute load value (PID 0x43). ((A × 256) + B) × 100/255 %. 0-95% naturally aspirated, 0-400% boosted.",
  bytes: 2,
  decode: (d) => ((u8(d, 0) * 256 + u8(d, 1)) * 100) / 255,
};

/** 0x44 — Commanded equivalence ratio (lambda).
 *  `((A × 256) + B) × 0.0000305`. 1.0 = stoichiometric. */
export const PID_LAMBDA_COMMANDED: Obd2Pid = {
  pid: 0x44,
  id: "OBD2_LAMBDA",
  label: "Lambda",
  unit: "λ",
  description: "Commanded equivalence ratio λ (PID 0x44). ((A × 256) + B) × 0.0000305. 1.0 = stoich, <1 = rich, >1 = lean. Closed-loop should hover ~1.00.",
  bytes: 2,
  decode: (d) => (u8(d, 0) * 256 + u8(d, 1)) * 0.0000305,
};

/** 0x45 — Relative throttle position. `A × 100 / 255 %`. */
export const PID_REL_THROTTLE: Obd2Pid = {
  pid: 0x45,
  id: "OBD2_REL_THROTTLE",
  label: "Rel throttle",
  unit: "%",
  description: "Relative throttle position (PID 0x45). A × 100/255 %. Throttle plate angle minus learned closed-throttle position.",
  bytes: 1,
  decode: (d) => (u8(d, 0) * 100) / 255,
};

/** 0x46 — Ambient air temperature (A − 40 °C). */
export const PID_AMBIENT_TEMP: Obd2Pid = {
  pid: 0x46,
  id: "OBD2_AMBIENT_TEMP",
  label: "Ambient",
  unit: "°C",
  description: "Ambient air temperature (PID 0x46). A − 40. Engineered for cluster display — calibrated, unlike the raw 0x615 TAM_CAN.",
  bytes: 1,
  decode: (d) => u8(d, 0) - 40,
};

/** 0x5C — Engine oil temperature (A − 40 °C). */
export const PID_OIL_TEMP_OBD2: Obd2Pid = {
  pid: 0x5C,
  id: "OBD2_OIL_TEMP",
  label: "Oil (OBD)",
  unit: "°C",
  description: "Engine oil temperature (PID 0x5C). A − 40. Often higher resolution than broadcast 0x545 B4.",
  bytes: 1,
  decode: (d) => u8(d, 0) - 40,
};

/* ── Catalog ────────────────────────────────────────────────────
 * Index of every PID we know about. The DASHX poller picks from
 * this list; the UI surfaces it as the "which PIDs to poll" picker.
 * ────────────────────────────────────────────────────────────── */

export const PID_CATALOG: readonly Obd2Pid[] = [
  PID_COOLANT_TEMP,
  PID_STFT_B1,
  PID_LTFT_B1,
  PID_STFT_B2,
  PID_LTFT_B2,
  PID_INTAKE_PRESSURE,
  PID_RPM,
  PID_SPEED,
  PID_TIMING_ADVANCE,
  PID_INTAKE_TEMP,
  PID_MAF,
  PID_THROTTLE,
  PID_O2_B1S1_VOLTAGE,
  PID_O2_B1S2_VOLTAGE,
  PID_O2_B1S3_VOLTAGE,
  PID_O2_B1S4_VOLTAGE,
  PID_O2_B2S1_VOLTAGE,
  PID_O2_B2S2_VOLTAGE,
  PID_FUEL_LEVEL,
  PID_BAROMETRIC,
  PID_BATTERY_VOLTAGE,
  PID_ABS_LOAD,
  PID_LAMBDA_COMMANDED,
  PID_REL_THROTTLE,
  PID_AMBIENT_TEMP,
  PID_OIL_TEMP_OBD2,
];

/** Lookup by PID number. */
export function findPid(pid: number): Obd2Pid | undefined {
  return PID_CATALOG.find((p) => p.pid === pid);
}

/** Lookup by stable id (`"OBD2_BATTERY_VOLTAGE"` etc.). */
export function findPidById(id: string): Obd2Pid | undefined {
  return PID_CATALOG.find((p) => p.id === id);
}

/** Recommended default poll set for BMW E46 with MS43. Focuses on
 *  signals not on the broadcast bus (fuel trims, lambda voltages,
 *  battery voltage) — the things the user asked about. */
export const DEFAULT_BMW_E46_PIDS: readonly string[] = [
  "OBD2_BATTERY_VOLTAGE",
  "OBD2_STFT_B1",
  "OBD2_LTFT_B1",
  "OBD2_O2_B1S1_VOLTAGE",
  "OBD2_O2_B1S2_VOLTAGE",
  "OBD2_LAMBDA",
  "OBD2_MAF",
  "OBD2_TIMING_ADVANCE",
  "OBD2_INTAKE_TEMP",
];
