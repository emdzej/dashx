/**
 * DBC + overlay profile registry. Loads the bundled `.dbc` +
 * `.overlay.json` pairs from `/profiles/<id>/` on first access and
 * caches the compiled `ComposedProfile`. Also exposes a hook for
 * adding user-loaded profiles via the Settings dialog's folder
 * picker (FSA-backed `VirtualDirectory`).
 *
 * Coexists with the hand-written TS profiles in
 * `@emdzej/dashx-vehicles`. The Settings vehicle dropdown lists
 * BOTH so users can A/B them frame-by-frame.
 */

import { HttpDirectory, type VirtualDirectory } from "@emdzej/bimmerz-vfs";
import {
  composeProfile,
  loadProfileFromVfs,
  parseDbc,
  compileDbc,
  type ComposedProfile,
} from "@emdzej/dashx-vehicles";

/** Bundled DBC profile manifest. Keyed by stable id; the value is
 *  the folder name under `apps/web/public/profiles/` AND the file
 *  basename (e.g. `bmw-e46-ms43.dbc` + `bmw-e46-ms43.overlay.json`). */
const BUNDLED: Record<string, { folder: string; basename: string }> = {
  "bmw-e46-ms43-dbc": { folder: "bmw-e46-ms43", basename: "bmw-e46-ms43" },
  "bmw-e46-ms42-dbc": { folder: "bmw-e46-ms42", basename: "bmw-e46-ms42" },
};

export const BUNDLED_DBC_IDS = Object.keys(BUNDLED);

/* Per-id load promise. Reusing the promise (not the result) lets
   multiple concurrent callers share a single fetch. */
const loadPromises = new Map<string, Promise<ComposedProfile>>();

/** Load (and cache) a bundled DBC profile by id. */
export function loadBundledDbcProfile(id: string): Promise<ComposedProfile> {
  const cached = loadPromises.get(id);
  if (cached) return cached;
  const entry = BUNDLED[id];
  if (!entry) {
    return Promise.reject(new Error(`Unknown bundled DBC profile id: ${id}`));
  }
  /* HttpDirectory walks an `index.json` manifest per folder. Each
     profile folder ships its own index alongside the .dbc + .json.
     The URL is relative to document.baseURI so the embedded build's
     `/dashx/profiles/…` and the dev server's `/profiles/…` both
     resolve correctly without manual base-prefixing. */
  const baseUrl = new URL(`profiles/${entry.folder}/`, document.baseURI).href;
  const root = new HttpDirectory(baseUrl);
  const p = loadProfileFromVfs({
    root,
    overlayName: `${entry.basename}.overlay.json`,
  }).catch((err) => {
    /* Don't poison the cache on transient failure — drop the
       promise so the next caller retries. */
    loadPromises.delete(id);
    throw err;
  });
  loadPromises.set(id, p);
  return p;
}

/** Load a user-supplied profile from any `VirtualDirectory` —
 *  typically an `FsaDirectory` from the Settings folder picker.
 *  Caller is responsible for retaining the resulting profile in
 *  state (it isn't cached here — each `FsaDirectory` carries its
 *  own permission grant and is short-lived). */
export function loadUserDbcProfile(
  root: VirtualDirectory,
  overlayName?: string,
): Promise<ComposedProfile> {
  return loadProfileFromVfs({ root, overlayName });
}

/* Re-export the compile helpers so the comparison panel can dump
   raw DBC AST for debugging without re-importing the vehicles
   barrel. */
export { parseDbc, compileDbc, composeProfile };
