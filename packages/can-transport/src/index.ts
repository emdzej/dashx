/**
 * `@emdzej/dashx-can-transport` — `CanTransport` interface plus the
 * shipped backends.
 *
 *   • `createRpcCanTransport`     — bimmerz-box dongle's
 *                                    `/rpc/can/<n>` JSON-RPC.
 *   • `createSerialCanTransport`  — SLCAN over Web Serial
 *                                    (CANable, USB2CANFD v1, …).
 *   • `createSlcanWsTransport`    — SLCAN over WebSocket.
 *
 * BMW K+DCAN cables are NOT supported — the cable's firmware filters
 * all CAN traffic down to the configured ISO-TP request/response IDs
 * and never forwards the broadcast frames DASHX needs. Use a SLCAN
 * adapter (USB2CANFD V1, CANable, …) or the RPC backend instead.
 *
 * Construction is side-effect-free across all variants — every
 * transport's `open()` does the real work, so factories can be built
 * ahead of Connect and rejected through normal error flow if the
 * configuration is wrong.
 */

export type {
  CanMode,
  CanTransport,
  CanTransportOpenOptions,
  Unsubscribe,
} from "./types.js";

export {
  createRpcCanTransport,
  type RpcCanTransportOptions,
} from "./rpc.js";

export {
  createSerialCanTransport,
  type SerialCanTransportOptions,
  type WebSerialPortLike,
} from "./web-serial.js";

export {
  createSlcanWsTransport,
  type SlcanWsTransportOptions,
} from "./ws-slcan.js";

/* Re-export the SLCAN primitives — useful for a future CLI / test
   harness that wants to encode or parse SLCAN lines without
   building a full transport. */
export {
  LineBuffer,
  bitrateCommand,
  decodeFrameLine,
  encodeFrame,
} from "./slcan.js";
