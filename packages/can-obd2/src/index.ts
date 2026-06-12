/**
 * `@emdzej/dashx-can-obd2` — OBD-II Mode 01 over CAN (ISO 15765-4).
 *
 * Surfaces diagnostic-only signals (fuel trims, lambda voltage,
 * battery voltage, …) that aren't on the BMW broadcast bus. Works
 * in two modes — see `Obd2Client` — passive sniff and active poll.
 *
 * v1 covers single-frame ISO-TP only, which is enough for every
 * Mode 01 PID that returns ≤ 4 data bytes. Multi-frame ISO-TP for
 * Mode 09 (VIN) and DTC dumps is a future extension.
 */

export {
  OBD2_BROADCAST_REQUEST_ID,
  OBD2_DME_REQUEST_ID,
  OBD2_DME_RESPONSE_ID,
  Obd2Service,
  encodeMode01Request,
  decodeMode01Response,
  type Mode01Response,
} from "./isotp.js";

export {
  type Obd2Pid,
  type Obd2PidValue,
  PID_CATALOG,
  DEFAULT_BMW_E46_PIDS,
  findPid,
  findPidById,
  /* Re-export individual PIDs for explicit imports in consumer code. */
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
} from "./pids.js";

export {
  Obd2Client,
  type Obd2ClientOptions,
  type Obd2ValueHandler,
} from "./client.js";
