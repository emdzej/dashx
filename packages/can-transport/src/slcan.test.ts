import { describe, expect, it } from "vitest";
import {
  LineBuffer,
  bitrateCommand,
  decodeFrameLine,
  encodeFrame,
} from "./slcan.js";

describe("bitrateCommand", () => {
  it("maps the standard rates to canonical SLCAN codes", () => {
    expect(bitrateCommand(10_000)).toBe("S0");
    expect(bitrateCommand(20_000)).toBe("S1");
    expect(bitrateCommand(50_000)).toBe("S2");
    expect(bitrateCommand(100_000)).toBe("S3");  /* BMW K-CAN */
    expect(bitrateCommand(125_000)).toBe("S4");
    expect(bitrateCommand(250_000)).toBe("S5");
    expect(bitrateCommand(500_000)).toBe("S6");  /* BMW PT-CAN */
    expect(bitrateCommand(800_000)).toBe("S7");
    expect(bitrateCommand(1_000_000)).toBe("S8"); /* BMW F-CAN */
  });
});

describe("encodeFrame", () => {
  it("encodes a standard 11-bit frame, no RTR", () => {
    const out = encodeFrame({
      id: 0x316,
      data: new Uint8Array([0x05, 0x00, 0x80, 0x11]),
    });
    /* `t<id3><dlc><data>` = "t" + "316" + "4" + "05008011" */
    expect(out).toBe("t316405008011");
  });
  it("encodes an extended 29-bit frame", () => {
    const out = encodeFrame({
      id: 0x18FF50E5,
      ext: true,
      data: new Uint8Array([0xDE, 0xAD]),
    });
    expect(out).toBe("T18FF50E52DEAD");
  });
  it("encodes RTR (no payload bytes)", () => {
    const out = encodeFrame({
      id: 0x100,
      rtr: true,
      data: new Uint8Array(0),
    });
    /* RTR data length carried via the DLC nibble — caller should
       set `data` to the requested length when they want a non-zero
       DLC. Empty Uint8Array → DLC 0, which is also legal. */
    expect(out).toBe("r1000");
  });
  it("rejects DLC > 8 (classical CAN cap)", () => {
    expect(() =>
      encodeFrame({
        id: 0x100,
        data: new Uint8Array(9),
      }),
    ).toThrow(/DLC > 8/);
  });
});

describe("decodeFrameLine", () => {
  it("round-trips a standard frame", () => {
    const original = {
      id: 0x316,
      ext: false,
      rtr: false,
      data: new Uint8Array([0x05, 0x00, 0x80, 0x11]),
    };
    const wire = encodeFrame(original);
    const decoded = decodeFrameLine(wire);
    expect(decoded).not.toBeNull();
    expect(decoded!.frame.id).toBe(0x316);
    expect(decoded!.frame.ext).toBe(false);
    expect(decoded!.frame.rtr).toBe(false);
    expect(Array.from(decoded!.frame.data)).toEqual([0x05, 0x00, 0x80, 0x11]);
  });

  it("round-trips an extended frame", () => {
    const original = {
      id: 0x1FFF50E5,
      ext: true,
      rtr: false,
      data: new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]),
    };
    const wire = encodeFrame(original);
    const decoded = decodeFrameLine(wire);
    expect(decoded!.frame.id).toBe(0x1FFF50E5);
    expect(decoded!.frame.ext).toBe(true);
    expect(Array.from(decoded!.frame.data)).toEqual([
      0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
    ]);
  });

  it("decodes RTR without payload", () => {
    const decoded = decodeFrameLine("r1004");
    expect(decoded!.frame.id).toBe(0x100);
    expect(decoded!.frame.rtr).toBe(true);
    expect(decoded!.frame.data.length).toBe(0);
  });

  it("captures optional device timestamp", () => {
    /* Standard frame DLC=4 + 4 hex chars (0xABCD) after the payload. */
    const decoded = decodeFrameLine("t316405008011ABCD");
    expect(decoded?.deviceTsMs).toBe(0xABCD);
  });

  it("returns null on truncated payload", () => {
    /* Claims DLC=4 but only carries 2 data bytes. */
    expect(decodeFrameLine("t3164ABCD")).toBeNull();
  });

  it("returns null on non-frame lines", () => {
    expect(decodeFrameLine("")).toBeNull();
    expect(decodeFrameLine("V1234")).toBeNull();   /* version reply */
    expect(decodeFrameLine("")).toBeNull();  /* BEL = error */
  });
});

describe("LineBuffer", () => {
  it("emits a single complete line", () => {
    const lb = new LineBuffer();
    expect(lb.push("t31640500\r")).toEqual(["t31640500"]);
  });
  it("buffers across partial pushes", () => {
    const lb = new LineBuffer();
    expect(lb.push("t3164")).toEqual([]);
    expect(lb.push("0500\r")).toEqual(["t31640500"]);
  });
  it("emits multiple lines from one chunk", () => {
    const lb = new LineBuffer();
    expect(lb.push("t1001AA\rt2002BB\rt300")).toEqual(["t1001AA", "t2002BB"]);
    expect(lb.push("3CC\r")).toEqual(["t3003CC"]);
  });
  it("drops the buffer on overflow", () => {
    const lb = new LineBuffer();
    /* Push 2 KiB of garbage with no `\r` — should cap at 1 KiB
       and silently drop. Next valid line still parses. */
    lb.push("x".repeat(2048));
    expect(lb.push("t1001AA\r")).toEqual(["t1001AA"]);
  });
});
