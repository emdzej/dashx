/**
 * `@emdzej/dashx-vehicles` — per-vehicle CAN signal tables.
 *
 * v1 ships two BMW E46 profiles (MS42 and MS43) plus the shared
 * decoder library they're built from. Adding a new vehicle is a
 * new file under `src/<vendor>-<chassis>-<variant>.ts` exporting
 * a `VehicleProfile`, plus an entry in `PROFILES` below.
 *
 * Decoders cite their source in `docs/bmw-e46-can-ids.md`. Don't
 * extend the table without adding a citation.
 */

import type { VehicleProfile } from "@emdzej/dashx-can-decoder";
import { bmwE46Ms42 } from "./bmw-e46-ms42.js";
import { bmwE46Ms43 } from "./bmw-e46-ms43.js";

export { bmwE46Ms42, bmwE46Ms43 };
export { describeSignal } from "./descriptions.js";
export * from "./bmw-e46-shared.js";

/* DBC + overlay machinery — alternative to the inline TS profiles.
   Both code paths produce a `VehicleProfile`; the dashboard can
   surface them side-by-side for A/B comparison while the DBC path
   matures. */
export {
  parseDbc,
  type DbcDatabase,
  type DbcMessage,
  type DbcSignal,
  type DbcSign,
  type DbcEndian,
  type DbcMultiplex,
  type DbcAttrDef,
  type DbcAttrType,
} from "./dbc/parser.js";
export {
  compileDbc,
  compileDbcText,
  readBitsLe,
  readBitsBe,
  signExtend,
  type CompiledDbc,
} from "./dbc/compiler.js";
export {
  compileExpression,
  type CompiledExpression,
  type ExprScope,
} from "./overlay/expr.js";
export {
  composeProfile,
  composeProfileFromJson,
  type ComposedProfile,
  type SignalMetadata,
} from "./overlay/loader.js";
export {
  type Overlay,
  type OverlayProfile,
  type OverlaySignalOverride,
  type OverlayDerived,
  type OverlayGroup,
  type WidgetKind,
} from "./overlay/types.js";
export {
  loadProfileFromVfs,
  loadBundledProfile,
  type LoadProfileOptions,
} from "./profiles/loader.js";

/**
 * Ordered list of profiles offered by the picker UI. Order is the
 * default sort — most-likely-used first.
 */
export const PROFILES: readonly VehicleProfile[] = [bmwE46Ms43, bmwE46Ms42];

/** Find a profile by its stable id; `undefined` if no match. */
export function findProfile(id: string): VehicleProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}
