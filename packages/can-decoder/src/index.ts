/**
 * `@emdzej/dashx-can-decoder` — frame + signal contracts for DASHX.
 *
 * Three concerns live here:
 *
 *   • `CanFrame` / `TimestampedCanFrame` — the shape every transport
 *     emits and every decoder consumes. Mirrors `@emdzej/bimmerz-
 *     rpc-can`'s `CanRxEvent` minus the wire-specific fields so the
 *     SLCAN / RPC paths converge on one type.
 *   • `SignalDecoder<T>` — one named scalar extracted from a frame.
 *     Decoders are pure functions; the reactive layer in the web app
 *     calls them on every matching frame.
 *   • Byte helpers (`leU16`, `beU16`, `i16FromLe`, `scaled`) — the
 *     only canonical way to assemble multi-byte values. Direct
 *     `bytes[i] | (bytes[i+1] << 8)` in decoder code is a smell —
 *     BMW PT-CAN interleaves LE and BE in some frames and the
 *     helpers let the intent stay visible.
 */

export type {
  CanBitrate,
  CanFrame,
  SignalDecoder,
  SignalValue,
  TimestampedCanFrame,
  VehicleProfile,
} from "./types.js";
export {
  leU16,
  beU16,
  leI16,
  beI16,
  leU32,
  beU32,
  u8,
  bit,
  scaled,
} from "./bytes.js";
