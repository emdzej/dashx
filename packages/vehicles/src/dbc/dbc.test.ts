import { describe, expect, it } from "vitest";
import type { CanFrame } from "@emdzej/dashx-can-decoder";
import { parseDbc } from "./parser.js";
import {
  compileDbc,
  compileDbcText,
  readBitsBe,
  readBitsLe,
  signExtend,
} from "./compiler.js";

const SAMPLE = `
VERSION "test"
BS_:
BU_: DME DSC IKE

VAL_TABLE_ OnOff 0 "Off" 1 "On" ;

BO_ 790 DME1: 8 DME
   SG_ RPM : 16|16@1+ (0.15625,0) [0|7000] "RPM" Vector__XXX
   SG_ KeyOn : 0|1@1+ (1,0) [0|1] "" Vector__XXX

BO_ 339 ASC1: 8 DSC
   SG_ Speed : 11|13@1+ (0.0625,-22) [0|255] "km/h" DME
   SG_ SignedAccel : 24|10@1- (1,0) [-512|511] "" DME

BO_ 809 DME2: 8 DME
   SG_ MuxCode M : 22|2@1+ (1,0) [0|3] "" Vector__XXX
   SG_ Coolant : 8|8@1+ (0.75,-48) [-48|143] "degC" Vector__XXX
   SG_ CanLevelInfo m0 : 16|6@1+ (1,0) [0|63] "" Vector__XXX
   SG_ ObdSteuerInfo m2 : 16|6@1+ (1,0) [0|63] "" Vector__XXX

BO_ 100 Big: 8 DME
   SG_ BeWord : 7|16@0+ (1,0) [0|65535] "" Vector__XXX
   SG_ BeSigned : 23|16@0- (0.01,0) [-100|100] "g" Vector__XXX

BO_ 200 EnumHost: 8 DME
   SG_ KeyState : 0|1@1+ (1,0) [0|1] "" Vector__XXX

VAL_ 200 KeyState OnOff ;
VAL_ 809 MuxCode 0 "CAN_LEVEL" 2 "OBD_STEUER" 3 "MD_NORM" ;

CM_ SG_ 790 RPM "Engine speed N_ENG. Idle ~700, redline ~6500.";
CM_ BO_ 339 "ASC1 — vehicle speed + traction control state.";
CM_ BU_ DME "Engine management.";

BA_DEF_ BO_ "GenMsgCycleTime" INT 0 10000;
BA_DEF_ SG_ "GenSigStartValue" INT 0 65535;
BA_DEF_DEF_ "GenMsgCycleTime" 0;
BA_DEF_DEF_ "GenSigStartValue" 0;
BA_ "GenMsgCycleTime" BO_ 790 10;
BA_ "GenMsgCycleTime" BO_ 339 20;
BA_ "GenSigStartValue" SG_ 790 RPM 4480;
`;

describe("parseDbc — full grammar", () => {
  const db = parseDbc(SAMPLE);

  it("captures VERSION + BS_ + nodes", () => {
    expect(db.version).toBe("test");
    expect(db.nodes.map((n) => n.name)).toEqual(["DME", "DSC", "IKE"]);
  });

  it("captures named VAL_TABLE_ definitions", () => {
    expect(db.valueTables.get("OnOff")).toEqual({ 0: "Off", 1: "On" });
  });

  it("attaches inline VAL_ enum tables", () => {
    const mux = db.messages.get(809)!.signals.find((s) => s.name === "MuxCode")!;
    expect(mux.values).toEqual({ 0: "CAN_LEVEL", 2: "OBD_STEUER", 3: "MD_NORM" });
  });

  it("resolves VAL_ by table-name reference", () => {
    const key = db.messages.get(200)!.signals[0]!;
    expect(key.values).toEqual({ 0: "Off", 1: "On" });
  });

  it("attaches CM_ comments at every scope", () => {
    expect(db.messages.get(790)!.signals[0]!.comment).toMatch(/N_ENG/);
    expect(db.messages.get(339)?.comment).toMatch(/vehicle speed/);
    expect(db.nodes.find((n) => n.name === "DME")?.comment).toBe("Engine management.");
  });

  it("identifies multiplex selectors + variants", () => {
    const dme2 = db.messages.get(809)!;
    const sel = dme2.signals.find((s) => s.name === "MuxCode")!;
    const v = dme2.signals.find((s) => s.name === "CanLevelInfo")!;
    expect(sel.multiplex).toBe("selector");
    expect(v.multiplex).toEqual({ value: 0 });
  });

  it("captures attribute definitions + values", () => {
    expect(db.attrDefs.get("GenMsgCycleTime")?.type.kind).toBe("int");
    expect(db.attrDefs.get("GenMsgCycleTime")?.default).toBe(0);
    expect(db.messages.get(790)?.attributes?.GenMsgCycleTime).toBe(10);
    expect(db.messages.get(339)?.attributes?.GenMsgCycleTime).toBe(20);
    expect(
      db.messages.get(790)?.signals.find((s) => s.name === "RPM")?.attributes
        ?.GenSigStartValue,
    ).toBe(4480);
  });

  it("supports Motorola signals (no exception)", () => {
    const big = db.messages.get(100)!;
    expect(big.signals.map((s) => s.endian)).toEqual(["motorola", "motorola"]);
  });
});

describe("readBitsLe", () => {
  it("reads a single byte", () => {
    expect(readBitsLe(new Uint8Array([0xAB]), 0, 8)).toBe(0xAB);
  });
  it("reads a sub-byte field at non-zero start", () => {
    expect(readBitsLe(new Uint8Array([0x57]), 3, 5)).toBe(0b01010);
  });
  it("reads a 13-bit field straddling two bytes", () => {
    /* raw 0x1234 = 0001 0010 0011 0100
       low 5 bits = 0b10100 = 20 → byte 1 = 20 << 3 = 0xA0
       upper 8 = 0x91 → byte 2 = 0x91 */
    expect(readBitsLe(new Uint8Array([0, 0xA0, 0x91]), 11, 13)).toBe(0x1234);
  });
});

describe("readBitsBe", () => {
  it("reads a single byte (MSB-aligned)", () => {
    /* Motorola start=7, length=8 → byte 0 bits 7..0 = full byte. */
    expect(readBitsBe(new Uint8Array([0xAB]), 7, 8)).toBe(0xAB);
  });
  it("reads a 16-bit BE word across bytes 0+1", () => {
    /* start=7, length=16 → byte 0 bits 7..0, byte 1 bits 7..0.
       Bytes [0x12, 0x34] → value 0x1234. */
    expect(readBitsBe(new Uint8Array([0x12, 0x34]), 7, 16)).toBe(0x1234);
  });
  it("reads a 4-bit field that doesn't cross a byte boundary", () => {
    /* start=7, length=4 → top nibble of byte 0. 0xA5 → 0xA. */
    expect(readBitsBe(new Uint8Array([0xA5]), 7, 4)).toBe(0xA);
  });
  it("reads a 5-bit field crossing a byte boundary", () => {
    /* start=2 (byte 0 bit 2), length=5: byte 0 bits 2..0 (3 bits) +
       byte 1 bits 7..6 (2 bits).
       bytes [0x05, 0xC0] → bits 2..0 of 0x05 = 0b101, bits 7..6 of
       0xC0 = 0b11. Total = 0b10111 = 0x17. */
    expect(readBitsBe(new Uint8Array([0x05, 0xC0]), 2, 5)).toBe(0x17);
  });
});

describe("signExtend", () => {
  it("leaves positives untouched", () => {
    expect(signExtend(5, 4)).toBe(5);
  });
  it("flips sign on negative 4-bit values", () => {
    expect(signExtend(0xF, 4)).toBe(-1);
    expect(signExtend(0x8, 4)).toBe(-8);
  });
  it("handles 10-bit signed (AX/AY_REF)", () => {
    expect(signExtend(0x3FF, 10)).toBe(-1);
    expect(signExtend(0x200, 10)).toBe(-512);
  });
});

describe("compileDbc", () => {
  const compiled = compileDbcText(SAMPLE);
  const decoderFor = (name: string) => compiled.decoders.find((d) => d.id === name)!;
  const frame = (id: number, bytes: number[]): CanFrame => {
    const data = new Uint8Array(8);
    for (let i = 0; i < bytes.length && i < 8; i++) data[i] = bytes[i]!;
    return { id, data };
  };

  it("decodes Intel RPM at idle (~700)", () => {
    expect(decoderFor("RPM").decode(frame(790, [0, 0, 0x80, 0x11]))).toBe(700);
  });

  it("returns boolean for length-1 unitless signals", () => {
    expect(decoderFor("KeyOn").decode(frame(790, [0x01]))).toBe(true);
    expect(decoderFor("KeyOn").decode(frame(790, [0x00]))).toBe(false);
  });

  it("applies scale + offset (vehicle speed at 100 km/h)", () => {
    /* raw = (100 + 22) / 0.0625 = 1952 = 0x7A0
       low 5 bits = 0 → byte 1 = 0; high 8 = 0x3D → byte 2 = 0x3D */
    expect(decoderFor("Speed").decode(frame(339, [0, 0, 0x3D]))).toBe(100);
  });

  it("sign-extends signed signals", () => {
    expect(decoderFor("SignedAccel").decode(frame(339, [0, 0, 0, 0xFF, 0x03]))).toBe(-1);
  });

  it("decodes Motorola 16-bit BE", () => {
    /* BeWord at start=7, length=16: bytes 0+1 in BE. */
    expect(decoderFor("BeWord").decode(frame(100, [0x12, 0x34]))).toBe(0x1234);
  });

  it("sign-extends Motorola signed signals + applies scale", () => {
    /* BeSigned at start=23 (byte 2 bit 7), length=16, signed.
       bytes 2+3 in BE = 0xFFFF = -1, × 0.01 = -0.01 */
    expect(decoderFor("BeSigned").decode(frame(100, [0, 0, 0xFF, 0xFF]))).toBeCloseTo(-0.01, 4);
  });

  it("filters multiplexed variants by selector value", () => {
    const canLevel = decoderFor("CanLevelInfo");
    const obdSteuer = decoderFor("ObdSteuerInfo");
    /* MuxCode at start=22 length=2 → byte 2 bits 6-7. */
    expect(canLevel.decode(frame(809, [0, 0, 0x1A]))).toBe(0x1A);
    expect(obdSteuer.decode(frame(809, [0, 0, 0x1A]))).toBeNull();
    /* selector = 2 → byte 2 high bits = 0b10 = 0x80. */
    expect(canLevel.decode(frame(809, [0, 0, 0x80 | 0x1A]))).toBeNull();
    expect(obdSteuer.decode(frame(809, [0, 0, 0x80 | 0x1A]))).toBe(0x1A);
  });

  it("returns null for unrelated CAN IDs", () => {
    expect(decoderFor("RPM").decode(frame(0x123, [0, 0]))).toBeNull();
  });

  it("derives rateHz from GenMsgCycleTime attribute", () => {
    /* 10 ms cycle → 100 Hz. */
    expect(decoderFor("RPM").rateHz).toBe(100);
    /* 20 ms cycle → 50 Hz. */
    expect(decoderFor("Speed").rateHz).toBe(50);
  });

  it("populates signalsByName + messagesById indices", () => {
    expect(compiled.signalsByName.has("RPM")).toBe(true);
    expect(compiled.messagesById.get(339)?.name).toBe("ASC1");
  });
});
