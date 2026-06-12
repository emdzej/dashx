/**
 * Connection lifecycle — single source of truth for "which transport
 * is open right now". Components call `connect()` / `disconnect()`;
 * everything else flows through reactive `app` state.
 *
 * v1 wires only the RPC transport (matches the embedded build's
 * expectations). The SLCAN factories register here once Phase 2
 * lands.
 *
 * Frame fan-out:
 *
 *   transport.onFrame → run every active decoder for the matching
 *   canId → mutate `app.signals[signal.id]` → widgets re-render
 *   reactively. Frames also push into `app.frames` (bounded ring)
 *   for the FrameLog widget.
 */

import {
  createRpcCanTransport,
  createSerialCanTransport,
  createSlcanWsTransport,
  type CanTransport,
  type WebSerialPortLike,
} from "@emdzej/dashx-can-transport";
import type {
  SignalDecoder,
  SignalValue,
  TimestampedCanFrame,
} from "@emdzej/dashx-can-decoder";
import { Obd2Client, findPidById } from "@emdzej/dashx-can-obd2";
import { app } from "./state.svelte";

const FRAME_LOG_CAP = 500;

let transport: CanTransport | null = null;
let obd2Client: Obd2Client | null = null;
/* Pre-built per-canId index of the active profile's decoders so
   onFrame doesn't linear-scan the signal list every message. Rebuilt
   on profile change. */
let decoderIndex: Map<number, SignalDecoder<SignalValue>[]> = new Map();

function rebuildDecoderIndex(): void {
  const idx = new Map<number, SignalDecoder<SignalValue>[]>();
  const profile = app.profile;
  if (!profile) {
    decoderIndex = idx;
    return;
  }
  for (const signal of profile.signals) {
    const list = idx.get(signal.canId);
    if (list) list.push(signal);
    else idx.set(signal.canId, [signal]);
  }
  decoderIndex = idx;
}

function onFrame(frame: TimestampedCanFrame): void {
  /* Ring buffer for the FrameLog widget. Unshift to keep newest
     first; trim from the tail when the cap is hit. */
  app.frames.unshift({
    ts: frame.ts,
    id: frame.id,
    ext: frame.ext,
    rtr: frame.rtr,
    data: frame.data,
  });
  if (app.frames.length > FRAME_LOG_CAP) {
    app.frames.length = FRAME_LOG_CAP;
  }

  const decoders = decoderIndex.get(frame.id);
  if (!decoders) return;
  for (const signal of decoders) {
    const v = signal.decode(frame);
    if (v !== null) app.signals[signal.id] = v;
  }
}

/**
 * Minimal `navigator.serial` shape DASHX touches. lib.dom doesn't
 * ship Web Serial types, and we don't want a global `@types/*` dep
 * for one global — so we declare just the methods + return type
 * we use. Mirrors the pattern in inpax-web / ncsx-web.
 */
interface WebNavigatorSerial {
  requestPort(options?: {
    filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
  }): Promise<WebSerialPortLike>;
  getPorts(): Promise<WebSerialPortLike[]>;
}

function getNavigatorSerial(): WebNavigatorSerial | null {
  if (typeof navigator === "undefined") return null;
  const serial = (navigator as unknown as { serial?: WebNavigatorSerial }).serial;
  return serial ?? null;
}

/**
 * Web Serial port picker. MUST be called inside a user gesture
 * (Connect button click). Returns null when the user cancels —
 * connect() converts that into a clean disconnect state instead
 * of an error banner.
 */
async function pickWebSerialPort(): Promise<WebSerialPortLike | null> {
  const serial = getNavigatorSerial();
  if (!serial) {
    throw new Error(
      "Web Serial unavailable — use Chrome / Edge / Opera over HTTPS or localhost.",
    );
  }
  try {
    return await serial.requestPort();
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotFoundError") {
      return null; /* user cancelled */
    }
    throw err;
  }
}

/**
 * Build the right transport for the current `app.config.source`.
 * Returns `null` when the user cancelled a port-picker gesture
 * (Web Serial paths only) — the caller treats null as a soft
 * abort and goes back to disconnected without surfacing an error.
 */
async function buildTransport(): Promise<CanTransport | null> {
  switch (app.config.source) {
    case "rpc": {
      const url = app.config.rpcUrl?.trim();
      if (!url) throw new Error("RPC URL not configured");
      return createRpcCanTransport({ url });
    }
    case "serial": {
      const port = await pickWebSerialPort();
      if (!port) return null;
      return createSerialCanTransport({ port });
    }
    case "serial-ws": {
      const url = app.config.serialWsUrl?.trim();
      if (!url) throw new Error("SLCAN-over-WS URL not configured");
      return createSlcanWsTransport({ url });
    }
    default:
      throw new Error(`Unknown source: ${String(app.config.source)}`);
  }
}

export async function connect(): Promise<void> {
  if (!app.profile) {
    app.status = { kind: "error", message: "Pick a vehicle profile in Settings first." };
    return;
  }
  app.status = { kind: "connecting" };
  app.error = null;
  rebuildDecoderIndex();
  try {
    const built = await buildTransport();
    if (!built) {
      /* User cancelled the Web Serial picker — soft abort. */
      app.status = { kind: "disconnected" };
      return;
    }
    transport = built;
    transport.onFrame(onFrame);
    transport.onError((err) => {
      app.status = { kind: "error", message: err.message };
    });
    /* OBD-II layer — passive sniff + optional active polling. The
       client is built BEFORE `transport.open()` so passive RX is
       wired before any frames start flowing. Active polling
       requires the bus to allow TX, so when active is on we open
       in `normal` mode instead of `listen-only`. All transports
       (RPC, SLCAN Web Serial, SLCAN-over-WS) support TX. */
    const wantsActive = app.config.obd2.activePoll &&
      app.config.obd2.pids.length > 0;
    if (app.config.obd2.passiveSniff || wantsActive) {
      obd2Client = new Obd2Client({
        transport,
        /* Honour the user's broadcast-vs-direct choice. `0x7DF`
           is the spec-correct default; `0x7E0` is the picky-DME
           fallback. */
        requestId: app.config.obd2.requestId,
      });
      obd2Client.onValue(({ pid, value }) => {
        app.obd2[pid.id] = value;
      });
      /* Mirror client stats into reactive state so the dashboard
         badge updates in real time without polling. The stats
         object itself is a fresh shape per emit — replacing
         `app.obd2Stats` triggers the $derived in the UI. */
      const client = obd2Client;
      obd2Client.onStats(() => {
        app.obd2Stats = { ...client.stats };
      });
      obd2Client.start();
    }
    await transport.open({
      bitrate: app.profile.bitrate,
      mode: wantsActive ? "normal" : "listen-only",
    });
    if (wantsActive && obd2Client) {
      const pidNums = app.config.obd2.pids
        .map((id) => findPidById(id)?.pid)
        .filter((n): n is number => typeof n === "number");
      obd2Client.startPolling(pidNums, app.config.obd2.pollIntervalMs);
    }
    app.status = { kind: "connected" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    app.status = { kind: "error", message };
    /* Surface the message via the App-level banner too — the
       Retry button's tooltip is hover-only and easy to miss. */
    app.error = message;
    /* Mirror to console so the stack survives a disconnect cycle
       (banner clears on dismiss; console doesn't). */
    if (typeof console !== "undefined") {
      console.error("[dashx] connect failed:", err);
    }
    transport = null;
  }
}

/**
 * Apply OBD-II config changes to a live connection without forcing
 * a reconnect. Toggling the active-poll switch on/off, editing the
 * PID list, or changing the poll interval reach the running client
 * immediately.
 *
 * One caveat: changing from passive to active requires the bus to
 * be in `normal` mode (the transport was opened with that decision
 * at connect time). If the user enabled active polling AFTER
 * connecting in listen-only mode, this function still starts the
 * poller — the TX will fail at the transport layer and the
 * transport's `onError` will surface the cause. We prefer that
 * over silently doing nothing because the alternative is a
 * mysterious "no data" state.
 */
export function applyObd2Config(): void {
  if (!obd2Client) return;
  /* Live-update the request ID so the user can toggle
     0x7DF ↔ 0x7E0 without reconnecting. Takes effect on next TX. */
  obd2Client.setRequestId(app.config.obd2.requestId);
  if (
    app.config.obd2.activePoll &&
    app.config.obd2.pids.length > 0
  ) {
    const pidNums = app.config.obd2.pids
      .map((id) => findPidById(id)?.pid)
      .filter((n): n is number => typeof n === "number");
    obd2Client.startPolling(pidNums, app.config.obd2.pollIntervalMs);
  } else {
    obd2Client.stopPolling();
  }
}

export async function disconnect(): Promise<void> {
  if (obd2Client) {
    obd2Client.stop();
    obd2Client = null;
    app.obd2Stats = {
      txCount: 0,
      rxCount: 0,
      timeoutCount: 0,
      lastError: null,
      lastTxAt: 0,
      lastRxAt: 0,
    };
  }
  if (transport) {
    try {
      await transport.close();
    } catch {
      /* swallow — tearing down */
    }
    transport = null;
  }
  app.status = { kind: "disconnected" };
  /* Don't clear signals immediately — leave the last values on
     screen so the user can read them post-disconnect. They'll
     refresh on the next connect. */
}
