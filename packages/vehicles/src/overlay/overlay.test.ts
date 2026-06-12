import { describe, expect, it } from "vitest";
import type { CanFrame, SignalValue } from "@emdzej/dashx-can-decoder";
import { compileDbcText } from "../dbc/compiler.js";
import { compileExpression } from "./expr.js";
import { composeProfile, composeProfileFromJson } from "./loader.js";
import type { Overlay } from "./types.js";

const DBC = `
VERSION ""
BU_: DME DSC

BO_ 790 DME1: 8 DME
   SG_ ENGINE_RPM : 16|16@1+ (0.15625,0) [0|7000] "RPM" Vector__XXX

BO_ 339 ASC1: 8 DSC
   SG_ VSS_RAW : 11|13@1+ (1,0) [0|8191] "" DME
   SG_ CRUISE_STATE : 24|3@1+ (1,0) [0|7] "" DME
`;

describe("compileExpression", () => {
  it("evaluates arithmetic + operators", () => {
    const e = compileExpression("(A + B) * 2 - 1");
    expect(e.evaluate({ A: 3, B: 4 })).toBe(13);
  });
  it("supports comparison + ternary", () => {
    const e = compileExpression("x > 0 ? x : 0");
    expect(e.evaluate({ x: 5 })).toBe(5);
    expect(e.evaluate({ x: -3 })).toBe(0);
  });
  it("supports clamp + max + abs", () => {
    expect(compileExpression("clamp(x, 0, 100)").evaluate({ x: 150 })).toBe(100);
    expect(compileExpression("clamp(x, 0, 100)").evaluate({ x: -10 })).toBe(0);
    expect(compileExpression("max(0, x)").evaluate({ x: -5 })).toBe(0);
    expect(compileExpression("abs(x)").evaluate({ x: -7 })).toBe(7);
  });
  it("recognises hex literals", () => {
    expect(compileExpression("0x160").evaluate({})).toBe(352);
  });
  it("supports logical + boolean conversion", () => {
    expect(compileExpression("STATE != 0").evaluate({ STATE: 3 })).toBe(true);
    expect(compileExpression("STATE != 0").evaluate({ STATE: 0 })).toBe(false);
  });
  it("returns null when any referenced signal is null/undefined", () => {
    const e = compileExpression("RPM + 1");
    expect(e.evaluate({ RPM: null })).toBeNull();
    expect(e.evaluate({})).toBeNull();
  });
  it("returns null on divide-by-zero / non-finite", () => {
    expect(compileExpression("1 / 0").evaluate({})).toBeNull();
  });
  it("rejects suspiciously long inputs", () => {
    const huge = "1+".repeat(3000) + "1";
    expect(() => compileExpression(huge)).toThrow(/too long/);
  });
  it("collects referenced variable names (excluding builtins)", () => {
    const e = compileExpression("max(0, (VSS_RAW - 0x160) * 0.0625)");
    expect([...e.references]).toEqual(["VSS_RAW"]);
  });
});

describe("composeProfile", () => {
  const compiled = compileDbcText(DBC);
  const overlay: Overlay = {
    profile: { id: "test", label: "Test", bitrate: 500_000 },
    overrides: [
      { signal: "VSS_RAW", hidden: true, label: "Speed raw" },
      { signal: "ENGINE_RPM", widget: "gauge", min: 0, max: 7000, redline: 6500 },
    ],
    derived: [
      {
        id: "VEHICLE_SPEED",
        label: "Speed",
        unit: "km/h",
        expr: "max(0, (VSS_RAW - 0x160) * 0.0625)",
        description: "DSC speed clamped to non-negative.",
        widget: "value",
        fractionDigits: 0,
        group: "dsc",
      },
      {
        id: "CRUISE_ACTIVE",
        label: "Cruise on",
        unit: "",
        expr: "CRUISE_STATE != 0",
        widget: "lamp",
        lampVariant: "info",
      },
    ],
    groups: [
      { id: "dsc", label: "DSC", order: 200 },
      { id: "dme", label: "DME", order: 100 },
    ],
  };

  const composed = composeProfile(compiled, overlay);

  it("emits a VehicleProfile with bitrate + id + label", () => {
    expect(composed.profile.id).toBe("test");
    expect(composed.profile.label).toBe("Test");
    expect(composed.profile.bitrate).toBe(500_000);
  });

  it("includes every DBC decoder + every derived decoder", () => {
    const ids = composed.profile.signals.map((s) => s.id);
    expect(ids).toContain("ENGINE_RPM");
    expect(ids).toContain("VSS_RAW");
    expect(ids).toContain("CRUISE_STATE");
    expect(ids).toContain("VEHICLE_SPEED");
    expect(ids).toContain("CRUISE_ACTIVE");
  });

  it("applies overrides to signal labels", () => {
    const vss = composed.profile.signals.find((s) => s.id === "VSS_RAW")!;
    expect(vss.label).toBe("Speed raw");
  });

  it("captures widget + gauge metadata", () => {
    const rpmMeta = composed.metadata.get("ENGINE_RPM");
    expect(rpmMeta?.widget).toBe("gauge");
    expect(rpmMeta?.min).toBe(0);
    expect(rpmMeta?.max).toBe(7000);
    expect(rpmMeta?.redline).toBe(6500);
  });

  it("marks overridden signals as hidden", () => {
    expect(composed.metadata.get("VSS_RAW")?.hidden).toBe(true);
  });

  it("sorts groups by order field", () => {
    expect(composed.groups.map((g) => g.id)).toEqual(["dme", "dsc", ""]);
  });

  it("derived decoders are inert on frame ingress", () => {
    const f: CanFrame = { id: 339, data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]) };
    const speed = composed.profile.signals.find((s) => s.id === "VEHICLE_SPEED")!;
    expect(speed.decode(f)).toBeNull();
    expect(speed.canId).toBe(-1);
  });

  it("recomputeDerived runs every derived expression and sinks the result", () => {
    /* VSS_RAW = 0x1000 (4096) → max(0, (4096 − 352) * 0.0625) = 234 km/h */
    const scope = { VSS_RAW: 0x1000, CRUISE_STATE: 3 };
    const out: Record<string, SignalValue> = {};
    composed.recomputeDerived(scope, (id, v) => { out[id] = v; });
    expect(out.VEHICLE_SPEED).toBe(234);
    expect(out.CRUISE_ACTIVE).toBe(true);
  });

  it("recomputeDerived skips signals when an input is null", () => {
    const out: Record<string, SignalValue> = {};
    composed.recomputeDerived({ VSS_RAW: null, CRUISE_STATE: 0 }, (id, v) => { out[id] = v; });
    expect(out).not.toHaveProperty("VEHICLE_SPEED");
    expect(out.CRUISE_ACTIVE).toBe(false);
  });
});

describe("composeProfileFromJson", () => {
  it("parses + composes from a JSON string", () => {
    const overlay = JSON.stringify({
      profile: { id: "j", label: "J", bitrate: 500_000 },
      derived: [
        { id: "DBL", label: "Double", unit: "", expr: "ENGINE_RPM * 2" },
      ],
    });
    const composed = composeProfileFromJson(compileDbcText(DBC), overlay);
    expect(composed.profile.signals.find((s) => s.id === "DBL")).toBeDefined();
  });
});
