/**
 * localStorage-backed config. Two persisted choices:
 *
 *   - `source`  — which transport to use (SLCAN local / WS / RPC).
 *   - `vehicle` — which `VehicleProfile.id` to surface in the
 *     dashboard. Picked via Settings; defaults to MS43.
 *
 * Plus the source-specific endpoint URLs (server URL for `rpc`,
 * WebSocket URL for the WS SLCAN bridge). The local Web Serial
 * picker doesn't need a persisted URL — the port handle survives
 * via the browser's gesture-attestation mechanism (same as other
 * web apps in the family).
 *
 * BMW K+DCAN cables are intentionally NOT supported — the cable's
 * firmware filters all bus traffic down to the configured ISO-TP
 * IDs and never forwards broadcast frames.
 *
 * In embedded builds `source` is forced to `"rpc"` and the URL is
 * derived from `window.location.origin` at load — see `embedded.ts`.
 */

import { isEmbedded, embeddedEndpoints } from "./embedded";

export type CanSource = "serial" | "serial-ws" | "rpc";

export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

/**
 * Theme choice — matches the ncsx / inpax convention. `"system"`
 * tracks `prefers-color-scheme`; the explicit choices pin the
 * theme regardless of OS preference. Resolved into a boolean by
 * `theme.svelte.ts` before being applied to the `<html>` element.
 */
export type ThemeChoice = "light" | "dark" | "system";

/**
 * OBD-II diagnostic poll config. DASHX always listens passively for
 * Mode 01 responses on 0x7E8-0x7EF (so if another scan tool is
 * polling, we display whatever it asks for). Active polling is
 * opt-in: when `activePoll` is true the client cycles through `pids`
 * at `pollIntervalMs` and broadcasts requests on 0x7DF.
 *
 * `pids` is a list of decoder ids from `@emdzej/dashx-can-obd2`
 * (e.g. `"OBD2_BATTERY_VOLTAGE"`, `"OBD2_STFT_B1"`). Empty disables
 * active polling even when `activePoll` is true.
 */
export interface Obd2Config {
  /** Listen passively for 0x7E8-class responses. Default true. */
  passiveSniff: boolean;
  /** Send our own requests. Default false (no bus impact unless asked). */
  activePoll: boolean;
  /** Per-request interval for the round-robin poller (ms). Default 200. */
  pollIntervalMs: number;
  /** PIDs (by id string) to poll. Default = DEFAULT_BMW_E46_PIDS. */
  pids: string[];
  /**
   * 11-bit CAN ID DASHX uses for outgoing Mode 01 requests.
   *   • 0x7DF — functional broadcast. Any OBD-II ECU on the bus
   *     that supports the requested PID will answer on its own
   *     response ID (0x7E8 for the DME). This is the spec-correct
   *     default and what every scan tool does first.
   *   • 0x7E0 — direct physical to ECU #1 (DME on E46). Some
   *     picky DMEs answer 0x7E0 but ignore 0x7DF — try this if
   *     broadcast goes silent.
   */
  requestId: 0x7DF | 0x7E0;
}

export interface WebConfig {
  /** Which transport to open on Connect. */
  source: CanSource;
  /** Default vehicle profile id (e.g. `"bmw-e46-ms43"`). */
  vehicle: string;
  /** RPC mode: WebSocket URL of the CAN endpoint. */
  rpcUrl?: string;
  /** SLCAN-over-WS mode: ws:// URL of the SLCAN bridge. */
  serialWsUrl?: string;
  /** Light / dark / system. Default `"system"` (matches ncsx). */
  theme: ThemeChoice;
  /** Time window in seconds for widget history charts. Drives the
   *  X-axis range AND the rolling-buffer cap in `useHistory`. */
  chartWindowSec: number;
  /** OBD-II Mode 01 — passive sniff + optional active polling. */
  obd2: Obd2Config;
  /** Persisted bimmerz-logger config. */
  logging?: {
    level?: LogLevel;
    categories?: Record<string, LogLevel>;
  };
}

const STORAGE_KEY = "dashx.web.config.v1";

const DEFAULT_OBD2_PIDS: string[] = [
  "OBD2_BATTERY_VOLTAGE",
  "OBD2_STFT_B1",
  "OBD2_LTFT_B1",
  "OBD2_O2_B1S1_VOLTAGE",
  "OBD2_O2_B1S2_VOLTAGE",
  "OBD2_LAMBDA",
  "OBD2_MAF",
  "OBD2_TIMING_ADVANCE",
  "OBD2_INTAKE_TEMP",
];

const DEFAULT_CONFIG: WebConfig = {
  source: "rpc",
  vehicle: "bmw-e46-ms43",
  rpcUrl: "ws://localhost:8080/rpc/can/0",
  serialWsUrl: "ws://localhost:8081/slcan",
  theme: "system",
  chartWindowSec: 15,
  obd2: {
    passiveSniff: true,
    activePoll: false,
    pollIntervalMs: 200,
    pids: DEFAULT_OBD2_PIDS,
    requestId: 0x7DF,
  },
  logging: { level: "info" },
};

function embeddedOverrides(): Pick<WebConfig, "source" | "rpcUrl"> {
  return {
    source: "rpc",
    rpcUrl: embeddedEndpoints().rpcCanUrl,
  };
}

/**
 * Merge a partial saved config into the defaults. Nested objects
 * (`obd2`, `logging`) need explicit per-key merging — a plain spread
 * would replace the whole sub-object with the persisted partial,
 * dropping any field added in a later release. Schema migration on
 * the cheap.
 */
const VALID_SOURCES: ReadonlySet<CanSource> = new Set([
  "serial",
  "serial-ws",
  "rpc",
]);

function mergeConfig(saved: Partial<WebConfig>): WebConfig {
  const base = structuredClone(DEFAULT_CONFIG);
  /* Top-level scalars + URLs spread directly. */
  const merged: WebConfig = { ...base, ...saved };
  /* Re-merge nested objects so a saved snapshot from before a new
     field was introduced still resolves to a complete default. */
  merged.obd2 = { ...base.obd2, ...(saved.obd2 ?? {}) };
  merged.logging = { ...(base.logging ?? {}), ...(saved.logging ?? {}) };
  /* Migration: clean up retired `source` values (e.g. `kdcan`,
     `kdcan-ws` from the K+DCAN era). Anything not in the current
     valid set falls back to the default. */
  if (!VALID_SOURCES.has(merged.source)) {
    merged.source = base.source;
  }
  return merged;
}

export function loadConfig(): WebConfig {
  if (typeof localStorage === "undefined") {
    return isEmbedded
      ? { ...structuredClone(DEFAULT_CONFIG), ...embeddedOverrides() }
      : structuredClone(DEFAULT_CONFIG);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const base = !raw
      ? structuredClone(DEFAULT_CONFIG)
      : mergeConfig(JSON.parse(raw) as Partial<WebConfig>);
    if (isEmbedded) return { ...base, ...embeddedOverrides() };
    return base;
  } catch {
    return isEmbedded
      ? { ...structuredClone(DEFAULT_CONFIG), ...embeddedOverrides() }
      : structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: WebConfig): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
