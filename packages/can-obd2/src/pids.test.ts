import { describe, expect, it } from "vitest";
import {
  PID_BATTERY_VOLTAGE,
  PID_COOLANT_TEMP,
  PID_INTAKE_TEMP,
  PID_LAMBDA_COMMANDED,
  PID_LTFT_B1,
  PID_MAF,
  PID_O2_B1S1_VOLTAGE,
  PID_RPM,
  PID_STFT_B1,
  PID_TIMING_ADVANCE,
  findPid,
  findPidById,
  PID_CATALOG,
} from "./pids.js";

const d = (...bytes: number[]) => new Uint8Array(bytes);

describe("PID decoders", () => {
  it("0x05 coolant: 0x7B → 83 °C", () => {
    expect(PID_COOLANT_TEMP.decode(d(0x7B))).toBe(83);
  });
  it("0x05 coolant: 0x00 → -40 °C (min)", () => {
    expect(PID_COOLANT_TEMP.decode(d(0))).toBe(-40);
  });
  it("0x06 STFT B1: 0x80 → 0% (centered)", () => {
    expect(PID_STFT_B1.decode(d(0x80))).toBe(0);
  });
  it("0x06 STFT B1: 0x90 → +12.5% rich", () => {
    /* (0x90 - 128) * 100/128 = 16 * 100/128 = 12.5 */
    expect(PID_STFT_B1.decode(d(0x90))).toBeCloseTo(12.5, 4);
  });
  it("0x07 LTFT B1: 0x70 → -12.5% lean", () => {
    /* (0x70 - 128) * 100/128 = -16 * 100/128 = -12.5 */
    expect(PID_LTFT_B1.decode(d(0x70))).toBeCloseTo(-12.5, 4);
  });
  it("0x0C RPM: 0x0AF0 → 700 RPM (idle)", () => {
    /* ((0x0A * 256) + 0xF0) / 4 = (2560 + 240) / 4 = 700 */
    expect(PID_RPM.decode(d(0x0A, 0xF0))).toBe(700);
  });
  it("0x0C RPM: 0x6590 → 6500", () => {
    /* 6500 × 4 = 26000 = 0x6590 → A=0x65, B=0x90 */
    expect(PID_RPM.decode(d(0x65, 0x90))).toBe(6500);
  });
  it("0x0E timing advance: 0x80 → 0° (zero point)", () => {
    /* 0x80 / 2 - 64 = 64 - 64 = 0 */
    expect(PID_TIMING_ADVANCE.decode(d(0x80))).toBe(0);
  });
  it("0x0E timing: 0x88 → +4°", () => {
    /* 0x88 / 2 - 64 = 68 - 64 = 4 */
    expect(PID_TIMING_ADVANCE.decode(d(0x88))).toBe(4);
  });
  it("0x0F IAT: 0x40 → 24 °C", () => {
    /* 0x40 - 40 = 64 - 40 = 24 */
    expect(PID_INTAKE_TEMP.decode(d(0x40))).toBe(24);
  });
  it("0x10 MAF: 0x0190 → 4.0 g/s", () => {
    /* ((0x01 * 256) + 0x90) / 100 = 400 / 100 = 4.0 */
    expect(PID_MAF.decode(d(0x01, 0x90))).toBe(4.0);
  });
  it("0x14 O2 B1S1 voltage: 0x9C → 0.78 V", () => {
    /* 156 * 0.005 = 0.78 */
    expect(PID_O2_B1S1_VOLTAGE.decode(d(0x9C, 0xFF))).toBeCloseTo(0.78, 4);
  });
  it("0x42 battery voltage: 0x3680 → 13.952 V", () => {
    /* ((0x36 * 256) + 0x80) / 1000 = 13952 / 1000 */
    expect(PID_BATTERY_VOLTAGE.decode(d(0x36, 0x80))).toBeCloseTo(13.952, 4);
  });
  it("0x44 lambda: 0x8000 → ~1.0 (stoich)", () => {
    /* 0x8000 * 0.0000305 = 32768 * 0.0000305 ≈ 0.99942 */
    expect(PID_LAMBDA_COMMANDED.decode(d(0x80, 0x00))).toBeCloseTo(1.0, 2);
  });
});

describe("catalog lookups", () => {
  it("finds PID by number", () => {
    expect(findPid(0x06)).toBe(PID_STFT_B1);
    expect(findPid(0x42)).toBe(PID_BATTERY_VOLTAGE);
    expect(findPid(0xFF)).toBeUndefined();
  });
  it("finds PID by id", () => {
    expect(findPidById("OBD2_BATTERY_VOLTAGE")).toBe(PID_BATTERY_VOLTAGE);
    expect(findPidById("NOPE")).toBeUndefined();
  });
  it("catalog has unique PID ids and numbers", () => {
    const ids = PID_CATALOG.map((p) => p.id);
    const nums = PID_CATALOG.map((p) => p.pid);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(nums).size).toBe(nums.length);
  });
});
