/**
 * Standard classical-CAN bitrates DASHX supports. Picks the
 * canonical SLCAN-spec set (S0..S8) so the same numbers map
 * directly to dongle commands. BMW relevance:
 *
 *   • 100k — K-CAN on E46/E60 (instrument cluster, body modules)
 *   • 500k — PT-CAN on E-series (DME, DSC, ASC)
 *   • 1M   — F-CAN on early F-series gateway segments
 *
 * `@emdzej/bimmerz-rpc-can`'s contract accepts 25k too; we don't
 * — it isn't on the SLCAN dial and no BMW bus uses it. If a
 * future profile needs it, add via the custom `Sxxyy` command path.
 */
export type CanBitrate =
  | 10_000
  | 20_000
  | 50_000
  | 100_000
  | 125_000
  | 250_000
  | 500_000
  | 800_000
  | 1_000_000;

/**
 * One CAN frame as seen by DASHX. Transport-agnostic — SLCAN and
 * RPC paths all normalise to this shape.
 *
 * `data` is a fresh `Uint8Array` owned by the consumer (transports
 * MUST NOT recycle buffers across emits — decoders read out of band
 * via the reactive layer).
 */
export interface CanFrame {
  /** 11-bit (standard) or 29-bit (extended) identifier. */
  id: number;
  /** Extended-frame format flag. Default false. */
  ext?: boolean;
  /** Remote Transmission Request flag. Default false. */
  rtr?: boolean;
  /** Payload (0..8 bytes for classical CAN). */
  data: Uint8Array;
}

/**
 * Frame with the source's monotonic timestamp added. Microseconds for
 * the RPC path (matches `CanRxEvent.ts` from `@emdzej/bimmerz-rpc-can`);
 * SLCAN tail timestamps normalise to µs in their transports.
 */
export interface TimestampedCanFrame extends CanFrame {
  /** Monotonic timestamp in microseconds. */
  ts: number;
}

/**
 * One scalar extracted from a frame. Decoders are pure functions —
 * the same `frame` MUST produce the same value. Side effects (alarms,
 * persistence, transitions) live in the consuming layer.
 *
 * Decoders can return `null` to mean "this frame doesn't carry the
 * signal" — useful for multiplexed frames where one ID interleaves
 * multiple sub-messages selected by a header byte.
 */
export interface SignalDecoder<T = number> {
  /** Stable identifier used as the reactive store key. UPPER_SNAKE. */
  id: string;
  /** Human label for widgets and log columns. */
  label: string;
  /** SI-ish unit suffix. Empty string for unitless / boolean. */
  unit: string;
  /** CAN ID this signal lives on. */
  canId: number;
  /** Pure decoder. Returns `null` when the frame doesn't carry the signal. */
  decode: (frame: CanFrame) => T | null;
  /**
   * Expected message rate in Hz — used by the UI to render staleness
   * (signal has gone quiet) without each widget guessing. Optional;
   * widgets fall back to a per-signal timeout when unset.
   */
  rateHz?: number;
}

/**
 * One vehicle's full signal table. The web app's Settings dialog
 * lists every registered profile; users pick one and the dashboard
 * subscribes to its IDs.
 *
 * `id` is stable across releases — UI layouts reference it. Treat as
 * a public identifier; don't rename without a migration.
 */
/**
 * Value type a signal can carry. Numbers (scalars), booleans
 * (lamps), and strings (future — gear position, lap mode). The
 * widget tier pattern-matches on this at render time.
 */
export type SignalValue = number | boolean | string;

export interface VehicleProfile {
  /** Stable identifier — e.g. `"bmw-e46-ms43"`. Lowercase, hyphenated. */
  id: string;
  /** Human label for the picker — e.g. `"BMW E46 MS43 (M54)"`. */
  label: string;
  /** Bus bitrate. PT-CAN on E46 is 500 kbps; K-CAN is 100 kbps. */
  bitrate: CanBitrate;
  /**
   * Ordered list of signals the dashboard offers. The element type
   * widens `T` because a single profile mixes scalars (RPM) and
   * booleans (lamps); `T` is in `decode`'s return (covariant)
   * position so `SignalDecoder<boolean>` assigns into this slot.
   */
  signals: SignalDecoder<SignalValue>[];
}
