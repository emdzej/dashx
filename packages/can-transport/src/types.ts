import type { CanBitrate, CanFrame, TimestampedCanFrame } from "@emdzej/dashx-can-decoder";

/**
 * Mode the transport opens the bus in. Defaults to `"normal"` —
 * fully participates (will ACK frames). `"listen-only"` is the
 * sniff mode the dashboard wants 99% of the time (no risk of
 * disturbing the bus). `"no-ack"` is rare; useful for debugging
 * a bus where you can't fall into the ACK error state.
 */
export type CanMode = "normal" | "listen-only" | "no-ack";

export interface CanTransportOpenOptions {
  bitrate: CanBitrate;
  /** Default `"listen-only"`. The dashboard is passive by design. */
  mode?: CanMode;
}

/** Returned by `onFrame` / `onError` for caller-side cleanup. */
export type Unsubscribe = () => void;

/**
 * One-of behaviour: a CAN source the web app can drive. All
 * backends — SLCAN over Web Serial, SLCAN over WebSocket, dongle
 * JSON-RPC over WebSocket — normalise
 * to this interface so the UI doesn't branch.
 *
 * Lifecycle:
 *   t.open({ bitrate, mode })   // returns once the bus is up
 *   const off = t.onFrame(fn)   // subscribe
 *   …
 *   off()                       // unsubscribe
 *   t.close()                   // tear down
 *
 * Subscribers MUST be safe to invoke from any context — the
 * dispatcher doesn't queue or order them. Decoders are pure, so
 * fan-out is cheap.
 */
export interface CanTransport {
  /** Open the bus. Idempotent — second `open` reconfigures. */
  open(options: CanTransportOpenOptions): Promise<void>;
  /** Tear down. Idempotent — second `close` is a no-op. */
  close(): Promise<void>;
  /** Subscribe to received frames. Returns the unsubscribe handle. */
  onFrame(handler: (frame: TimestampedCanFrame) => void): Unsubscribe;
  /**
   * Subscribe to fatal transport errors (socket closed, device
   * detached, bus-off). Recoverable conditions (single dropped
   * frame, CRC error on one message) DON'T fire this — the UI
   * derives bus-quality from rate / staleness.
   */
  onError(handler: (err: Error) => void): Unsubscribe;
  /**
   * Send a frame. Optional — `listen-only` transports throw if
   * this is called. Used by future write-side features (cycle
   * message replay, control panel). Not exercised by v1 dashboard.
   */
  send(frame: CanFrame): Promise<void>;
}
