/**
 * Compose a compiled DBC + an overlay JSON into a runtime
 * `VehicleProfile` ready to plug into `connection.svelte.ts`.
 *
 * Composition pipeline (in order):
 *
 *   1. Start with every decoder from `compiledDbc.decoders`.
 *   2. Apply per-signal `overrides` — label/unit/description rewrites,
 *      `hidden` flags, group ids, alias renames, widget hints.
 *   3. Wrap derived signals from `overlay.derived` as `SignalDecoder`s
 *      whose `decode()` reads the current scope, runs the compiled
 *      expression, and returns the result.
 *   4. Concatenate into the profile's signal list.
 *
 * Derived decoders are special: they don't read from a single
 * `frame.id` because their inputs come from many frames already
 * decoded into `app.signals`. The reactive layer is responsible for
 * RE-evaluating derived signals whenever any of their referenced
 * primitives mutates. The decoder here is a no-op for incoming
 * frames; recomputation is driven by a separate hook below.
 */

import type {
  CanFrame,
  SignalDecoder,
  SignalValue,
  VehicleProfile,
} from "@emdzej/dashx-can-decoder";
import type { CompiledDbc } from "../dbc/compiler.js";
import { compileExpression, type ExprScope } from "./expr.js";
import type {
  Overlay,
  OverlayDerived,
  OverlaySignalOverride,
  WidgetKind,
} from "./types.js";

/** Decoder metadata not on the base `SignalDecoder` — surfaced to
 *  the Dashboard layer for UI rendering decisions. */
export interface SignalMetadata {
  id: string;
  description?: string;
  group?: string;
  hidden?: boolean;
  widget?: WidgetKind;
  fractionDigits?: number;
  min?: number;
  max?: number;
  redline?: number;
  lampVariant?: "danger" | "warn" | "info";
  values?: Record<number, string>;
}

/** Result of composing DBC + overlay. */
export interface ComposedProfile {
  /** Ready-to-use VehicleProfile. */
  profile: VehicleProfile;
  /** Per-signal UI metadata, keyed by signal id. */
  metadata: Map<string, SignalMetadata>;
  /** Ordered group list (overlay `groups` + a fallback `""` group). */
  groups: ReadonlyArray<{ id: string; label: string; order: number; description?: string }>;
  /** Derived-signal recomputers. The dashboard's reactive layer
   *  calls these whenever an input mutates (or on every tick) to
   *  refresh derived values. */
  recomputeDerived(scope: ExprScope, sink: (id: string, value: SignalValue) => void): void;
}

/** Compose a DBC + overlay into a fully-wired VehicleProfile. */
export function composeProfile(
  compiledDbc: CompiledDbc,
  overlay: Overlay,
): ComposedProfile {
  const meta = new Map<string, SignalMetadata>();

  /* Index overrides by DBC signal name for O(1) lookup. */
  const overrideByName = new Map<string, OverlaySignalOverride>();
  for (const ov of overlay.overrides ?? []) {
    overrideByName.set(ov.signal, ov);
  }

  const decoders: SignalDecoder<SignalValue>[] = [];

  /* Pass 1: DBC decoders + overrides. */
  for (const baseDec of compiledDbc.decoders) {
    const dbcSig = compiledDbc.signalsByName.get(baseDec.id);
    const ov = overrideByName.get(baseDec.id);
    const finalId = ov?.alias ?? baseDec.id;
    const label = ov?.label ?? baseDec.label;
    const unit = ov?.unit ?? baseDec.unit;

    const decoder: SignalDecoder<SignalValue> = {
      id: finalId,
      label,
      unit,
      canId: baseDec.canId,
      rateHz: baseDec.rateHz,
      /* If aliasing, wrap so the alias gets the same value. */
      decode: ov?.alias
        ? (f: CanFrame) => baseDec.decode(f)
        : baseDec.decode,
    };
    decoders.push(decoder);

    meta.set(finalId, {
      id: finalId,
      description: ov?.description ?? dbcSig?.comment,
      group: ov?.group,
      hidden: ov?.hidden,
      widget: ov?.widget,
      fractionDigits: ov?.fractionDigits,
      min: ov?.min,
      max: ov?.max,
      redline: ov?.redline,
      values: dbcSig?.values,
    });
  }

  /* Pass 2: compile derived expressions, wrap as inert decoders.
     These decoders never produce a value on frame ingress —
     `decode()` always returns null. The reactive layer drives
     them via `recomputeDerived` below. */
  const compiled: Array<{ d: OverlayDerived; e: ReturnType<typeof compileExpression> }> = [];
  for (const d of overlay.derived ?? []) {
    const expr = compileExpression(d.expr);
    compiled.push({ d, e: expr });
    decoders.push({
      id: d.id,
      label: d.label,
      unit: d.unit,
      canId: -1, // sentinel — never matches a real frame
      decode: () => null,
    });
    meta.set(d.id, {
      id: d.id,
      description: d.description,
      group: d.group,
      widget: d.widget,
      fractionDigits: d.fractionDigits,
      min: d.min,
      max: d.max,
      lampVariant: d.lampVariant,
    });
  }

  /* Ordered group list — overlay groups first (in order), then a
     fallback empty group for anything ungrouped. */
  const groups = (overlay.groups ?? [])
    .map((g, i) => ({ id: g.id, label: g.label, order: g.order ?? (i * 100), description: g.description }))
    .sort((a, b) => a.order - b.order);
  if (!groups.some((g) => g.id === "")) {
    groups.push({ id: "", label: "Other", order: 9999, description: undefined });
  }

  const profile: VehicleProfile = {
    id: overlay.profile.id,
    label: overlay.profile.label,
    bitrate: overlay.profile.bitrate,
    signals: decoders,
  };

  return {
    profile,
    metadata: meta,
    groups,
    recomputeDerived(scope, sink) {
      for (const { d, e } of compiled) {
        const v = e.evaluate(scope);
        if (v !== null) sink(d.id, v);
      }
    },
  };
}

/** Convenience: parse the overlay JSON string + compose. */
export function composeProfileFromJson(
  compiledDbc: CompiledDbc,
  overlayJson: string,
): ComposedProfile {
  const overlay = JSON.parse(overlayJson) as Overlay;
  return composeProfile(compiledDbc, overlay);
}
