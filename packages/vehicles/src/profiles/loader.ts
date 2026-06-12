/**
 * VFS-aware profile loader. Reads a `.dbc` + `.overlay.json` pair
 * from any `VirtualDirectory` and composes them into a runtime
 * `VehicleProfile` + UI metadata.
 *
 * The same code path serves three scenarios:
 *
 *   • **Bundled** — DASHX ships a few canonical profiles at
 *     `apps/web/public/profiles/`. The web app wraps them with
 *     `HttpDirectory` and loads at boot.
 *   • **User folder (FSA)** — the Settings dialog calls
 *     `navigator.showDirectoryPicker()` for a folder containing
 *     custom `.dbc` + `.overlay.json` files; that's wrapped in
 *     `FsaDirectory`.
 *   • **In-memory (testing)** — pass any `VirtualDirectory`
 *     implementation; the loader doesn't care where the bytes
 *     come from.
 *
 * Convention: the overlay declares its companion DBC via
 * `source: "<filename>"`. When `source` is absent, the loader
 * looks for a sibling file with the overlay's basename and a
 * `.dbc` extension.
 */

import type { VirtualDirectory } from "@emdzej/bimmerz-vfs";
import { parseDbc } from "../dbc/parser.js";
import { compileDbc, type CompiledDbc } from "../dbc/compiler.js";
import { composeProfile, type ComposedProfile } from "../overlay/loader.js";
import type { Overlay } from "../overlay/types.js";

/** Options for `loadProfileFromVfs`. */
export interface LoadProfileOptions {
  /** Directory holding the `.dbc` + `.overlay.json` pair. */
  root: VirtualDirectory;
  /** Overlay filename within `root`. Default: `"profile.overlay.json"`. */
  overlayName?: string;
  /** DBC filename override. When set, ignores the overlay's `source`. */
  dbcName?: string;
}

/** Resolve, fetch, parse, and compose a profile from a VFS root. */
export async function loadProfileFromVfs(
  options: LoadProfileOptions,
): Promise<ComposedProfile> {
  const overlayName = options.overlayName ?? "profile.overlay.json";
  const overlayFile = await options.root.file(overlayName);
  if (!overlayFile) {
    throw new Error(`Overlay file not found: ${overlayName}`);
  }
  const overlayJson = await readAsText(overlayFile);
  let overlay: Overlay;
  try {
    overlay = JSON.parse(overlayJson) as Overlay;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid overlay JSON (${overlayName}): ${msg}`);
  }

  const dbcName =
    options.dbcName ??
    overlay.source ??
    overlayName.replace(/\.overlay\.json$/i, ".dbc");
  const dbcFile = await options.root.file(dbcName);
  if (!dbcFile) {
    throw new Error(`DBC file not found: ${dbcName}`);
  }
  const dbcText = await readAsText(dbcFile);
  let compiled: CompiledDbc;
  try {
    compiled = compileDbc(parseDbc(dbcText));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to compile DBC (${dbcName}): ${msg}`);
  }

  return composeProfile(compiled, overlay);
}

/** Load a single profile bundled with the web app, served from
 *  `<base>/profiles/<id>/`. Wraps `HttpDirectory` so we don't
 *  reach for `fetch` directly here. */
export async function loadBundledProfile(
  httpRoot: VirtualDirectory,
  id: string,
): Promise<ComposedProfile> {
  const subdir = await httpRoot.dir(id);
  if (!subdir) {
    throw new Error(`Bundled profile not found: ${id}`);
  }
  return loadProfileFromVfs({ root: subdir });
}

/** Decode a `VirtualFile` as UTF-8 text. */
async function readAsText(file: { arrayBuffer(): Promise<ArrayBuffer> }): Promise<string> {
  const buf = await file.arrayBuffer();
  return new TextDecoder("utf-8").decode(buf);
}
