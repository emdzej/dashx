/**
 * BMW E46 with MS42 DME (M52TU engine, 1998-2001).
 *
 * MS42-specific differences from MS43 (per MS4X canon):
 *   • DME1 B6 — `TQI_MAF_CAN` (theoretical post-charge torque).
 *     MS43 puts this at B7.
 *   • DME1 B7.0-1 — `ERR_AMT_CAN` (2-bit AMT error).
 *     MS43 puts this at B6.6-7.
 *   • DME4 B4-B7 — UNUSED on MS42.
 *     So oil temperature, upshift indicator, oil pressure low,
 *     tire pressure, Alpina chargelight, and MSS54 oil level are
 *     NOT broadcast on MS42 and don't appear in the profile.
 *
 * The MS4X MS42 wiki page itself flags: "values are copied from
 * the MS43 page, so these have to be verified" — treat MS42 byte
 * positions as tentative until cross-checked with real captures.
 */

import {
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

/* ── MS42-only signals ─────────────────────────────────────────── */

/** Theoretical post-charge torque (TQI_MAF_CAN). DME1 B6 × 0.390625 %.
 *  Note: on MS43 this signal lives at B7. */
const torqueAfterChargeMs42: SignalDecoder = {
  id: "TORQUE_AFTER_CHARGE",
  label: "Torque ac",
  unit: "%",
  canId: 0x316,
  rateHz: 100,
  decode: (f) => scaled(u8(f.data, 6), 0.390625),
};

/** AMT error state (ERR_AMT_CAN, 2-bit). DME1 B7.0-1.
 *  Note: on MS43 this lives at B6.6-7. */
const errAmtCanMs42: SignalDecoder = {
  id: "ERR_AMT_CAN",
  label: "AMT err",
  unit: "",
  canId: 0x316,
  decode: (f) => u8(f.data, 7) & 0x03,
};

export { torqueAfterChargeMs42, errAmtCanMs42 };

export const bmwE46Ms42: VehicleProfile = {
  id: "bmw-e46-ms42",
  label: "BMW E46 MS42 (M52TU)",
  bitrate: 500_000,
  signals: [
    /* DME1 0x316 */
    engineRpm,
    torqueRequested,
    torqueIndicated,
    torqueLoss,
    torqueAfterChargeMs42,
    errAmtCanMs42,
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

    /* DME4 0x545 — MS42 only uses B0-B3 + B1-B2 FCO */
    milLamp,
    emlLamp,
    cruiseLamp,
    fuelCapLamp,
    oilConsumptionLed,
    oilLossLed,
    oilSensorFaultLed,
    coolantOverheatLamp,
    warmupLeds,
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
