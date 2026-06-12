/**
 * `Obd2Client` — request/response over a `CanTransport`.
 *
 * Supports two modes:
 *
 *   1. **Passive sniff** — `onValue` fires whenever a 0x7E8-class
 *      frame carrying a Mode 01 single-frame response arrives,
 *      regardless of who sent the request. Useful when a different
 *      scan tool is polling and DASHX wants to ride along.
 *
 *   2. **Active poll** — `startPolling([pid, …], intervalMs)` sends
 *      requests on a round-robin schedule and surfaces responses
 *      the same way. The poller serialises requests through a single
 *      in-flight queue with a per-request timeout — there's a single
 *      outstanding request at a time, which keeps the protocol
 *      well-formed even on cars where the DME can't keep up with
 *      back-to-back requests.
 *
 * Both modes feed into the same `onValue(id, value, unit, raw)`
 * callback so the consuming layer (DASHX's reactive state) doesn't
 * need to care which path produced the value.
 */

import type { TimestampedCanFrame } from "@emdzej/dashx-can-decoder";
import type { CanTransport } from "@emdzej/dashx-can-transport";
import {
  OBD2_BROADCAST_REQUEST_ID,
  decodeMode01Response,
  encodeMode01Request,
} from "./isotp.js";
import { findPid, type Obd2Pid } from "./pids.js";

/** Callback fired when a Mode 01 response is decoded. */
export type Obd2ValueHandler = (event: {
  pid: Obd2Pid;
  /** Decoded scalar value (`pid.decode(data)`). */
  value: number;
  /** Monotonic timestamp of the response frame (µs). */
  ts: number;
  /** Raw 4-byte response data slice. */
  raw: Uint8Array;
}) => void;

export interface Obd2ClientOptions {
  transport: CanTransport;
  /**
   * Request CAN ID. Default `0x7DF` (functional broadcast). Use
   * `0x7E0` for direct-to-DME on BMW E46. Doesn't affect passive
   * sniffing — only outgoing polls.
   */
  requestId?: number;
  /**
   * Response CAN ID range to accept. Default `[0x7E8, 0x7EF]` —
   * matches the ECU-physical response set. The poller decodes any
   * 11-bit ID in this range carrying a Mode 01 SF.
   */
  responseIdLow?: number;
  responseIdHigh?: number;
  /** Per-request timeout for active polling (ms). Default 250. */
  requestTimeoutMs?: number;
}

export class Obd2Client {
  private readonly transport: CanTransport;
  /** Outgoing request ID — mutable so the UI can toggle between
   *  0x7DF (functional broadcast) and 0x7E0 (DME direct) without
   *  forcing a transport reconnect. */
  private requestId: number;
  private readonly respLow: number;
  private readonly respHigh: number;
  private readonly timeoutMs: number;

  private valueHandlers = new Set<Obd2ValueHandler>();
  private unsubFrames: (() => void) | null = null;

  /* Active-poll state */
  private pollPids: number[] = [];
  private pollIntervalMs = 1000;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCursor = 0;
  private pollInflight: {
    pid: number;
    sentAt: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  /** Diagnostic counters surfaced to the UI so a user can see at a
   *  glance whether TX is reaching the wire and whether the DME is
   *  answering. All bumped synchronously from the relevant hot path. */
  public stats = {
    /** Mode 01 requests TX'd by the active poller. */
    txCount: 0,
    /** Mode 01 responses successfully decoded (passive + active). */
    rxCount: 0,
    /** Active-poll requests that hit `requestTimeoutMs` without a reply. */
    timeoutCount: 0,
    /** Latest transport-level send error message, or null. */
    lastError: null as string | null,
    /** Monotonic timestamp of the last TX (ms, performance.now). */
    lastTxAt: 0,
    /** Monotonic timestamp of the last RX (ms, performance.now). */
    lastRxAt: 0,
  };

  /** Observers notified after every stats mutation. The UI uses this
   *  to drive a reactive counter widget without polling. */
  private statsHandlers = new Set<() => void>();

  constructor(options: Obd2ClientOptions) {
    this.transport = options.transport;
    this.requestId = options.requestId ?? OBD2_BROADCAST_REQUEST_ID;
    this.respLow = options.responseIdLow ?? 0x7E8;
    this.respHigh = options.responseIdHigh ?? 0x7EF;
    this.timeoutMs = options.requestTimeoutMs ?? 250;
  }

  onStats(handler: () => void): () => void {
    this.statsHandlers.add(handler);
    return () => this.statsHandlers.delete(handler);
  }

  /** Change the outgoing request CAN ID without rebuilding the
   *  client. Takes effect on the next poll-cycle TX. */
  setRequestId(id: number): void {
    this.requestId = id;
  }

  private bumpStats(): void {
    for (const h of this.statsHandlers) {
      try { h(); } catch { /* ignore */ }
    }
  }

  /** Subscribe to decoded PID values. Returns an unsubscribe fn. */
  onValue(handler: Obd2ValueHandler): () => void {
    this.valueHandlers.add(handler);
    return () => this.valueHandlers.delete(handler);
  }

  /**
   * Start listening for passive Mode 01 responses on the bus. Safe
   * to call multiple times — second-and-later calls are no-ops.
   * Must be called before `startPolling`.
   */
  start(): void {
    if (this.unsubFrames) return;
    this.unsubFrames = this.transport.onFrame((frame) => {
      this.handleFrame(frame);
    });
  }

  /** Stop both passive listening and active polling. */
  stop(): void {
    this.stopPolling();
    if (this.unsubFrames) {
      this.unsubFrames();
      this.unsubFrames = null;
    }
  }

  /**
   * Start the active poller. `pids` is an ordered list of PID
   * numbers (0x06, 0x07, …); the poller cycles through them at
   * `intervalMs` per request. Calling this while already polling
   * replaces the PID list and resets the cursor.
   */
  startPolling(pids: readonly number[], intervalMs: number): void {
    this.pollPids = [...pids];
    this.pollIntervalMs = Math.max(50, intervalMs);
    this.pollCursor = 0;
    this.start();              // ensure passive RX is wired
    this.stopPollingTimer();   // cancel any in-flight schedule
    this.schedulePoll(0);
  }

  /** Stop active polling (passive listening continues). */
  stopPolling(): void {
    this.pollPids = [];
    this.stopPollingTimer();
    this.cancelInflight();
  }

  private stopPollingTimer(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private cancelInflight(): void {
    if (this.pollInflight) {
      clearTimeout(this.pollInflight.timer);
      this.pollInflight = null;
    }
  }

  private schedulePoll(delayMs: number): void {
    this.stopPollingTimer();
    if (this.pollPids.length === 0) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.sendNextRequest();
    }, delayMs);
  }

  private async sendNextRequest(): Promise<void> {
    if (this.pollPids.length === 0) return;
    if (this.pollInflight) return;

    const pid = this.pollPids[this.pollCursor % this.pollPids.length]!;
    this.pollCursor = (this.pollCursor + 1) % this.pollPids.length;

    const payload = encodeMode01Request(pid);
    const sentAt = performance.now();
    const timer = setTimeout(() => {
      this.pollInflight = null;
      this.stats.timeoutCount++;
      this.bumpStats();
      this.schedulePoll(this.pollIntervalMs);
    }, this.timeoutMs);
    this.pollInflight = { pid, sentAt, timer };

    try {
      await this.transport.send({
        id: this.requestId,
        data: payload,
      });
      this.stats.txCount++;
      this.stats.lastTxAt = sentAt;
      this.stats.lastError = null;
      this.bumpStats();
    } catch (err) {
      /* TX failed — record the cause so the UI can show it, then
         treat like a timeout and move on. */
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      this.bumpStats();
      this.cancelInflight();
      this.schedulePoll(this.pollIntervalMs);
    }
  }

  private handleFrame(frame: TimestampedCanFrame): void {
    if (frame.ext) return;
    if (frame.id < this.respLow || frame.id > this.respHigh) return;

    const decoded = decodeMode01Response(frame.data);
    if (!decoded) return;

    const pidMeta = findPid(decoded.pid);
    if (!pidMeta) return;

    let value: number;
    try {
      value = pidMeta.decode(decoded.data);
    } catch {
      return;
    }

    this.stats.rxCount++;
    this.stats.lastRxAt = performance.now();
    this.bumpStats();

    const ts = performance.now() * 1000;
    const evt = { pid: pidMeta, value, ts, raw: decoded.data };
    for (const h of this.valueHandlers) {
      try { h(evt); } catch { /* handler bugs shouldn't poison the loop */ }
    }

    if (this.pollInflight) {
      clearTimeout(this.pollInflight.timer);
      this.pollInflight = null;
      this.schedulePoll(this.pollIntervalMs);
    }
  }
}
