import { describe, expect, it } from "vitest";
import { beI16, beU16, beU32, bit, leI16, leU16, leU32, scaled, u8 } from "./bytes.js";

describe("u8", () => {
  it("reads in-range bytes", () => {
    expect(u8(new Uint8Array([0xAB]), 0)).toBe(0xAB);
  });
  it("returns 0 for out-of-range offsets (no throw)", () => {
    expect(u8(new Uint8Array([0xAB]), 5)).toBe(0);
    expect(u8(new Uint8Array([0xAB]), -1)).toBe(0);
  });
});

describe("bit", () => {
  it("extracts individual bits LSB-first", () => {
    const b = new Uint8Array([0b1010_0001]);
    expect(bit(b, 0, 0)).toBe(1);
    expect(bit(b, 0, 1)).toBe(0);
    expect(bit(b, 0, 5)).toBe(1);
    expect(bit(b, 0, 7)).toBe(1);
  });
});

describe("16-bit readers", () => {
  /* 0x1234 stored LE = [0x34, 0x12]; BE = [0x12, 0x34]. */
  it("leU16 reads low-byte-first", () => {
    expect(leU16(new Uint8Array([0x34, 0x12]), 0)).toBe(0x1234);
  });
  it("beU16 reads high-byte-first", () => {
    expect(beU16(new Uint8Array([0x12, 0x34]), 0)).toBe(0x1234);
  });
  it("respects offset", () => {
    expect(leU16(new Uint8Array([0xFF, 0x34, 0x12, 0xFF]), 1)).toBe(0x1234);
    expect(beU16(new Uint8Array([0xFF, 0x12, 0x34, 0xFF]), 1)).toBe(0x1234);
  });
  it("leI16 sign-extends correctly", () => {
    /* -1 in two's complement LE = [0xFF, 0xFF] */
    expect(leI16(new Uint8Array([0xFF, 0xFF]), 0)).toBe(-1);
    /* -32768 (most negative) = [0x00, 0x80] LE */
    expect(leI16(new Uint8Array([0x00, 0x80]), 0)).toBe(-32_768);
  });
  it("beI16 sign-extends correctly", () => {
    expect(beI16(new Uint8Array([0xFF, 0xFF]), 0)).toBe(-1);
    expect(beI16(new Uint8Array([0x80, 0x00]), 0)).toBe(-32_768);
  });
});

describe("32-bit readers", () => {
  it("leU32 reads low-byte-first", () => {
    expect(leU32(new Uint8Array([0x78, 0x56, 0x34, 0x12]), 0)).toBe(0x1234_5678);
  });
  it("beU32 reads high-byte-first", () => {
    expect(beU32(new Uint8Array([0x12, 0x34, 0x56, 0x78]), 0)).toBe(0x1234_5678);
  });
  it("leU32 stays unsigned at the high bit", () => {
    /* 0xFFFF_FFFF — would be -1 as signed; we want 4294967295 unsigned. */
    expect(leU32(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]), 0)).toBe(0xFFFF_FFFF);
  });
});

describe("scaled", () => {
  it("applies scale and offset", () => {
    /* BMW E46 coolant: raw 100 · 0.75 − 48.373 ≈ 26.627 °C */
    expect(scaled(100, 0.75, -48.373)).toBeCloseTo(26.627, 3);
  });
  it("defaults offset to 0", () => {
    expect(scaled(1000, 0.5)).toBe(500);
  });
});
