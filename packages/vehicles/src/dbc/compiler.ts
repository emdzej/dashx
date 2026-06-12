/**
 * DBC → SignalDecoder[] compiler.
 *
 * Walks a `DbcDatabase` and synthesises a `SignalDecoder<number>`
 * per `SG_` (or `<boolean>` for length-1 unitless signals). Each
 * decoder reads the field's bits out of a `CanFrame.data`, applies
 * the `(raw * scale) + offset` formula, and (for multiplex variants)
 * returns `null` when the selector value doesn't match.
 *
 * Supports both Intel (little-endian) and Motorola (big-endian)
 * byte orders. Sign-extends signed signals. Honours simple `m<n>`
 * multiplex notation; extended `SG_MUL_VAL_` is accepted by the
 * parser and is treated by the compiler as a single-level mux
 * matching the first range — good enough for the BMW use case
 * where extended multiplex is rare.
 *
 * Bit ordering reference (matches the canonical DBC interpretation
 * used by CANdb++, cantools, candle-bus, and Vector tools):
 *
 *   Intel:    the start bit is the field's LSB. Successive bits
 *             ascend within the byte, then wrap into the next byte's
 *             bit 0. So a 13-bit field at start_bit=11 occupies
 *             bits 11..23 = byte 1 bits 3..7 (5 bits, low) + byte 2
 *             bits 0..7 (8 bits, high).
 *
 *   Motorola: the start bit is the field's MSB. Successive bits
 *             descend within the byte (bit n → bit n-1), and on
 *             crossing a byte boundary jump from bit 0 of byte k to
 *             bit 7 of byte k+1. So a 16-bit field at start_bit=7
 *             occupies byte 0 bits 7..0 (MSB to bit 8 of result) and
 *             byte 1 bits 7..0 (bit 7 of result down to LSB).
 */

import type {
  CanFrame,
  SignalDecoder,
  SignalValue,
} from "@emdzej/dashx-can-decoder";
import { parseDbc, type DbcMessage, type DbcSignal, type DbcDatabase } from "./parser.js";

/** Result of compiling one DBC database into runnable decoders. */
export interface CompiledDbc {
  /** Flat decoder list — drop straight into `VehicleProfile.signals`. */
  decoders: SignalDecoder<SignalValue>[];
  /** Lookup by signal name. */
  signalsByName: Map<string, DbcSignal>;
  /** Lookup by CAN ID. */
  messagesById: Map<number, DbcMessage>;
}

/** Read `length` bits from `data` using Intel/little-endian rules.
 *  Returned as an unsigned integer — signed interpretation is the
 *  caller's job via `signExtend`. Out-of-range bits read as 0. */
export function readBitsLe(
  data: Uint8Array,
  startBit: number,
  length: number,
): number {
  let value = 0;
  let bitsRead = 0;
  let pos = startBit;
  while (bitsRead < length) {
    const byteIndex = pos >> 3;
    const bitInByte = pos & 7;
    if (byteIndex >= data.length) break;
    const bitsAvail = Math.min(length - bitsRead, 8 - bitInByte);
    const mask = (1 << bitsAvail) - 1;
    const chunk = (data[byteIndex]! >> bitInByte) & mask;
    value |= chunk << bitsRead;
    bitsRead += bitsAvail;
    pos += bitsAvail;
  }
  return value >>> 0;
}

/** Read `length` bits from `data` using Motorola/big-endian rules.
 *  Walks high-to-low within a byte, jumps from bit 0 of byte k to
 *  bit 7 of byte k+1 at boundaries. */
export function readBitsBe(
  data: Uint8Array,
  startBit: number,
  length: number,
): number {
  let value = 0;
  let bit = startBit;
  for (let i = 0; i < length; i++) {
    const byteIndex = bit >> 3;
    const bitInByte = bit & 7;
    if (byteIndex < data.length) {
      const v = (data[byteIndex]! >> bitInByte) & 1;
      /* Output is MSB-first: shift the current accumulator left and
         OR the new LSB in. */
      value = ((value << 1) | v) >>> 0;
    } else {
      value = (value << 1) >>> 0;
    }
    /* Next bit:
       • inside a byte → step down (bit-1).
       • crossing bit 0 → jump to next byte's bit 7 (so `bit` adds 15). */
    if (bitInByte === 0) {
      bit += 15;
    } else {
      bit -= 1;
    }
  }
  return value >>> 0;
}

/** Sign-extend an unsigned `length`-bit value to a 32-bit signed
 *  JS number. Lengths up to 32; longer fields shouldn't appear on
 *  classical CAN's 64-bit payload but are safe through `| 0`. */
export function signExtend(raw: number, length: number): number {
  if (length >= 32) return raw | 0;
  const signBit = 1 << (length - 1);
  if ((raw & signBit) === 0) return raw;
  return raw - (1 << length);
}

/** Read a `DbcSignal` from a frame's payload. Returns the unsigned
 *  raw integer; caller applies sign + scale + offset. */
function readSignalRaw(sig: DbcSignal, data: Uint8Array): number {
  return sig.endian === "intel"
    ? readBitsLe(data, sig.startBit, sig.length)
    : readBitsBe(data, sig.startBit, sig.length);
}

/** Pull the multiplex selector value out of a frame, if any. */
function readSelector(msg: DbcMessage, data: Uint8Array): number | null {
  for (const sig of msg.signals) {
    if (sig.multiplex === "selector") {
      const raw = readSignalRaw(sig, data);
      return sig.sign === "signed" ? signExtend(raw, sig.length) : raw;
    }
  }
  return null;
}

/** Compile one DBC signal into a `SignalDecoder`. */
function compileSignal(
  msg: DbcMessage,
  sig: DbcSignal,
): SignalDecoder<SignalValue> {
  const isBoolean =
    sig.length === 1 && sig.unit === "" && sig.scale === 1 && sig.offset === 0;

  let mulGuard: ((data: Uint8Array) => boolean) | null = null;
  if (sig.mulVal && sig.mulVal.ranges.length > 0) {
    /* Extended multiplex: selector must be in any of the declared
       ranges. We look up the referenced selector signal at decode
       time so it stays in sync with the message. */
    const selectorName = sig.mulVal.selector;
    const ranges = sig.mulVal.ranges;
    mulGuard = (data) => {
      const selectorSig = msg.signals.find((s) => s.name === selectorName);
      if (!selectorSig) return false;
      const raw = readSignalRaw(selectorSig, data);
      const val =
        selectorSig.sign === "signed"
          ? signExtend(raw, selectorSig.length)
          : raw;
      return ranges.some((r) => val >= r.min && val <= r.max);
    };
  } else if (sig.multiplex && sig.multiplex !== "selector") {
    const expected = sig.multiplex.value;
    mulGuard = (data) => readSelector(msg, data) === expected;
  }

  const decode = (frame: CanFrame): SignalValue | null => {
    if (frame.id !== msg.id) return null;
    if (mulGuard && !mulGuard(frame.data)) return null;
    const raw = readSignalRaw(sig, frame.data);
    const num = sig.sign === "signed" ? signExtend(raw, sig.length) : raw;
    if (isBoolean) return num !== 0;
    return num * sig.scale + sig.offset;
  };

  /* Read a cycle-time hint from common DBC attribute names so the
     resulting decoder carries `rateHz` for the staleness widget. */
  const cycleMs = readCycleTimeMs(msg);

  return {
    id: sig.name,
    label: sig.name,
    unit: sig.unit,
    canId: msg.id,
    rateHz: cycleMs ? 1000 / cycleMs : undefined,
    decode,
  };
}

function readCycleTimeMs(msg: DbcMessage): number | undefined {
  const attrs = msg.attributes;
  if (!attrs) return undefined;
  for (const key of ["GenMsgCycleTime", "BusCycle", "CycleTime"]) {
    const v = attrs[key];
    if (typeof v === "number" && v > 0) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

/** Walk an entire `DbcDatabase` and produce a flat decoder list. */
export function compileDbc(db: DbcDatabase): CompiledDbc {
  const decoders: SignalDecoder<SignalValue>[] = [];
  const signalsByName = new Map<string, DbcSignal>();
  for (const msg of db.messages.values()) {
    for (const sig of msg.signals) {
      decoders.push(compileSignal(msg, sig));
      signalsByName.set(sig.name, sig);
    }
  }
  return { decoders, signalsByName, messagesById: db.messages };
}

/** Convenience: parse + compile in one step. */
export function compileDbcText(text: string): CompiledDbc {
  return compileDbc(parseDbc(text));
}
