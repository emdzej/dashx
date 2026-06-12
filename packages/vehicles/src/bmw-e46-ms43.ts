/**
 * BMW E46 with MS43 DME (M54 engine, 2001-2006).
 *
 * MS43-specific decoders (per MS4X canon):
 *   • DME1 B7 — `TQI_MAF_CAN` (theoretical post-charge torque).
 *   • DME1 B6.6-7 — `ERR_AMT_CAN` (2-bit AMT error).
 *   • DME4 B3.7 — Upshift indicator.
 *   • DME4 B4 — Oil temperature (`TOIL_CAN`).
 *   • DME4 B5.0 — Alpina Roadster battery chargelight.
 *   • DME4 B6 — Oil level (MSS54HP-only).
 *   • DME4 B7.0 — Tire pressure (MSS54-only).
 *   • DME4 B7.7 — Engine oil pressure low.
 *
 * The profile lists every shared decoder + these MS43-only ones.
 */

import {
  bit,
  scaled,
  u8,
  type SignalDecoder,
  type VehicleProfile,
} from "@emdzej/dashx-can-decoder";
import {
  acc1Ack,
  acCompressor,
  acRequest,
  acTorqueOffset,
  absLamp,
  accelX,
  accelY,
  ambientPressure,
  ambientTempRaw,
  ascAck,
  ascAliveCounter,
  ascPassive,
  ascRequestActive,
  ascSwitchInfluence,
  ascTorqueReduction,
  ascTorqueReductionLm,
  brakeActuated,
  brakeAssistActive,
  brakeLightSwitch,
  brakePressure,
  brakeSwitchFaulty,
  chargeInterventionState,
  clutchDepressed,
  coolantOverheatLamp,
  coolantTemp,
  coolingFanLevel,
  converterClutchState,
  crankshaftError,
  cruiseActive,
  cruiseActiveState,
  cruiseLamp,
  cruiseSwitchState,
  displayedSpeedRaw,
  doorSwitch,
  dscRegulating,
  ebvActive,
  emlLamp,
  engineRpm,
  engineRunning,
  fuelCapLamp,
  fuelConsumptionRaw,
  fuelLevel,
  fuelLevelDriver,
  fuelReserve,
  gearboxMode,
  gearboxProtection,
  gearChangeOk,
  gearLeverPosition,
  gearShifting,
  handbrakeSwitch,
  hdcEnabled,
  hdcState,
  heatRequest,
  hoodSwitch,
  idleBelowThreshold,
  ignitionOn,
  kickdownActive,
  lowerCoolantTempRequest,
  mafError,
  milLamp,
  msrRequestActive,
  msrTorque,
  muxCode,
  muxInfo,
  nightLighting,
  odometer,
  offroadMode,
  oilConsumptionLed,
  oilLossLed,
  oilSensorFaultLed,
  outputShaftSpeedRaw,
  pedalPosition,
  raisedIdleRequest,
  runningClockMin,
  shiftlockRequest,
  steeringAliveCounter,
  steeringAngle,
  steeringHbaActive,
  steeringSensorId,
  steeringSensorStatus,
  steeringVelocity,
  suspensionSwitch,
  tcuObdState,
  tcuTorqueRequest,
  torqueConverterRaw,
  torqueIndicated,
  torqueLoss,
  torqueRequested,
  tpsVirtual,
  trailerAsc,
  trailerMode,
  trailerMsr,
  transmissionGear,
  transOobdActive,
  vehicleSpeed,
  warmupLeds,
  wheelAcceleration,
  wheelSpeed1,
  wheelSpeed2,
  wheelSpeed3,
  wheelSpeed4,
} from "./bmw-e46-shared.js";

/* ── MS43-only signals ─────────────────────────────────────────── */

/** Theoretical post-charge torque (TQI_MAF_CAN). DME1 B7 × 0.390625 %.
 *  Note: on MS42 this signal lives at B6 — see `bmw-e46-ms42.ts`. */
const torqueAfterChargeMs43: SignalDecoder = {
  id: "TORQUE_AFTER_CHARGE",
  label: "Torque ac",
  unit: "%",
  canId: 0x316,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 7), 0.390625),
};

/** AMT error state (ERR_AMT_CAN, 2-bit). DME1 B6.6-7.
 *  Note: on MS42 this lives at B7.0-1. */
const errAmtCanMs43: SignalDecoder = {
  id: "ERR_AMT_CAN",
  label: "AMT err",
  unit: "",
  canId: 0x316,
  decode: (f) => (u8(f.data, 6) >> 6) & 0x03,
};

/** Upshift indicator. DME4 B3.7. MS43-only (MS42 has B3.7 unused). */
const upshiftIndicator: SignalDecoder<boolean> = {
  id: "UPSHIFT",
  label: "Upshift",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 3, 7) === 1,
};

/** Oil temperature (TOIL_CAN). DME4 B4 raw − 48 → °C. MS43-only.
 *  Range: 0x00 → −48 °C, 0xFE → 206 °C. */
const oilTemp: SignalDecoder = {
  id: "OIL_TEMP",
  label: "Oil",
  unit: "°C",
  canId: 0x545,
  rateHz: 100,
  decode: (f) => u8(f.data, 4) - 48,
};

/** Alpina Roadster battery chargelight. DME4 B5.0.
 *  MS43-only and Alpina-specific (most MS43 cars read 0 here). */
const alpinaBatteryChargeLamp: SignalDecoder<boolean> = {
  id: "LAMP_ALPINA_BATTERY_CHARGE",
  label: "Alpina batt",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 5, 0) === 1,
};

/** Oil level (MSS54HP-only). DME4 B6 → (raw − 158) / 10 → L.
 *  Min: 0x80 / 0xC0 (−3.0 L), Max: 0xBE / 0xFE (+3.2 L). */
const oilLevelMss54: SignalDecoder = {
  id: "OIL_LEVEL",
  label: "Oil lvl",
  unit: "L",
  canId: 0x545,
  rateHz: 100,
  decode: (f) => (u8(f.data, 6) - 158) / 10,
};

/** Tire pressure warning (MSS54-only). DME4 B7.0. */
const tirePressureLamp: SignalDecoder<boolean> = {
  id: "LAMP_TIRE_PRESSURE",
  label: "Tire",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 7, 0) === 1,
};

/** Engine oil pressure low. DME4 B7.7. MS43-only. */
const oilPressureLowLamp: SignalDecoder<boolean> = {
  id: "LAMP_OIL_PRESSURE_LOW",
  label: "Oil press",
  unit: "",
  canId: 0x545,
  decode: (f) => bit(f.data, 7, 7) === 1,
};

export {
  torqueAfterChargeMs43,
  errAmtCanMs43,
  upshiftIndicator,
  oilTemp,
  alpinaBatteryChargeLamp,
  oilLevelMss54,
  tirePressureLamp,
  oilPressureLowLamp,
};

export const bmwE46Ms43: VehicleProfile = {
  id: "bmw-e46-ms43",
  label: "BMW E46 MS43 (M54)",
  bitrate: 500_000,
  signals: [
    /* DME1 0x316 */
    engineRpm,
    torqueRequested,
    torqueIndicated,
    torqueLoss,
    torqueAfterChargeMs43,
    errAmtCanMs43,
    ignitionOn,
    crankshaftError,
    ascAck,
    gearChangeOk,
    mafError,
    chargeInterventionState,

    /* DME2 0x329 */
    muxCode,
    muxInfo,
    coolantTemp,
    ambientPressure,
    pedalPosition,
    tpsVirtual,
    engineRunning,
    clutchDepressed,
    idleBelowThreshold,
    acc1Ack,
    brakeActuated,
    brakeSwitchFaulty,
    kickdownActive,
    cruiseActive,
    cruiseSwitchState,
    cruiseActiveState,
    shiftlockRequest,

    /* DME4 0x545 */
    milLamp,
    emlLamp,
    cruiseLamp,
    fuelCapLamp,
    oilConsumptionLed,
    oilLossLed,
    oilSensorFaultLed,
    coolantOverheatLamp,
    upshiftIndicator,
    warmupLeds,
    oilTemp,
    alpinaBatteryChargeLamp,
    oilLevelMss54,
    tirePressureLamp,
    oilPressureLowLamp,
    fuelConsumptionRaw,

    /* ASC1 0x153 */
    vehicleSpeed,
    brakeLightSwitch,
    ascRequestActive,
    msrRequestActive,
    ascPassive,
    ascSwitchInfluence,
    brakeAssistActive,
    ebvActive,
    absLamp,
    ascTorqueReduction,
    ascTorqueReductionLm,
    msrTorque,
    ascAliveCounter,

    /* ASC2 0x1F0 */
    wheelSpeed1,
    wheelSpeed2,
    wheelSpeed3,
    wheelSpeed4,

    /* ASC3 0x1F3 */
    accelX,
    accelY,
    dscRegulating,
    steeringHbaActive,

    /* LWS1 0x1F5 */
    steeringAngle,
    steeringVelocity,
    steeringSensorId,
    steeringSensorStatus,
    steeringAliveCounter,

    /* ASC4 0x1F8 */
    brakePressure,
    wheelAcceleration,
    hdcState,
    hdcEnabled,
    trailerMsr,
    trailerAsc,
    offroadMode,

    /* EGS1 0x43F */
    transmissionGear,
    gearShifting,
    transOobdActive,
    gearboxProtection,
    converterClutchState,
    gearLeverPosition,
    tcuObdState,
    gearboxMode,
    tcuTorqueRequest,
    outputShaftSpeedRaw,
    torqueConverterRaw,

    /* ICL2 0x613 */
    odometer,
    fuelLevel,
    fuelReserve,
    runningClockMin,
    fuelLevelDriver,

    /* ICL3 0x615 */
    acTorqueOffset,
    acCompressor,
    acRequest,
    lowerCoolantTempRequest,
    heatRequest,
    trailerMode,
    nightLighting,
    hoodSwitch,
    coolingFanLevel,
    raisedIdleRequest,
    ambientTempRaw,
    doorSwitch,
    handbrakeSwitch,
    suspensionSwitch,
    displayedSpeedRaw,
  ],
};
