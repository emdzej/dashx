/**
 * `RpcCanTransport` — wraps `@emdzej/bimmerz-rpc-can`'s `CanClient`
 * behind the DASHX `CanTransport` interface. Used by both the
 * embedded build (dongle's `/rpc/can/<n>` endpoint) and the regular
 * build when the user picks the "RPC" source.
 *
 * The lifecycle map between the two surfaces is one-to-one:
 *
 *   our `open({bitrate, mode})`   ↔ `client.open({bitrate, mode, exclusive: false})`
 *   our `close()`                 ↔ `client.close()`
 *   our `onFrame(fn)`             ↔ `client.onRx(fn)` (via shape adapter)
 *   our `send(frame)`             ↔ `client.send(frame)`
 *   our `onError(fn)`             ↔ subscribes to the underlying
 *                                    RpcClient's transport-error
 *                                    + revocation events. Both
 *                                    surface as fatal to the
 *                                    transport.
 *
 * The dongle's `can.open` is non-exclusive by default per the
 * `@emdzej/bimmerz-rpc-can` contract; a second open from another
 * client cooperatively revokes ours and fires `can.revoked`. The
 * dashboard treats revocation as a fatal error — the user has to
 * reconnect.
 */

import {
  connectCan,
  type CanBitrate as RpcCanBitrate,
  type CanClient,
  type CanMode as RpcCanMode,
  type CanRxEvent,
} from "@emdzej/bimmerz-rpc-can";
import type { RpcClient } from "@emdzej/bimmerz-rpc-core";
import type {
  CanFrame,
  TimestampedCanFrame,
} from "@emdzej/dashx-can-decoder";
import type {
  CanTransport,
  CanTransportOpenOptions,
  Unsubscribe,
} from "./types.js";

export interface RpcCanTransportOptions {
  /**
   * Full WebSocket URL of the dongle's CAN endpoint, e.g.
   * `ws://172.16.7.1/rpc/can/0`. The embedded build constructs
   * this from `window.location.origin` at boot.
   */
  url: string;
}

/**
 * Build an `RpcCanTransport`. Connection isn't established until
 * `open()` is called — keeps the constructor side-effect-free for
 * dependency injection.
 */
export function createRpcCanTransport(options: RpcCanTransportOptions): CanTransport {
  let can: CanClient | null = null;
  let rpc: RpcClient | null = null;
  const frameHandlers = new Set<(frame: TimestampedCanFrame) => void>();
  const errorHandlers = new Set<(err: Error) => void>();

  /* Internal off-handles so close() can drop the upstream
     subscriptions cleanly. Without this, a re-`open` would
     fan out to handlers across both the old and new socket. */
  let unsubscribeRx: Unsubscribe | null = null;
  let unsubscribeRevoked: Unsubscribe | null = null;

  function fanOutFrame(ev: CanRxEvent): void {
    const frame: TimestampedCanFrame = {
      id: ev.id,
      ext: ev.ext,
      rtr: ev.rtr,
      data: ev.data,
      ts: ev.ts,
    };
    for (const h of frameHandlers) h(frame);
  }

  function fanOutError(err: Error): void {
    for (const h of errorHandlers) h(err);
  }

  return {
    async open(opts: CanTransportOpenOptions): Promise<void> {
      const wanted = mapMode(opts.mode);
      const bitrate = mapBitrate(opts.bitrate);
      if (can) {
        /* Already connected — reconfigure in place. */
        await can.configure({ bitrate, mode: wanted });
        return;
      }
      const conn = await connectCan(options.url);
      can = conn.can;
      rpc = conn.rpc;
      unsubscribeRx = can.onRx(fanOutFrame);
      unsubscribeRevoked = can.onRevoked((ev) => {
        fanOutError(new Error(`CAN access revoked by ${ev.by}`));
      });
      await can.open({ bitrate, mode: wanted });
    },

    async close(): Promise<void> {
      try {
        if (can) await can.close();
      } catch {
        /* swallow — we're tearing down */
      }
      unsubscribeRx?.();
      unsubscribeRevoked?.();
      unsubscribeRx = null;
      unsubscribeRevoked = null;
      can = null;
      if (rpc) {
        try {
          await rpc.close();
        } catch {
          /* swallow */
        }
        rpc = null;
      }
    },

    onFrame(handler: (frame: TimestampedCanFrame) => void): Unsubscribe {
      frameHandlers.add(handler);
      return () => frameHandlers.delete(handler);
    },

    onError(handler: (err: Error) => void): Unsubscribe {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },

    async send(frame: CanFrame): Promise<void> {
      if (!can) throw new Error("Transport not open");
      await can.send(frame);
    },
  };
}

/**
 * Map the DASHX mode enum onto the `@emdzej/bimmerz-rpc-can`
 * enum. They're identical strings today, but the wrapper isolates
 * the two surfaces so a future divergence (e.g. DASHX gaining
 * `"silent"`) doesn't ripple.
 */
function mapMode(m: CanTransportOpenOptions["mode"]): RpcCanMode {
  return m ?? "listen-only";
}

/**
 * Map DASHX's `CanBitrate` to the `@emdzej/bimmerz-rpc-can`
 * accepted set. The DASHX union follows the canonical SLCAN dial
 * (S0..S8 → 10k..1M); the dongle's RPC contract uses BMW's
 * historical preset (25k, 50k, 100k, …). Overlap is large but
 * not total: DASHX adds 10k and 20k (rare CAN rates, useful for
 * test rigs); the dongle adds 25k (some BMW K-CAN-Body variants).
 *
 * Rejecting at the boundary keeps the rest of the dongle wire
 * code free of "did the user pick a value this side supports"
 * checks.
 */
function mapBitrate(rate: number): RpcCanBitrate {
  switch (rate) {
    case 50_000:
    case 100_000:
    case 125_000:
    case 250_000:
    case 500_000:
    case 800_000:
    case 1_000_000:
      return rate as RpcCanBitrate;
    default:
      throw new Error(
        `RPC transport: bitrate ${rate} not supported by @emdzej/bimmerz-rpc-can. ` +
          `Use 50k, 100k, 125k, 250k, 500k, 800k or 1M.`,
      );
  }
}
