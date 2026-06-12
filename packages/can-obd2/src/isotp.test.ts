import { describe, expect, it } from "vitest";
import {
  encodeMode01Request,
  decodeMode01Response,
} from "./isotp.js";

describe("encodeMode01Request", () => {
  it("encodes PID 0x06 (STFT B1) as `02 01 06 55 55 55 55 55`", () => {
    expect(Array.from(encodeMode01Request(0x06))).toEqual([
      0x02, 0x01, 0x06, 0x55, 0x55, 0x55, 0x55, 0x55,
    ]);
  });
  it("encodes PID 0x42 (battery voltage)", () => {
    expect(Array.from(encodeMode01Request(0x42))).toEqual([
      0x02, 0x01, 0x42, 0x55, 0x55, 0x55, 0x55, 0x55,
    ]);
  });
  it("rejects PID out of range", () => {
    expect(() => encodeMode01Request(-1)).toThrow();
    expect(() => encodeMode01Request(0x100)).toThrow();
  });
});

describe("decodeMode01Response", () => {
  it("decodes a 1-byte response (PID 0x05 coolant)", () => {
    /* DME replies: `03 41 05 7B 00 00 00 00`
       SF length = 3, service = 0x41 (mode 01 ack), PID = 0x05,
       data byte = 0x7B. Coolant = 0x7B - 40 = 83 °C. */
    const r = decodeMode01Response(
      new Uint8Array([0x03, 0x41, 0x05, 0x7B, 0, 0, 0, 0]),
    );
    expect(r).not.toBeNull();
    expect(r!.service).toBe(0x01);
    expect(r!.pid).toBe(0x05);
    expect(Array.from(r!.data)).toEqual([0x7B]);
  });

  it("decodes a 2-byte response (PID 0x0C RPM)", () => {
    /* SF length = 4 → service + PID + 2 data bytes */
    const r = decodeMode01Response(
      new Uint8Array([0x04, 0x41, 0x0C, 0x0A, 0xF0, 0, 0, 0]),
    );
    expect(r!.pid).toBe(0x0C);
    expect(Array.from(r!.data)).toEqual([0x0A, 0xF0]);
  });

  it("rejects multi-frame responses (PCI type != 0)", () => {
    /* First-frame PCI = 0x1L LL LL — definitely not a Mode 01 single. */
    expect(
      decodeMode01Response(new Uint8Array([0x10, 0x0A, 0x49, 0x02, 1, 2, 3, 4])),
    ).toBeNull();
  });

  it("rejects non-Mode-01 responses", () => {
    /* Service 0x43 = stored DTCs response — should be rejected by the
       Mode 01 decoder. */
    expect(
      decodeMode01Response(new Uint8Array([0x04, 0x43, 0x01, 0x33, 0x10, 0, 0, 0])),
    ).toBeNull();
  });

  it("rejects negative-response frames (service 0x7F)", () => {
    /* Negative reply: SF len 3, service 0x7F, requested service, NRC. */
    expect(
      decodeMode01Response(new Uint8Array([0x03, 0x7F, 0x01, 0x12, 0, 0, 0, 0])),
    ).toBeNull();
  });

  it("rejects truncated payloads", () => {
    /* SF claims 4 bytes but the array is only 3 bytes long. */
    expect(decodeMode01Response(new Uint8Array([0x04, 0x41]))).toBeNull();
  });

  it("rejects payloads claiming an invalid SF length", () => {
    /* SF length 0 is invalid for Mode 01 (need service + PID = 2 min). */
    expect(
      decodeMode01Response(new Uint8Array([0x00, 0x41, 0x05, 0, 0, 0, 0, 0])),
    ).toBeNull();
    /* SF length > 7 doesn't fit in 8 bytes anyway. */
    expect(
      decodeMode01Response(new Uint8Array([0x08, 0x41, 0x05, 0, 0, 0, 0, 0])),
    ).toBeNull();
  });
});
