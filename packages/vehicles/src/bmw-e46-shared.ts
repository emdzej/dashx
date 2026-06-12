/**
 * BMW E46 PT-CAN decoders — ported byte-by-byte from the canonical
 * MS4X wiki pages. Each frame ID has its own wiki page (linked
 * below). The MS42 + MS43 page tops list which IDs each DME sends
 * vs receives.
 *
 * Pages mirrored to docs/bmw-e46-can-ids.md citations:
 *   • https://www.ms4x.net/index.php?title=Siemens_MS43_CAN_Bus    (DME-sent)
 *   • https://www.ms4x.net/index.php?title=Siemens_MS42_CAN_Bus    (DME-sent)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x153_ASC1   (ASC1)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F0_ASC2   (ASC2 wheel speeds)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F3_ASC3   (ASC3 accel)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F5_LWS1   (steering angle)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x1F8_ASC4   (brake pressure, HDC)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x43F_EGS1   (auto transmission)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x43D_AMT1   (SMG transmission — not decoded yet)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x613_ICL2   (cluster: odo/fuel/clock)
 *   • https://www.ms4x.net/index.php?title=CAN_Bus_ID_0x615_ICL3   (cluster: AC/ambient/lighting)
 *
 * Bus: 500 kbps classical CAN, 11-bit IDs, DLC=8.
 *
 * Per-DME splits (in `bmw-e46-ms{42,43}.ts`):
 *   • DME1 0x316 `TQI_MAF_CAN` — B7 on MS43, **B6** on MS42.
 *   • DME1 0x316 `ERR_AMT_CAN` — B6.6-7 on MS43, **B7.0-1** on MS42.
 *   • DME4 0x545 oil temp, upshift, oil pressure low, tire pressure,
 *     Alpina battery lamp, MSS54 oil level — **MS43 only** (MS42 has
 *     B4-B7 unused; the MS4X MS42 page even flags itself "values
 *     copied from MS43, to be verified").
 *
 * Canonical scaling factor `0.390625 = 100/256` is used for every
 * "percent of a max value" (torques, throttle, pedal).
 *
 * Naming: `SignalDecoder.id` is UPPER_SNAKE_CASE. These ids are
 * public — UI layouts and persisted config reference them.
 */

import {
  beI16,
  bit,
  leU16,
  scaled,
  u8,
  type SignalDecoder,
} from "@emdzej/dashx-can-decoder";

/* ─────────────────────────────────────────────────────────────────
 * 0x316 — DME1 (10 ms): engine status + RPM + torque
 * Shared bytes only — TQI_MAF_CAN and ERR_AMT_CAN move between B6/B7
 * depending on MS42 vs MS43, so they live in per-DME files.
 * ───────────────────────────────────────────────────────────────── */

/** Engine RPM (N_ENG). B2-B3 LE, raw × 0.15625 → RPM.
 *  At idle ~700 RPM the raw word is ~4480 = 0x1180. */
export const engineRpm: SignalDecoder = {
  id: "ENGINE_RPM",
  label: "RPM",
  unit: "RPM",
  canId: 0x316,
  rateHz: 100,
  decode: (f) => scaled(leU16(f.data, 2), 0.15625),
};

/** Indexed torque request (TQI_TQR_CAN, includes ASR/MSR/ETCU/AMT
 *  interventions). B1 × 0.390625 %. */
export const torqueRequested: SignalDecoder = {
  id: "TORQUE_REQUESTED",
  label: "Torque req",
  unit: "%",
  canId: 0x316,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 1), 0.390625),
};

/** Indicated torque (TQI_CAN — PVS/N/AMP/TIA/TCO/IGA/PUC based).
 *  B4 × 0.390625 %. */
export const torqueIndicated: SignalDecoder = {
  id: "TORQUE_INDICATED",
  label: "Torque ind",
  unit: "%",
  canId: 0x316,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 4), 0.390625),
};

/** Friction/AC/alternator loss torque (TQ_LOSS_CAN).
 *  B5 × 0.390625 %. */
export const torqueLoss: SignalDecoder = {
  id: "TORQUE_LOSS",
  label: "Torque loss",
  unit: "%",
  canId: 0x316,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 5), 0.390625),
};

/** Terminal 15 / ignition on (LV_SWI_IGK). B0.0. */
export const ignitionOn: SignalDecoder<boolean> = {
  id: "IGNITION_ON",
  label: "Ignition",
  unit: "",
  canId: 0x316,
  decode: (f) => bit(f.data, 0, 0) === 1,
};

/** Crankshaft sensor error (LV_F_N_ENG). B0.1. */
export const crankshaftError: SignalDecoder<boolean> = {
  id: "CRANK_ERROR",
  label: "Crank err",
  unit: "",
  canId: 0x316,
  decode: (f) => bit(f.data, 0, 1) === 1,
};

/** ASC1 received OK (LV_ACK_TCS). B0.2. */
export const ascAck: SignalDecoder<boolean> = {
  id: "ASC_ACK",
  label: "ASC ack",
  unit: "",
  canId: 0x316,
  decode: (f) => bit(f.data, 0, 2) === 1,
};

/** Gear change permitted (LV_ERR_GC). B0.3.
 *  0 = gear change NOT or partly possible (the wiki name is a
 *  double-negative; the bit reads 1 when change IS possible). */
export const gearChangeOk: SignalDecoder<boolean> = {
  id: "GEAR_CHANGE_OK",
  label: "Gear chg",
  unit: "",
  canId: 0x316,
  decode: (f) => bit(f.data, 0, 3) === 1,
};

/** MAF sensor error (LV_F_SUB_TQI). B0.7. */
export const mafError: SignalDecoder<boolean> = {
  id: "MAF_ERROR",
  label: "MAF err",
  unit: "",
  canId: 0x316,
  decode: (f) => bit(f.data, 0, 7) === 1,
};

/** Charge intervention state (SF_TQD, 2-bit). B0.4-5.
 *   0=intervention OK / no ASC need, 1=IGA retard limit hit,
 *   2=charge actuators fully closed (no break-away MTC),
 *   3=limited vehicle dynamics (MTC/ISA error). */
export const chargeInterventionState: SignalDecoder = {
  id: "CHARGE_INTERVENTION_STATE",
  label: "Chg int",
  unit: "",
  canId: 0x316,
  decode: (f) => (u8(f.data, 0) >> 4) & 0x03,
};

/* ─────────────────────────────────────────────────────────────────
 * 0x329 — DME2 (10 ms): coolant + pedal + cruise + brake + clutch
 * ───────────────────────────────────────────────────────────────── */

/** Multiplex code (MUX_CODE) selecting which info is in B0.0-5.
 *  B0.6-7. Values:
 *    0 = CAN_LEVEL (always 0x11 on MS43)
 *    2 = OBD_STEUER (STATE_DIAG_GS, GS diagnosis feedback)
 *    3 = MD_NORM (refactored C_TQ_STND, 16 Nm resolution). */
export const muxCode: SignalDecoder = {
  id: "MUX_CODE",
  label: "Mux code",
  unit: "",
  canId: 0x329,
  decode: (f) => (u8(f.data, 0) >> 6) & 0x03,
};

/** Multiplex info (MUX_INFO). B0.0-5 (6-bit) — interpretation
 *  depends on `MUX_CODE`. Surface raw; consumers join with MUX_CODE
 *  to read the actual signal. */
export const muxInfo: SignalDecoder = {
  id: "MUX_INFO",
  label: "Mux info",
  unit: "",
  canId: 0x329,
  decode: (f) => u8(f.data, 0) & 0x3F,
};

/** Coolant temperature (TEMP_ENG). B1 × 0.75 − 48 → °C.
 *  Range: 0x01→−47.25, 0xFF→142.5 °C. Init/no-data = 0xFF. */
export const coolantTemp: SignalDecoder = {
  id: "COOLANT_TEMP",
  label: "Coolant",
  unit: "°C",
  canId: 0x329,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 1), 0.75, -48),
};

/** Ambient pressure (AMP_CAN). B2 × 2 + 598 → hPa.
 *  Range: 0x01→600 hPa, 0xFE→1106 hPa. 0xFF = error. */
export const ambientPressure: SignalDecoder = {
  id: "AMBIENT_PRESSURE",
  label: "Pressure",
  unit: "hPa",
  canId: 0x329,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 2), 2, 598),
};

/** Accelerator pedal position (TPS_CAN). B5 × 0.390625 % of PVS_MAX.
 *  Range: 0x01→0%, 0xFE→99.2%. 0xFF = PVS error. */
export const pedalPosition: SignalDecoder = {
  id: "PEDAL_POSITION",
  label: "Pedal",
  unit: "%",
  canId: 0x329,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 5), 0.390625),
};

/** Virtual cruise TPS (TPS_VIRT_CRU_CAN). B4 × 0.390625 %. */
export const tpsVirtual: SignalDecoder = {
  id: "TPS_VIRTUAL",
  label: "TPS virt",
  unit: "%",
  canId: 0x329,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 4), 0.390625),
};

/** Clutch depressed (LV_SWI_CLU). B3.0. */
export const clutchDepressed: SignalDecoder<boolean> = {
  id: "CLUTCH_DEPRESSED",
  label: "Clutch",
  unit: "",
  canId: 0x329,
  decode: (f) => bit(f.data, 3, 0) === 1,
};

/** Idle below threshold (LV_LEVEL_IS). B3.1. */
export const idleBelowThreshold: SignalDecoder<boolean> = {
  id: "IDLE_BELOW_THRESH",
  label: "Idle low",
  unit: "",
  canId: 0x329,
  decode: (f) => bit(f.data, 3, 1) === 1,
};

/** ACC1 acknowledgement (LV_ACK_CRU_AD_ECU). B3.2. */
export const acc1Ack: SignalDecoder<boolean> = {
  id: "ACC1_ACK",
  label: "ACC ack",
  unit: "",
  canId: 0x329,
  decode: (f) => bit(f.data, 3, 2) === 1,
};

/** Engine running (LV_ERU_CAN). B3.3. */
export const engineRunning: SignalDecoder<boolean> = {
  id: "ENGINE_RUNNING",
  label: "Running",
  unit: "",
  canId: 0x329,
  decode: (f) => bit(f.data, 3, 3) === 1,
};

/** Cruise switch state (STATE_MSW_CAN, 3-bit). B3.5-7.
 *   0=none(init), 1=set/accel, 2=decel, 3=resume, 4=I/O, 7=error.
 *  (The wiki shows B3.4 as `(STATE_CRU_CAN)???` — annotated as
 *   unclear; opencluster's transcription treats B3.5-7 as the
 *   3-bit switch field and ignores B3.4.) */
export const cruiseSwitchState: SignalDecoder = {
  id: "CRUISE_SWITCH_STATE",
  label: "Cru sw",
  unit: "",
  canId: 0x329,
  decode: (f) => (u8(f.data, 3) >> 5) & 0x07,
};

/** Brake pedal actuated (LV_BS). B6.0. */
export const brakeActuated: SignalDecoder<boolean> = {
  id: "BRAKE_ACTUATED",
  label: "Brake",
  unit: "",
  canId: 0x329,
  decode: (f) => bit(f.data, 6, 0) === 1,
};

/** Brake switch faulty (LV_ERR_BS). B6.1. */
export const brakeSwitchFaulty: SignalDecoder<boolean> = {
  id: "BRAKE_SWITCH_FAULT",
  label: "Brake sw err",
  unit: "",
  canId: 0x329,
  decode: (f) => bit(f.data, 6, 1) === 1,
};

/** Kickdown active (LV_KD_CAN). B6.2. */
export const kickdownActive: SignalDecoder<boolean> = {
  id: "KICKDOWN",
  label: "Kickdown",
  unit: "",
  canId: 0x329,
  decode: (f) => bit(f.data, 6, 2) === 1,
};

/** Cruise active state (STATE_CRU_CAN, 3-bit). B6.3-5.
 *   0=inactive, 1=constant drive (or tip), 3=resume,
 *   5=set/accel, 7=decel. */
export const cruiseActiveState: SignalDecoder = {
  id: "CRUISE_ACTIVE_STATE",
  label: "Cru state",
  unit: "",
  canId: 0x329,
  decode: (f) => (u8(f.data, 6) >> 3) & 0x07,
};

/** Convenience: cruise active = state ≠ 0. */
export const cruiseActive: SignalDecoder<boolean> = {
  id: "CRUISE_ACTIVE",
  label: "Cruise on",
  unit: "",
  canId: 0x329,
  decode: (f) => ((u8(f.data, 6) >> 3) & 0x07) !== 0,
};

/** Shiftlock request (REQ_SHIFTLOCK, 2-bit). B6.6-7.
 *   0=no actuation, 3=ISA/MTC/N_SP_IS active. */
export const shiftlockRequest: SignalDecoder = {
  id: "SHIFTLOCK_REQUEST",
  label: "Shiftlock",
  unit: "",
  canId: 0x329,
  decode: (f) => (u8(f.data, 6) >> 6) & 0x03,
};

/* ─────────────────────────────────────────────────────────────────
 * 0x545 — DME4 (10 ms): warning lamps + fuel consumption raw +
 * oil-LED warnings. MS43-specific signals (oil temp, upshift,
 * oil pressure low, tire pressure, Alpina chargelight, MSS54 oil
 * level) live in `bmw-e46-ms43.ts` — MS42 has those bytes unused.
 * ───────────────────────────────────────────────────────────────── */

/** MIL / Check Engine (LV_MIL). B0.1. */
export const milLamp: SignalDecoder<boolean> = {
  id: "LAMP_MIL",
  label: "MIL",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 0, 1) === 1,
};

/** Cruise main switch indicator (LV_MAIN_SWI_CRU). B0.3. */
export const cruiseLamp: SignalDecoder<boolean> = {
  id: "LAMP_CRUISE",
  label: "Cruise lamp",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 0, 3) === 1,
};

/** EML — electronic throttle warning (LV_ETC_DIAG). B0.4. */
export const emlLamp: SignalDecoder<boolean> = {
  id: "LAMP_EML",
  label: "EML",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 0, 4) === 1,
};

/** Fuel cap warning (LV_FUC_CAN). B0.6. MS43-documented; MS42
 *  wiki shows B0.6 unused — surfaced anyway since some MS42 builds
 *  set it. Read 0 on MS42 cars that don't emit it. */
export const fuelCapLamp: SignalDecoder<boolean> = {
  id: "LAMP_FUEL_CAP",
  label: "Fuel cap",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 0, 6) === 1,
};

/** Oil consumption LED (B3.0). MS42 labels this "Oil Level Error
 *  LED (M5 cluster only)" — same bit, slightly different LED meaning
 *  across DMEs. */
export const oilConsumptionLed: SignalDecoder<boolean> = {
  id: "LAMP_OIL_CONSUMPTION",
  label: "Oil cons",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 3, 0) === 1,
};

/** Oil loss LED (B3.1). MS42 labels it "Oil Level Warning LED". */
export const oilLossLed: SignalDecoder<boolean> = {
  id: "LAMP_OIL_LOSS",
  label: "Oil loss",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 3, 1) === 1,
};

/** Oil sensor fault (B3.2). MS42 labels this "Oil Level Error LED
 *  (M5)" — wiki text appears to be a typo but bit position matches. */
export const oilSensorFaultLed: SignalDecoder<boolean> = {
  id: "LAMP_OIL_SENSOR_FAULT",
  label: "Oil sens",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 3, 2) === 1,
};

/** Coolant overheat lamp (LV_TEMP_ENG, c_tco_tmot_sta). B3.3. */
export const coolantOverheatLamp: SignalDecoder<boolean> = {
  id: "LAMP_COOLANT_OVERHEAT",
  label: "Coolant hot",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 3, 3) === 1,
};

/** M-Cluster warm-up LEDs (3-bit). B3.4-6. */
export const warmupLeds: SignalDecoder = {
  id: "WARMUP_LEDS",
  label: "Warmup",
  unit: "",
  canId: 0x545,
  decode: (f) => (u8(f.data, 3) >> 4) & 0x07,
};

/** Fuel consumption raw (FCO). B1-B2 LE. No canonical scale —
 *  cluster integrates this internally for the instant-fuel display. */
export const fuelConsumptionRaw: SignalDecoder = {
  id: "FUEL_CONSUMPTION_RAW",
  label: "FCO raw",
  unit: "",
  canId: 0x545,
  rateHz: 100,
  decode: (f) => leU16(f.data, 1),
};

/* ─────────────────────────────────────────────────────────────────
 * 0x153 — ASC1 (10 ms ASC / 20 ms DSC): vehicle speed + traction
 * ───────────────────────────────────────────────────────────────── */

/** Vehicle speed (VSS). 13-bit value across B1.3-7 (low 5 bits)
 *  and B2 (high 8). Formula per wiki: `((MSB*256) + LSB) * 0.0625`
 *  with stated minimum raw `0x160 = 0 km/h` — applied as an offset
 *  so a stationary car reads 0 (without it, the noise-floor raw
 *  values give ~22 km/h). Result clamped to ≥ 0. */
export const vehicleSpeed: SignalDecoder = {
  id: "VEHICLE_SPEED",
  label: "Speed",
  unit: "km/h",
  canId: 0x153,
  rateHz: 50,
  decode: (f) => {
    const raw = ((u8(f.data, 1) >> 3) & 0x1F) | (u8(f.data, 2) << 5);
    const kmh = (raw - 0x160) * 0.0625;
    return kmh > 0 ? kmh : 0;
  },
};

/** ASC intervention request (LV_ASC_REQ). B0.0. */
export const ascRequestActive: SignalDecoder<boolean> = {
  id: "ASC_REQUEST",
  label: "ASC req",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 0) === 1,
};

/** MSR intervention request (LV_MSR_REQ). B0.1. */
export const msrRequestActive: SignalDecoder<boolean> = {
  id: "MSR_REQUEST",
  label: "MSR req",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 1) === 1,
};

/** ASC passive — status for EGS (LV_ASC_PASV). B0.2. */
export const ascPassive: SignalDecoder<boolean> = {
  id: "ASC_PASSIVE",
  label: "ASC pasv",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 2) === 1,
};

/** ASC switching influence (LV_ASC_SW_INT). B0.3. */
export const ascSwitchInfluence: SignalDecoder<boolean> = {
  id: "ASC_SWITCH_INFLUENCE",
  label: "ASC sw",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 3) === 1,
};

/** Brake light switch (LV_BLS). B0.4. */
export const brakeLightSwitch: SignalDecoder<boolean> = {
  id: "BRAKE_LIGHT_SWITCH",
  label: "Brake lt",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 4) === 1,
};

/** Brake Assist active (LV_BAS). B0.5. */
export const brakeAssistActive: SignalDecoder<boolean> = {
  id: "BRAKE_ASSIST",
  label: "BAS",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 5) === 1,
};

/** Electronic Brake-force distribution (LV_EBV). B0.6. */
export const ebvActive: SignalDecoder<boolean> = {
  id: "EBV_ACTIVE",
  label: "EBV",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 6) === 1,
};

/** ABS warning lamp (LV_ABS_LED). B0.7. */
export const absLamp: SignalDecoder<boolean> = {
  id: "LAMP_ABS",
  label: "ABS",
  unit: "",
  canId: 0x153,
  decode: (f) => bit(f.data, 0, 7) === 1,
};

/** ASC torque reduction (MD_IND_ASC). B3 × 0.390625 %.
 *  0x00 = max reduction, 0xFF = no reduction. */
export const ascTorqueReduction: SignalDecoder = {
  id: "ASC_TORQUE",
  label: "ASC tq",
  unit: "%",
  canId: 0x153,
  rateHz: 50,
  decode: (f) => scaled(u8(f.data, 3), 0.390625),
};

/** MSR torque increase (MD_IND_MSR). B4 × 0.390625 %.
 *  0x00 = no increase, 0xFF = max engine torque increase. */
export const msrTorque: SignalDecoder = {
  id: "MSR_TORQUE",
  label: "MSR tq",
  unit: "%",
  canId: 0x153,
  rateHz: 50,
  decode: (f) => scaled(u8(f.data, 4), 0.390625),
};

/** ASC LM torque intervention (MD_IND_ASC_LM). B6 × 0.390625 %. */
export const ascTorqueReductionLm: SignalDecoder = {
  id: "ASC_TORQUE_LM",
  label: "ASC tq LM",
  unit: "%",
  canId: 0x153,
  rateHz: 50,
  decode: (f) => scaled(u8(f.data, 6), 0.390625),
};

/** ASC alive counter (0-15). B7 lower nibble. */
export const ascAliveCounter: SignalDecoder = {
  id: "ASC_ALIVE",
  label: "ASC ✓",
  unit: "",
  canId: 0x153,
  decode: (f) => u8(f.data, 7) & 0x0F,
};

/* ─────────────────────────────────────────────────────────────────
 * 0x1F0 — ASC2 (10 ms ASC / 20 ms DSC): per-wheel speeds
 * Sent by DSC; MS43/MS42 don't read it but the frame is present on
 * the bus and a passive sniffer (DASHX) can decode it.
 * Formula: ((MSB*256) + LSB - 44) / 15.875 → km/h.
 *   Min raw 0x002C = 44 → 0 km/h.
 *   Wheel order per the wiki: wheel 1..4 — exact corner mapping
 *   isn't specified; common convention is FL/FR/RL/RR.
 * ───────────────────────────────────────────────────────────────── */

function decodeWheelSpeed(data: Uint8Array, offset: number): number {
  const raw = leU16(data, offset);
  const kmh = (raw - 44) / 15.875;
  return kmh > 0 ? kmh : 0;
}

/** Wheel 1 speed (commonly front-left). B0-B1 LE. */
export const wheelSpeed1: SignalDecoder = {
  id: "WHEEL_SPEED_1",
  label: "Wheel 1",
  unit: "km/h",
  canId: 0x1F0,
  rateHz: 50,
  decode: (f) => decodeWheelSpeed(f.data, 0),
};

/** Wheel 2 speed (commonly front-right). B2-B3 LE. */
export const wheelSpeed2: SignalDecoder = {
  id: "WHEEL_SPEED_2",
  label: "Wheel 2",
  unit: "km/h",
  canId: 0x1F0,
  rateHz: 50,
  decode: (f) => decodeWheelSpeed(f.data, 2),
};

/** Wheel 3 speed (commonly rear-left). B4-B5 LE. */
export const wheelSpeed3: SignalDecoder = {
  id: "WHEEL_SPEED_3",
  label: "Wheel 3",
  unit: "km/h",
  canId: 0x1F0,
  rateHz: 50,
  decode: (f) => decodeWheelSpeed(f.data, 4),
};

/** Wheel 4 speed (commonly rear-right). B6-B7 LE. */
export const wheelSpeed4: SignalDecoder = {
  id: "WHEEL_SPEED_4",
  label: "Wheel 4",
  unit: "km/h",
  canId: 0x1F0,
  rateHz: 50,
  decode: (f) => decodeWheelSpeed(f.data, 6),
};

/* ─────────────────────────────────────────────────────────────────
 * 0x1F3 — ASC3 (20 ms): vehicle dynamics — AX/AY accelerations
 * Wiki notes "AX / AY maybe stand for acceleration X and Y axis".
 * Layout is split across bytes with the LSB and MSB on different
 * sides of a bitfield; no scaling formula given by wiki.
 * ───────────────────────────────────────────────────────────────── */

/** Longitudinal acceleration (AX_REF). 10-bit signed value:
 *  B3 = LSB byte (8 low bits), B4.0-1 = high 2 bits (sign-extended).
 *  No scale documented; surfaced as raw signed 10-bit. */
export const accelX: SignalDecoder = {
  id: "ACCEL_X_RAW",
  label: "Accel X",
  unit: "",
  canId: 0x1F3,
  rateHz: 50,
  decode: (f) => {
    const raw = u8(f.data, 3) | ((u8(f.data, 4) & 0x03) << 8);
    /* sign-extend the 10-bit value */
    return raw & 0x200 ? raw - 0x400 : raw;
  },
};

/** Lateral acceleration (AY_REF). 10-bit signed:
 *  B4.6-7 = low 2 bits, B5 = high 8 bits. No scale documented. */
export const accelY: SignalDecoder = {
  id: "ACCEL_Y_RAW",
  label: "Accel Y",
  unit: "",
  canId: 0x1F3,
  rateHz: 50,
  decode: (f) => {
    const raw = ((u8(f.data, 4) >> 6) & 0x03) | (u8(f.data, 5) << 2);
    return raw & 0x200 ? raw - 0x400 : raw;
  },
};

/** DSC regulating (DSC_REG). B4.2. */
export const dscRegulating: SignalDecoder<boolean> = {
  id: "DSC_REGULATING",
  label: "DSC reg",
  unit: "",
  canId: 0x1F3,
  decode: (f) => bit(f.data, 4, 2) === 1,
};

/** Steering helper assist (S_HBA). B4.3. */
export const steeringHbaActive: SignalDecoder<boolean> = {
  id: "STEERING_HBA",
  label: "HBA",
  unit: "",
  canId: 0x1F3,
  decode: (f) => bit(f.data, 4, 3) === 1,
};

/* ─────────────────────────────────────────────────────────────────
 * 0x1F5 — LWS1 (10 ms): steering angle sensor
 * ───────────────────────────────────────────────────────────────── */

/** Steering wheel angle (ANG_PSTE). B0-B1 BE signed × 0.04394°.
 *  Range: -1439.99° (0x8000) right to 1439.99° (0x7FFF) left. */
export const steeringAngle: SignalDecoder = {
  id: "STEERING_ANGLE",
  label: "Steering",
  unit: "°",
  canId: 0x1F5,
  rateHz: 100,
  decode: (f) => scaled(beI16(f.data, 0), 0.04394),
};

/** Steering wheel velocity (VEL_ANG_PSTE). B2-B3 BE signed × 0.04394 °/s. */
export const steeringVelocity: SignalDecoder = {
  id: "STEERING_VELOCITY",
  label: "Steering ω",
  unit: "°/s",
  canId: 0x1F5,
  rateHz: 100,
  decode: (f) => scaled(beI16(f.data, 2), 0.04394),
};

/** Steering sensor ID (PSTE_ID). B4. ID for zero-setting. */
export const steeringSensorId: SignalDecoder = {
  id: "STEERING_SENSOR_ID",
  label: "Steer ID",
  unit: "",
  canId: 0x1F5,
  decode: (f) => u8(f.data, 4),
};

/** Steering sensor internal status (PSTE_STATUS). B5.0-3. */
export const steeringSensorStatus: SignalDecoder = {
  id: "STEERING_SENSOR_STATUS",
  label: "Steer st",
  unit: "",
  canId: 0x1F5,
  decode: (f) => u8(f.data, 5) & 0x0F,
};

/** Steering sensor alive counter (PSTE_CNT). B5.4-7. */
export const steeringAliveCounter: SignalDecoder = {
  id: "STEERING_ALIVE",
  label: "Steer ✓",
  unit: "",
  canId: 0x1F5,
  decode: (f) => (u8(f.data, 5) >> 4) & 0x0F,
};

/* ─────────────────────────────────────────────────────────────────
 * 0x1F8 — ASC4 (20 ms): brake pressure + HDC + tire pressure
 * ───────────────────────────────────────────────────────────────── */

/** Brake pressure (P_BRAKE). B2 × 1 → bar. Range 0-255 bar. */
export const brakePressure: SignalDecoder = {
  id: "BRAKE_PRESSURE",
  label: "Brake P",
  unit: "bar",
  canId: 0x1F8,
  rateHz: 50,
  decode: (f) => u8(f.data, 2),
};

/** Wheel acceleration sum (S_WHEEL_ACC). B0. */
export const wheelAcceleration: SignalDecoder = {
  id: "WHEEL_ACCEL",
  label: "Wheel acc",
  unit: "",
  canId: 0x1F8,
  rateHz: 50,
  decode: (f) => u8(f.data, 0),
};

/** Hill Descent Control state (S_HDC, 3-bit). B1.0-2.
 *   0=off, 1=wrong gear, 2=not low range, 3=excessive speed,
 *   4=temporarily inactive, 5=enabled inactive, 6=active. */
export const hdcState: SignalDecoder = {
  id: "HDC_STATE",
  label: "HDC",
  unit: "",
  canId: 0x1F8,
  decode: (f) => u8(f.data, 1) & 0x07,
};

/** Hill Descent Control enabled (L_HDC). B1.3. */
export const hdcEnabled: SignalDecoder<boolean> = {
  id: "HDC_ENABLED",
  label: "HDC en",
  unit: "",
  canId: 0x1F8,
  decode: (f) => bit(f.data, 1, 3) === 1,
};

/** Trailer-mode MSR (B_TW_MSR). B1.5. */
export const trailerMsr: SignalDecoder<boolean> = {
  id: "TRAILER_MSR",
  label: "Trail MSR",
  unit: "",
  canId: 0x1F8,
  decode: (f) => bit(f.data, 1, 5) === 1,
};

/** Trailer-mode ASC (B_TW_ASC). B1.6. */
export const trailerAsc: SignalDecoder<boolean> = {
  id: "TRAILER_ASC",
  label: "Trail ASC",
  unit: "",
  canId: 0x1F8,
  decode: (f) => bit(f.data, 1, 6) === 1,
};

/** Offroad mode (B_Offroad). B1.7. */
export const offroadMode: SignalDecoder<boolean> = {
  id: "OFFROAD_MODE",
  label: "Offroad",
  unit: "",
  canId: 0x1F8,
  decode: (f) => bit(f.data, 1, 7) === 1,
};

/* ─────────────────────────────────────────────────────────────────
 * 0x43F — EGS1 (10 ms): automatic transmission control
 * Sent by the TCU on auto-equipped E46s (or MSS54 in M3 SMG2).
 * ───────────────────────────────────────────────────────────────── */

/** Active gear (GEAR_INFO, 3-bit). B0.0-2.
 *   0=neutral, 1-6=gears, 7=reverse. */
export const transmissionGear: SignalDecoder = {
  id: "TRANS_GEAR",
  label: "Gear",
  unit: "",
  canId: 0x43F,
  rateHz: 100,
  decode: (f) => u8(f.data, 0) & 0x07,
};

/** Gear shift currently in progress (LV_GS). B0.3. */
export const gearShifting: SignalDecoder<boolean> = {
  id: "TRANS_SHIFTING",
  label: "Shifting",
  unit: "",
  canId: 0x43F,
  decode: (f) => bit(f.data, 0, 3) === 1,
};

/** OBD-relevant DTC active (OBD_F). B0.4. */
export const transOobdActive: SignalDecoder<boolean> = {
  id: "TRANS_OBD_DTC",
  label: "TCU DTC",
  unit: "",
  canId: 0x43F,
  decode: (f) => bit(f.data, 0, 4) === 1,
};

/** Gearbox protection (LV_GP_CAN). B0.5. */
export const gearboxProtection: SignalDecoder<boolean> = {
  id: "GEARBOX_PROTECTION",
  label: "Box prot",
  unit: "",
  canId: 0x43F,
  decode: (f) => bit(f.data, 0, 5) === 1,
};

/** Converter lockup clutch state (STATE_CC, 2-bit). B0.6-7.
 *   0=disengaged, 1=regulated, 2=closed, 3=undefined. */
export const converterClutchState: SignalDecoder = {
  id: "CONVERTER_CLUTCH_STATE",
  label: "Conv clu",
  unit: "",
  canId: 0x43F,
  decode: (f) => (u8(f.data, 0) >> 6) & 0x03,
};

/** Gear lever display position (GEAR_SEL_DISP, 4-bit). B1.0-3.
 *   0=clear, 1-4=1st..4th, 5=D, 6=N, 7=R, 8=P, 9=5th, 10=6th. */
export const gearLeverPosition: SignalDecoder = {
  id: "GEAR_LEVER",
  label: "Lever",
  unit: "",
  canId: 0x43F,
  rateHz: 100,
  decode: (f) => u8(f.data, 1) & 0x0F,
};

/** TCU OBD state (STATE_ETCU_OBD, 4-bit). B1.4-7.
 *   0/2=MIL off, 4/6=MIL on, 8/A=MIL FLL, C=idle, E=init, F=invalid. */
export const tcuObdState: SignalDecoder = {
  id: "TCU_OBD_STATE",
  label: "TCU OBD",
  unit: "",
  canId: 0x43F,
  decode: (f) => (u8(f.data, 1) >> 4) & 0x0F,
};

/** Gearbox mode display (PRG_INF_ANZ, 3-bit). B2.5-7.
 *   0=E(con), 1=M(an), 2=S(port), 4=A(uto), others reserved. */
export const gearboxMode: SignalDecoder = {
  id: "GEARBOX_MODE",
  label: "Mode",
  unit: "",
  canId: 0x43F,
  decode: (f) => (u8(f.data, 2) >> 5) & 0x07,
};

/** TCU torque request (TQI_ETCU_CAN). B3 × 0.390625 %.
 *  0xFF = no torque reduction, 0x00 = full reduction. */
export const tcuTorqueRequest: SignalDecoder = {
  id: "TCU_TORQUE_REQUEST",
  label: "TCU tq req",
  unit: "%",
  canId: 0x43F,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 3), 0.390625),
};

/** Output shaft speed (N_ABTR). B4 raw — no scale documented. */
export const outputShaftSpeedRaw: SignalDecoder = {
  id: "OUTPUT_SHAFT_RAW",
  label: "Out shaft",
  unit: "",
  canId: 0x43F,
  rateHz: 100,
  decode: (f) => u8(f.data, 4),
};

/** Torque converter snapshot (TQ_CONV_CAN). B7 raw. */
export const torqueConverterRaw: SignalDecoder = {
  id: "TORQUE_CONVERTER_RAW",
  label: "Conv tq",
  unit: "",
  canId: 0x43F,
  decode: (f) => u8(f.data, 7),
};

/* ─────────────────────────────────────────────────────────────────
 * 0x613 — ICL2 (200 ms): odometer + fuel + clock
 * ───────────────────────────────────────────────────────────────── */

/** Odometer (KM_CTR_CAN). B0-B1 LE × 10 → km. */
export const odometer: SignalDecoder = {
  id: "ODOMETER",
  label: "Odo",
  unit: "km",
  canId: 0x613,
  rateHz: 5,
  decode: (f) => leU16(f.data, 0) * 10,
};

/** Fuel tank level (FTL_CAN, bits 0-6). B2.0-6. Raw cluster units. */
export const fuelLevel: SignalDecoder = {
  id: "FUEL_LEVEL",
  label: "Fuel",
  unit: "",
  canId: 0x613,
  rateHz: 5,
  decode: (f) => u8(f.data, 2) & 0x7F,
};

/** Fuel reserve switch (FTL_RES_CAN). B2.7. */
export const fuelReserve: SignalDecoder<boolean> = {
  id: "FUEL_RESERVE",
  label: "Reserve",
  unit: "",
  canId: 0x613,
  decode: (f) => bit(f.data, 2, 7) === 1,
};

/** Running clock (T_REL_CAN). B3-B4 LE → minutes since power-on. */
export const runningClockMin: SignalDecoder = {
  id: "RUNNING_CLOCK_MIN",
  label: "Run min",
  unit: "min",
  canId: 0x613,
  rateHz: 5,
  decode: (f) => leU16(f.data, 3),
};

/** Driver-side fuel level (FTL_CAN_L, bits 0-5). B5.0-5. */
export const fuelLevelDriver: SignalDecoder = {
  id: "FUEL_LEVEL_DRIVER",
  label: "Fuel L",
  unit: "",
  canId: 0x613,
  decode: (f) => u8(f.data, 5) & 0x3F,
};

/* ─────────────────────────────────────────────────────────────────
 * 0x615 — ICL3 (200 ms): AC + ambient + lighting + displayed speed
 * Note: wiki shows the AC bits (LV_ACCIN, LV_ACIN, LV_REQ_TCO_L)
 * echoed at B0.5-7 AND again at B4.5-7. We decode the B0 copy.
 * ───────────────────────────────────────────────────────────────── */

/** AC compressor torque offset (TQ_ACCIN_CAN, 5-bit). B0.0-4 → Nm.
 *  Range 0-31 Nm. */
export const acTorqueOffset: SignalDecoder = {
  id: "AC_TORQUE_OFFSET",
  label: "AC tq",
  unit: "Nm",
  canId: 0x615,
  rateHz: 5,
  decode: (f) => u8(f.data, 0) & 0x1F,
};

/** Cool-temp lower request (LV_REQ_TCO_L). B0.5. */
export const lowerCoolantTempRequest: SignalDecoder<boolean> = {
  id: "REQ_LOWER_COOLANT_TEMP",
  label: "Cool ↓",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 0, 5) === 1,
};

/** AC compressor on (LV_ACCIN). B0.6. */
export const acCompressor: SignalDecoder<boolean> = {
  id: "AC_COMPRESSOR",
  label: "AC comp",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 0, 6) === 1,
};

/** AC request (LV_ACIN). B0.7. */
export const acRequest: SignalDecoder<boolean> = {
  id: "AC_REQUEST",
  label: "AC req",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 0, 7) === 1,
};

/** Increased heat request (LV_REQ_HEAT). B1.0. */
export const heatRequest: SignalDecoder<boolean> = {
  id: "HEAT_REQUEST",
  label: "Heat",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 1, 0) === 1,
};

/** Trailer operation mode (LV_TOW). B1.1. */
export const trailerMode: SignalDecoder<boolean> = {
  id: "TRAILER_MODE",
  label: "Trailer",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 1, 1) === 1,
};

/** Night lighting (LV_LGT). B1.2. 0=day, 1=night. */
export const nightLighting: SignalDecoder<boolean> = {
  id: "NIGHT_LIGHTING",
  label: "Night",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 1, 2) === 1,
};

/** Hood switch (LV_HS). B1.3. */
export const hoodSwitch: SignalDecoder<boolean> = {
  id: "HOOD_SWITCH",
  label: "Hood",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 1, 3) === 1,
};

/** Electric cooling fan level (N_ECF, 4-bit). B1.4-7. Range 0-15. */
export const coolingFanLevel: SignalDecoder = {
  id: "COOLING_FAN_LEVEL",
  label: "Fan",
  unit: "",
  canId: 0x615,
  rateHz: 5,
  decode: (f) => (u8(f.data, 1) >> 4) & 0x0F,
};

/** Request raised idle. B2.6. */
export const raisedIdleRequest: SignalDecoder<boolean> = {
  id: "RAISED_IDLE",
  label: "Idle ↑",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 2, 6) === 1,
};

/** Ambient temperature raw (TAM_CAN). B3. Cluster maps to °C
 *  via non-linear table not documented in our reference; surfaced
 *  as raw byte. */
export const ambientTempRaw: SignalDecoder = {
  id: "AMBIENT_TEMP_RAW",
  label: "Amb raw",
  unit: "",
  canId: 0x615,
  rateHz: 5,
  decode: (f) => u8(f.data, 3),
};

/** Door switch (LV_DOOR). B4.0. */
export const doorSwitch: SignalDecoder<boolean> = {
  id: "DOOR",
  label: "Door",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 4, 0) === 1,
};

/** Handbrake switch (LV_HBR). B4.1. */
export const handbrakeSwitch: SignalDecoder<boolean> = {
  id: "HANDBRAKE",
  label: "Hbrake",
  unit: "",
  canId: 0x615,
  decode: (f) => bit(f.data, 4, 1) === 1,
};

/** Suspension switch (LV_SUSP, 2-bit). B4.2-3. */
export const suspensionSwitch: SignalDecoder = {
  id: "SUSPENSION",
  label: "Susp",
  unit: "",
  canId: 0x615,
  decode: (f) => (u8(f.data, 4) >> 2) & 0x03,
};

/** Displayed vehicle speed (VSS_DIS, 10-bit raw): B5.6-7 (LSB) |
 *  B6 << 2 (MSB). No formula in reference. For accurate speed
 *  prefer the 0x153 `VEHICLE_SPEED` signal. */
export const displayedSpeedRaw: SignalDecoder = {
  id: "DISPLAYED_SPEED_RAW",
  label: "Disp raw",
  unit: "",
  canId: 0x615,
  rateHz: 5,
  decode: (f) =>
    ((u8(f.data, 5) >> 6) & 0x03) | (u8(f.data, 6) << 2),
};
