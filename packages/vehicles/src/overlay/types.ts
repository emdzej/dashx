/**
 * Overlay JSON schema — companion to a DBC file. Adds metadata and
 * computed signals that pure DBC can't express:
 *
 *   • Friendlier labels + descriptions for widgets.
 *   • Per-signal `hidden`, `groupId`, `widget` hints.
 *   • Derived signals via an expression language over already-decoded
 *     primitives (no JS-runtime escape — see `overlay/expr.ts`).
 *   • UI section grouping for the Dashboard layout.
 *   • Per-DME variant overrides (e.g. moving TQI_MAF_CAN between
 *     B6 / B7 for MS42 vs MS43).
 *
 * The on-disk format is JSON for portability (no yaml dep, works
 * everywhere). YAML support is a future v2 if someone wants
 * comments + multi-line strings.
 */

/** Top-level overlay file. */
export interface Overlay {
  /** Filename of the companion DBC. Resolved against the overlay's
   *  containing directory in a VFS load. Optional — overlays can
   *  carry derived-only data on top of an existing compiled set. */
  source?: string;
  /** Profile metadata. */
  profile: OverlayProfile;
  /** Per-signal overrides on the DBC-compiled set. */
  overrides?: OverlaySignalOverride[];
  /** Derived signals computed via expressions over already-decoded
   *  signal values. Evaluated after the DBC pass, in declaration
   *  order — later expressions can reference earlier derived ones. */
  derived?: OverlayDerived[];
  /** Optional UI section grouping. */
  groups?: OverlayGroup[];
  /** Free-text description for the profile picker tooltip. */
  description?: string;
}

export interface OverlayProfile {
  /** Stable profile id (`"bmw-e46-ms43"`, …). */
  id: string;
  /** Human label in the picker. */
  label: string;
  /** Bus bitrate. Must match the DBC's bus. */
  bitrate: 10_000 | 20_000 | 50_000 | 100_000 | 125_000 | 250_000 | 500_000 | 800_000 | 1_000_000;
}

export interface OverlaySignalOverride {
  /** DBC signal name to modify. */
  signal: string;
  /** Override the human label shown in widgets. */
  label?: string;
  /** Override the unit string. */
  unit?: string;
  /** Hide from the dashboard (still decoded, available to derived). */
  hidden?: boolean;
  /** Tooltip description. Falls back to the DBC `CM_ SG_` comment. */
  description?: string;
  /** Suggested widget kind. */
  widget?: WidgetKind;
  /** Decimal places for value display (ValueWidget). */
  fractionDigits?: number;
  /** Group id (must match a `groups[].id`). */
  group?: string;
  /** Min/max override for bars + gauges. */
  min?: number;
  max?: number;
  /** Optional redline (gauge). */
  redline?: number;
  /** Override the public id (rare — used when the DBC signal name
   *  collides with an existing app-level identifier). */
  alias?: string;
}

export interface OverlayDerived {
  /** Stable id for the derived signal — used as widget binding key. */
  id: string;
  /** Human label. */
  label: string;
  /** Unit suffix. */
  unit: string;
  /** Pure expression over already-decoded signal ids + math builtins.
   *  Grammar: `expr-eval` subset — see `overlay/expr.ts`. */
  expr: string;
  /** Tooltip description. */
  description?: string;
  /** Suggested widget. */
  widget?: WidgetKind;
  /** Decimal places for ValueWidget. */
  fractionDigits?: number;
  /** Group id. */
  group?: string;
  /** Min/max/redline for bars + gauges. */
  min?: number;
  max?: number;
  /** Lamp variant for boolean derived signals. */
  lampVariant?: "danger" | "warn" | "info";
}

export interface OverlayGroup {
  /** Stable group id (referenced by `overrides[].group` / `derived[].group`). */
  id: string;
  /** Section header text. */
  label: string;
  /** Optional ordering — groups sort ascending by `order` (default 100). */
  order?: number;
  /** Group description, surfaced as hover/tooltip on the section header. */
  description?: string;
}

export type WidgetKind = "value" | "bar" | "gauge" | "lamp";
