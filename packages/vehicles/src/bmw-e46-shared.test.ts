/**
 * Fixture-driven decoder tests. Every fixture's expected value is
 * traced back to the MS4X-canon formula in a comment. The formulas
 * mirror the wiki at https://www.ms4x.net/index.php?title=… (see
 * docs/bmw-e46-can-ids.md for the per-frame URL mapping).
 *
 * Convention: one `describe` block per CAN ID, each test names the
 * signal and its expected value. Pads payloads to 8 bytes (BMW PT-
 * CAN frames are always DLC=8).
 */

import { describe, expect, it } from "vitest";
import type { CanFrame } from "@emdzej/dashx-can-decoder";
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
  ascAliveCounter,
  ascRequestActive,
  ascTorqueReduction,
  brakeActuated,
  brakeAssistActive,
  brakeLightSwitch,
  brakePressure,
  chargeInterventionState,
  clutchDepressed,
  coolantOverheatLamp,
  coolantTemp,
  coolingFanLevel,
  converterClutchState,
  cruiseActive,
  cruiseActiveState,
  cruiseLamp,
  cruiseSwitchState,
  dscRegulating,
  doorSwitch,
  ebvActive,
  emlLamp,
  engineRpm,
  engineRunning,
  fuelCapLamp,
  fuelLevel,
  fuelReserve,
  gearboxMode,
  gearShifting,
  handbrakeSwitch,
  hdcState,
  ignitionOn,
  milLamp,
  msrTorque,
  muxCode,
  muxInfo,
  nightLighting,
  odometer,
  pedalPosition,
  runningClockMin,
  shiftlockRequest,
  steeringAngle,
  steeringVelocity,
  tcuTorqueRequest,
  torqueIndicated,
  torqueRequested,
  transmissionGear,
  vehicleSpeed,
  wheelSpeed1,
  wheelSpeed2,
  wheelSpeed3,
  wheelSpeed4,
} from "./bmw-e46-shared.js";
import {
  errAmtCanMs43,
  oilTemp,
  torqueAfterChargeMs43,
  upshiftIndicator,
} from "./bmw-e46-ms43.js";
import {
  errAmtCanMs42,
  torqueAfterChargeMs42,
} from "./bmw-e46-ms42.js";

function frame(id: number, bytes: number[]): CanFrame {
  const data = new Uint8Array(8);
  for (let i = 0; i < bytes.length && i < 8; i++) data[i] = bytes[i]!;
  return { id, data };
}

describe("0x316 — DME1 (shared)", () => {
  it("decodes idle RPM ≈ 700 from B2-B3 LE × 0.15625", () => {
    /* 700 / 0.15625 = 4480 = 0x1180 → LE 0x80, 0x11 */
    const f = frame(0x316, [0, 0, 0x80, 0x11, 0, 0, 0, 0]);
    expect(engineRpm.decode(f)).toBe(700);
  });
  it("decodes 6500 RPM (near redline)", () => {
    /* 6500 / 0.15625 = 41600 = 0xA280 → LE 0x80, 0xA2 */
    const f = frame(0x316, [0, 0, 0x80, 0xA2, 0, 0, 0, 0]);
    expect(engineRpm.decode(f)).toBe(6500);
  });
  it("decodes torque request 50% from B1 × 0.390625", () => {
    /* 50 / 0.390625 = 128 = 0x80 */
    const f = frame(0x316, [0, 0x80, 0, 0, 0, 0, 0, 0]);
    expect(torqueRequested.decode(f)).toBe(50);
  });
  it("decodes torque indicated from B4", () => {
    const f = frame(0x316, [0, 0, 0, 0, 0x80, 0, 0, 0]);
    expect(torqueIndicated.decode(f)).toBe(50);
  });
  it("detects ignition on (B0.0)", () => {
    expect(ignitionOn.decode(frame(0x316, [0b0000_0001]))).toBe(true);
    expect(ignitionOn.decode(frame(0x316, [0b0000_0000]))).toBe(false);
  });
  it("extracts 2-bit charge intervention state (B0.4-5)", () => {
    /* state = 2 → bits 4-5 = 0b10 → B0 = 0x20 */
    expect(chargeInterventionState.decode(frame(0x316, [0x20]))).toBe(2);
  });
});

describe("0x316 — DME1 per-DME splits", () => {
  it("MS43: TQI_MAF_CAN reads B7 × 0.390625", () => {
    /* 50% → raw 128 = 0x80 at B7 */
    const f = frame(0x316, [0, 0, 0, 0, 0, 0, 0, 0x80]);
    expect(torqueAfterChargeMs43.decode(f)).toBe(50);
  });
  it("MS42: TQI_MAF_CAN reads B6 × 0.390625", () => {
    const f = frame(0x316, [0, 0, 0, 0, 0, 0, 0x80, 0]);
    expect(torqueAfterChargeMs42.decode(f)).toBe(50);
  });
  it("MS43: ERR_AMT_CAN reads B6.6-7 (2-bit)", () => {
    /* err = 2 → bits 6-7 = 0b10 → B6 = 0x80 */
    expect(errAmtCanMs43.decode(frame(0x316, [0, 0, 0, 0, 0, 0, 0x80]))).toBe(2);
  });
  it("MS42: ERR_AMT_CAN reads B7.0-1 (2-bit)", () => {
    /* err = 2 → bits 0-1 = 0b10 → B7 = 0x02 */
    expect(errAmtCanMs42.decode(frame(0x316, [0, 0, 0, 0, 0, 0, 0, 0x02]))).toBe(2);
  });
});

describe("0x329 — DME2", () => {
  it("decodes MUX_CODE from B0.6-7", () => {
    /* code 3 → bits 6-7 = 0b11 → B0 = 0xC0 */
    expect(muxCode.decode(frame(0x329, [0xC0]))).toBe(3);
  });
  it("decodes MUX_INFO from B0.0-5 (6-bit)", () => {
    /* info = 0x2A (max 6-bit = 0x3F) */
    expect(muxInfo.decode(frame(0x329, [0x2A]))).toBe(0x2A);
    /* high bits ignored */
    expect(muxInfo.decode(frame(0x329, [0xEA]))).toBe(0x2A);
  });
  it("decodes coolant ≈ 84.75 °C from B1 × 0.75 − 48", () => {
    /* 85 = raw × 0.75 − 48 → raw ≈ 177.33; use 177 → 84.75 */
    expect(coolantTemp.decode(frame(0x329, [0, 177]))).toBeCloseTo(84.75, 2);
  });
  it("decodes coolant = −48 °C at raw 0 (init)", () => {
    expect(coolantTemp.decode(frame(0x329, [0, 0]))).toBe(-48);
  });
  it("decodes ambient pressure ≈ 1000 hPa from B2 × 2 + 598", () => {
    /* 1000 = raw × 2 + 598 → raw = 201 = 0xC9 */
    expect(ambientPressure.decode(frame(0x329, [0, 0, 0xC9]))).toBe(1000);
  });
  it("decodes pedal 50% from B5", () => {
    expect(pedalPosition.decode(frame(0x329, [0, 0, 0, 0, 0, 0x80]))).toBe(50);
  });
  it("detects engine running (B3.3)", () => {
    expect(engineRunning.decode(frame(0x329, [0, 0, 0, 0b0000_1000]))).toBe(true);
  });
  it("detects clutch depressed (B3.0)", () => {
    expect(clutchDepressed.decode(frame(0x329, [0, 0, 0, 0b0000_0001]))).toBe(true);
  });
  it("detects ACC1 ack (B3.2)", () => {
    expect(acc1Ack.decode(frame(0x329, [0, 0, 0, 0b0000_0100]))).toBe(true);
  });
  it("decodes cruise switch state from B3.5-7 (3-bit)", () => {
    /* state = 3 (resume) → bits 5-7 = 0b011 → B3 = 0x60 */
    expect(cruiseSwitchState.decode(frame(0x329, [0, 0, 0, 0x60]))).toBe(3);
  });
  it("detects brake actuated (B6.0)", () => {
    expect(brakeActuated.decode(frame(0x329, [0, 0, 0, 0, 0, 0, 0b0000_0001]))).toBe(true);
  });
  it("decodes cruise active state (B6.3-5)", () => {
    /* state = 5 (set/accel) → bits 3-5 = 0b101 → B6 = 0x28 */
    const f = frame(0x329, [0, 0, 0, 0, 0, 0, 0x28]);
    expect(cruiseActiveState.decode(f)).toBe(5);
    expect(cruiseActive.decode(f)).toBe(true);
  });
  it("treats cruise inactive (state 0) as false", () => {
    expect(cruiseActive.decode(frame(0x329, [0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
  it("decodes shiftlock request (B6.6-7)", () => {
    /* req = 3 → bits 6-7 = 0b11 → B6 = 0xC0 */
    expect(shiftlockRequest.decode(frame(0x329, [0, 0, 0, 0, 0, 0, 0xC0]))).toBe(3);
  });
});

describe("0x545 — DME4 (shared lamps + FCO)", () => {
  it("detects MIL lit (B0.1)", () => {
    expect(milLamp.decode(frame(0x545, [0b0000_0010]))).toBe(true);
  });
  it("detects cruise main switch (B0.3)", () => {
    expect(cruiseLamp.decode(frame(0x545, [0b0000_1000]))).toBe(true);
  });
  it("detects EML lit (B0.4)", () => {
    expect(emlLamp.decode(frame(0x545, [0b0001_0000]))).toBe(true);
  });
  it("detects fuel cap warning (B0.6)", () => {
    expect(fuelCapLamp.decode(frame(0x545, [0b0100_0000]))).toBe(true);
  });
  it("detects coolant overheat (B3.3)", () => {
    expect(coolantOverheatLamp.decode(frame(0x545, [0, 0, 0, 0b0000_1000]))).toBe(true);
  });
});

describe("0x545 — DME4 (MS43-only)", () => {
  it("detects upshift indicator (B3.7)", () => {
    expect(upshiftIndicator.decode(frame(0x545, [0, 0, 0, 0b1000_0000]))).toBe(true);
  });
  it("decodes oil temp 100 °C from B4 − 48", () => {
    /* 100 °C → raw 148 = 0x94 */
    expect(oilTemp.decode(frame(0x545, [0, 0, 0, 0, 148]))).toBe(100);
  });
  it("decodes oil temp = −48 °C at raw 0 (init)", () => {
    expect(oilTemp.decode(frame(0x545, [0, 0, 0, 0, 0]))).toBe(-48);
  });
});

describe("0x153 — ASC1 (vehicle speed + traction)", () => {
  it("decodes 0 km/h at the noise-floor minimum raw 0x160", () => {
    /* raw 0x160 = 352 → B2 << 5 = 352 → B2 = 11 = 0x0B
       B1[3:7] low 5 bits = 0 → B1 = 0 */
    const f = frame(0x153, [0, 0x00, 0x0B]);
    expect(vehicleSpeed.decode(f)).toBe(0);
  });
  it("clamps speeds below 0x160 noise floor to 0", () => {
    expect(vehicleSpeed.decode(frame(0x153, [0, 0, 0]))).toBe(0);
  });
  it("decodes 100 km/h via 13-bit split", () => {
    /* 100 km/h → raw needed = 0x160 + (100 / 0.0625) = 352 + 1600 = 1952
       Top 8 bits → B2 = 1952 >> 5 = 61 = 0x3D
       Low 5 bits → 1952 & 0x1F = 0 → B1 = 0 */
    const f = frame(0x153, [0, 0x00, 0x3D]);
    expect(vehicleSpeed.decode(f)).toBe(100);
  });
  it("detects brake light switch (B0.4)", () => {
    expect(brakeLightSwitch.decode(frame(0x153, [0b0001_0000]))).toBe(true);
  });
  it("detects brake assist (B0.5)", () => {
    expect(brakeAssistActive.decode(frame(0x153, [0b0010_0000]))).toBe(true);
  });
  it("detects EBV active (B0.6)", () => {
    expect(ebvActive.decode(frame(0x153, [0b0100_0000]))).toBe(true);
  });
  it("detects ABS lamp (B0.7)", () => {
    expect(absLamp.decode(frame(0x153, [0b1000_0000]))).toBe(true);
  });
  it("detects ASC request (B0.0)", () => {
    expect(ascRequestActive.decode(frame(0x153, [0b0000_0001]))).toBe(true);
  });
  it("decodes ASC torque from B3 × 0.390625", () => {
    expect(ascTorqueReduction.decode(frame(0x153, [0, 0, 0, 0x80]))).toBe(50);
  });
  it("decodes MSR torque from B4", () => {
    expect(msrTorque.decode(frame(0x153, [0, 0, 0, 0, 0x80]))).toBe(50);
  });
  it("decodes alive counter from B7 lower nibble", () => {
    expect(ascAliveCounter.decode(frame(0x153, [0, 0, 0, 0, 0, 0, 0, 0xA7]))).toBe(7);
  });
});

describe("0x1F0 — ASC2 wheel speeds", () => {
  it("decodes wheel 1 at 0 km/h with raw 0x002C (minimum)", () => {
    /* raw 0x2C = 44 → (44-44)/15.875 = 0 */
    const f = frame(0x1F0, [0x2C, 0x00]);
    expect(wheelSpeed1.decode(f)).toBe(0);
  });
  it("decodes wheel 1 at ~50 km/h", () => {
    /* 50 * 15.875 + 44 = 837.75 → raw 838 = 0x346 → LE 0x46, 0x03 */
    const f = frame(0x1F0, [0x46, 0x03]);
    expect(wheelSpeed1.decode(f)).toBeCloseTo(50.016, 2);
  });
  it("decodes wheels 2/3/4 from B2-B3 / B4-B5 / B6-B7", () => {
    const f = frame(0x1F0, [
      0x2C, 0x00,  // W1 = 0
      0x46, 0x03,  // W2 ~ 50
      0x46, 0x03,  // W3 ~ 50
      0x46, 0x03,  // W4 ~ 50
    ]);
    expect(wheelSpeed2.decode(f)).toBeCloseTo(50.016, 2);
    expect(wheelSpeed3.decode(f)).toBeCloseTo(50.016, 2);
    expect(wheelSpeed4.decode(f)).toBeCloseTo(50.016, 2);
  });
});

describe("0x1F3 — ASC3 accelerations", () => {
  it("decodes positive AX_REF (B3 LSB + B4.0-1 MSB)", () => {
    /* AX raw = 0x055 → B3 = 0x55, B4.0-1 = 0 */
    const f = frame(0x1F3, [0, 0, 0, 0x55, 0]);
    expect(accelX.decode(f)).toBe(0x55);
  });
  it("decodes negative AX_REF (sign bit set)", () => {
    /* raw 0x3FF (10-bit -1) → B3 = 0xFF, B4.0-1 = 0b11 */
    const f = frame(0x1F3, [0, 0, 0, 0xFF, 0x03]);
    expect(accelX.decode(f)).toBe(-1);
  });
  it("decodes positive AY_REF (B4.6-7 LSB + B5 MSB)", () => {
    /* AY raw = 0x055 → low 2 bits at B4.6-7 = 0b01 (raw bit 1), B5 = raw >> 2 = 0x15 */
    /* Actually wiki shows "B4.6-7 = AY_REF [LSB]" — LSB of the 10-bit value.
       So raw bits 0-1 are in B4.6-7; bits 2-9 are in B5.
       For raw = 0x055 = 0b01_01010101:
         bits 0-1 = 0b01 → B4.6-7 = 0b01 (i.e. B4 = 0x40 if rest zero)
         bits 2-9 = 0b00010101 = 0x15 → B5 = 0x15 */
    const f = frame(0x1F3, [0, 0, 0, 0, 0x40, 0x15]);
    expect(accelY.decode(f)).toBe(0x55);
  });
  it("detects DSC regulating (B4.2)", () => {
    expect(dscRegulating.decode(frame(0x1F3, [0, 0, 0, 0, 0b0000_0100]))).toBe(true);
  });
});

describe("0x1F5 — LWS1 steering", () => {
  it("decodes 0° straight ahead at raw 0", () => {
    expect(steeringAngle.decode(frame(0x1F5, [0, 0]))).toBe(0);
  });
  it("decodes positive (counterclockwise / left) at raw 0x0100", () => {
    /* 0x0100 = 256 × 0.04394 = 11.2486 ° */
    expect(steeringAngle.decode(frame(0x1F5, [0x01, 0x00]))).toBeCloseTo(11.249, 2);
  });
  it("decodes negative (clockwise / right) at raw 0xFF00", () => {
    /* signed: 0xFF00 = -256 × 0.04394 = -11.2486 ° */
    expect(steeringAngle.decode(frame(0x1F5, [0xFF, 0x00]))).toBeCloseTo(-11.249, 2);
  });
  it("decodes max-positive at 0x7FFF ≈ +1440° (wiki rounds scale to 5 sig figs)", () => {
    /* 32767 × 0.04394 = 1439.78°. Wiki claims 1439.99° — the
       true scale is closer to 0.04395 but is documented as 0.04394.
       Test allows ±0.3° of slack to absorb the rounding. */
    expect(steeringAngle.decode(frame(0x1F5, [0x7F, 0xFF]))).toBeCloseTo(1439.78, 0);
  });
  it("decodes steering velocity from B2-B3 BE × 0.04394", () => {
    expect(steeringVelocity.decode(frame(0x1F5, [0, 0, 0x01, 0x00]))).toBeCloseTo(11.249, 2);
  });
});

describe("0x1F8 — ASC4 brake + HDC", () => {
  it("decodes brake pressure from B2 (1 bar per LSB)", () => {
    expect(brakePressure.decode(frame(0x1F8, [0, 0, 0x32]))).toBe(50);
    expect(brakePressure.decode(frame(0x1F8, [0, 0, 0xFF]))).toBe(255);
  });
  it("decodes HDC state from B1.0-2 (3-bit)", () => {
    /* state = 6 (active) → bits 0-2 = 0b110 → B1 = 0x06 */
    expect(hdcState.decode(frame(0x1F8, [0, 0x06]))).toBe(6);
  });
});

describe("0x43F — EGS1 automatic transmission", () => {
  it("decodes active gear from B0.0-2 (3-bit)", () => {
    /* 3 = 3rd gear → B0 = 0x03 */
    expect(transmissionGear.decode(frame(0x43F, [0x03]))).toBe(3);
    expect(transmissionGear.decode(frame(0x43F, [0x07]))).toBe(7);  /* reverse */
  });
  it("detects gear shifting in progress (B0.3)", () => {
    expect(gearShifting.decode(frame(0x43F, [0b0000_1000]))).toBe(true);
  });
  it("decodes converter clutch state (B0.6-7)", () => {
    /* state = 2 (closed) → bits 6-7 = 0b10 → B0 = 0x80 */
    expect(converterClutchState.decode(frame(0x43F, [0x80]))).toBe(2);
  });
  it("decodes gearbox mode from B2.5-7 (3-bit)", () => {
    /* mode = 2 (Sport) → bits 5-7 = 0b010 → B2 = 0x40 */
    expect(gearboxMode.decode(frame(0x43F, [0, 0, 0x40]))).toBe(2);
  });
  it("decodes TCU torque request from B3 × 0.390625", () => {
    /* 0xFF = no reduction → 99.6%, 0x00 = full reduction → 0% */
    expect(tcuTorqueRequest.decode(frame(0x43F, [0, 0, 0, 0xFF]))).toBeCloseTo(99.6, 1);
    expect(tcuTorqueRequest.decode(frame(0x43F, [0, 0, 0, 0x00]))).toBe(0);
  });
});

describe("0x613 — ICL2 (odometer + fuel + clock)", () => {
  it("decodes odometer 100 000 km from B0-B1 LE × 10", () => {
    /* 100 000 / 10 = 10 000 = 0x2710 → LE 0x10, 0x27 */
    expect(odometer.decode(frame(0x613, [0x10, 0x27]))).toBe(100_000);
  });
  it("decodes fuel level from B2 lower 7 bits", () => {
    expect(fuelLevel.decode(frame(0x613, [0, 0, 0x7F]))).toBe(0x7F);
  });
  it("detects fuel reserve (B2.7)", () => {
    expect(fuelReserve.decode(frame(0x613, [0, 0, 0x80]))).toBe(true);
  });
  it("decodes running clock minutes from B3-B4 LE", () => {
    expect(runningClockMin.decode(frame(0x613, [0, 0, 0, 0x3C, 0x00]))).toBe(60);
  });
});

describe("0x615 — ICL3 (AC + ambient + lighting)", () => {
  it("decodes AC torque offset from B0.0-4 (5 bits)", () => {
    expect(acTorqueOffset.decode(frame(0x615, [0x1F]))).toBe(31);
    expect(acTorqueOffset.decode(frame(0x615, [0x10]))).toBe(16);
  });
  it("detects AC compressor (B0.6) and request (B0.7)", () => {
    expect(acCompressor.decode(frame(0x615, [0b0100_0000]))).toBe(true);
    expect(acRequest.decode(frame(0x615, [0b1000_0000]))).toBe(true);
  });
  it("decodes cooling fan level from B1.4-7 (4 bits)", () => {
    expect(coolingFanLevel.decode(frame(0x615, [0, 0x80]))).toBe(8);
    expect(coolingFanLevel.decode(frame(0x615, [0, 0xF0]))).toBe(15);
  });
  it("detects night lighting (B1.2)", () => {
    expect(nightLighting.decode(frame(0x615, [0, 0b0000_0100]))).toBe(true);
  });
  it("decodes ambient temp raw from B3", () => {
    expect(ambientTempRaw.decode(frame(0x615, [0, 0, 0, 0x55]))).toBe(0x55);
  });
  it("detects door open (B4.0) and handbrake (B4.1)", () => {
    expect(doorSwitch.decode(frame(0x615, [0, 0, 0, 0, 0b0000_0001]))).toBe(true);
    expect(handbrakeSwitch.decode(frame(0x615, [0, 0, 0, 0, 0b0000_0010]))).toBe(true);
  });
});
