import type { SignalValue, VehicleProfile } from "@emdzej/dashx-can-decoder";
import { findProfile, type ComposedProfile, type SignalMetadata } from "@emdzej/dashx-vehicles";
import { loadConfig, type WebConfig } from "./config";

export type AppView = "dashboard";

export type ConnectionStatus =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "error"; message: string };

interface AppState {
  view: AppView;
  config: WebConfig;
  /** Resolved from `config.vehicle` — driven by Settings picker. */
  profile: VehicleProfile | null;
  /** When the active profile came from a DBC + overlay (vs an
   *  inline TS profile), this holds the composed result — including
   *  per-signal UI metadata + the derived-signal recomputer. Null
   *  for inline TS profiles. */
  dbcProfile: ComposedProfile | null;
  /** UI metadata for the active profile, keyed by signal id. For
   *  inline TS profiles this is empty (widgets fall back to their
   *  own `app.signals` keys + per-widget tooltip lookup). For DBC
   *  profiles this drives the dashboard layout dynamically. */
  signalMeta: Map<string, SignalMetadata>;
  /** Connection state surfaced to the header + the dashboard. */
  status: ConnectionStatus;
  /** Last decoded broadcast signals — keyed by `SignalDecoder.id`. */
  signals: Record<string, SignalValue | null>;
  /** Last decoded OBD-II Mode 01 PID values — keyed by `Obd2Pid.id`
   *  (e.g. `"OBD2_BATTERY_VOLTAGE"`). Disjoint from `signals` so a
   *  PID and a broadcast signal with overlapping semantics (RPM,
   *  coolant) can co-exist without one overwriting the other. */
  obd2: Record<string, number>;
  /** Mirrored from `Obd2Client.stats` — drives the diagnostic badge
   *  in the OBD-II dashboard section. Lets the user see at a glance
   *  whether TX is reaching the wire and whether the DME answers. */
  obd2Stats: {
    txCount: number;
    rxCount: number;
    timeoutCount: number;
    lastError: string | null;
    lastTxAt: number;
    lastRxAt: number;
  };
  /** Most-recent frames first; bounded ring buffer (cap in connection.svelte). */
  frames: { ts: number; id: number; ext?: boolean; rtr?: boolean; data: Uint8Array }[];
  /** Whether the Settings dialog is open. */
  showSettings: boolean;
  /** Whether the About dialog is open. */
  showAbout: boolean;
  /** Last error surfaced as a banner; null clears. */
  error: string | null;
}

const initialConfig = loadConfig();

export const app = $state<AppState>({
  view: "dashboard",
  config: initialConfig,
  profile: findProfile(initialConfig.vehicle) ?? null,
  dbcProfile: null,
  signalMeta: new Map(),
  status: { kind: "disconnected" },
  signals: {},
  obd2: {},
  obd2Stats: {
    txCount: 0,
    rxCount: 0,
    timeoutCount: 0,
    lastError: null,
    lastTxAt: 0,
    lastRxAt: 0,
  },
  frames: [],
  showSettings: false,
  showAbout: false,
  error: null,
});
