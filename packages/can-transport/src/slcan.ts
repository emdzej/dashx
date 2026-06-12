/**
 * SLCAN — Lawicel-style ASCII protocol for USB↔CAN adapters
 * (CANable, Innomaker MCP25xx, the USB2CANFD v1 in classical-CAN
 * mode, …). Implemented based on the public Lawicel CANUSB spec
 * which everyone follows.
 *
 * The protocol is line-oriented, `\r`-terminated. We use it for two
 * transports — `createSerialCanTransport` (Web Serial direct) and
 * `createSlcanWsTransport` (over WebSocket) — so the line parser
 * lives here, transport-agnostic.
 *
 * Wire forms we care about:
 *
 *   • `S<n>\r`               — bitrate setting (S0…S8)
 *   • `O\r`                  — open channel (start streaming)
 *   • `L\r`                  — open in listen-only mode
 *   • `C\r`                  — close channel
 *   • `t<id3><len><data>\r`  — standard frame (11-bit ID)
 *   • `T<id8><len><data>\r`  — extended frame (29-bit ID)
 *   • `r<id3><len>\r`        — RTR standard
 *   • `R<id8><len>\r`        — RTR extended
 *   • `V\r` / `v\r`          — version query
 *
 * Replies are `\r` for OK, `\a` (BEL, 0x07) for error. The dongles
 * also echo incoming traffic without acknowledgment so we ignore
 * stand-alone OK markers on the read side.
 *
 * Timestamps: the basic SLCAN spec doesn't transmit timestamps —
 * some dongles append a 4-hex-char ms timestamp when configured via
 * `Z1\r`. We don't enable that by default; the receive path stamps
 * frames using `performance.now()` in microseconds. Switching to
 * device-side stamps later is a config flag.
 */

import type { CanBitrate, CanFrame } from "@emdzej/dashx-can-decoder";

/**
 * Lawicel bitrate codes. Canonical SLCAN-spec mapping (S0..S8) —
 * verified against the WeAct USB2CANFDV1 firmware docs (mirrors
 * the original Lawicel CANUSB datasheet).
 *
 *   S0 = 10k    S5 = 250k
 *   S1 = 20k    S6 = 500k   ← BMW PT-CAN
 *   S2 = 50k    S7 = 800k
 *   S3 = 100k   ← BMW K-CAN
 *   S4 = 125k   S8 = 1M     ← BMW F-CAN early gateway
 *
 * Prior shipping versions had this off-by-one (25k→S0 etc.) — would
 * have silently picked the wrong bitrate for everything except
 * 500k/800k/1M. Fixed before any non-PT-CAN profile shipped.
 */
export function bitrateCommand(bitrate: CanBitrate): string {
  switch (bitrate) {
    case 10_000:    return "S0";
    case 20_000:    return "S1";
    case 50_000:    return "S2";
    case 100_000:   return "S3";
    case 125_000:   return "S4";
    case 250_000:   return "S5";
    case 500_000:   return "S6";
    case 800_000:   return "S7";
    case 1_000_000: return "S8";
    default: {
      /* Exhaustiveness check — TS warns if a new CanBitrate is added
         without a case above. */
      const exhaustive: never = bitrate;
      throw new Error(`Unsupported SLCAN bitrate: ${String(exhaustive)}`);
    }
  }
}

/**
 * Encode a `CanFrame` as an SLCAN line (without the trailing `\r`).
 * Mirrors the device's emit side: lowercase prefixes for standard
 * IDs, uppercase for extended. RTR variants use `r` / `R` and
 * carry only the DLC nibble — no data bytes.
 */
export function encodeFrame(frame: CanFrame): string {
  const ext = frame.ext === true;
  const rtr = frame.rtr === true;
  const idHex = ext
    ? frame.id.toString(16).toUpperCase().padStart(8, "0")
    : frame.id.toString(16).toUpperCase().padStart(3, "0");
  const dlc = frame.data.length;
  if (dlc > 8) throw new Error(`Classical CAN DLC > 8: ${dlc}`);
  const prefix = rtr ? (ext ? "R" : "r") : (ext ? "T" : "t");
  if (rtr) return `${prefix}${idHex}${dlc}`;
  let body = "";
  for (let i = 0; i < dlc; i++) {
    body += frame.data[i]!.toString(16).toUpperCase().padStart(2, "0");
  }
  return `${prefix}${idHex}${dlc}${body}`;
}

/**
 * Decode one SLCAN frame line into `{ frame, deviceTsMs? }`. The
 * device-timestamp field is optional — only present when the dongle
 * is in `Z1\r` mode (we don't enable it by default but parse it
 * defensively).
 *
 * Returns `null` for lines that aren't frames (status replies,
 * version strings, empty lines). The caller drops nulls silently.
 */
export function decodeFrameLine(
  line: string,
): { frame: CanFrame; deviceTsMs?: number } | null {
  if (line.length === 0) return null;
  const tag = line[0]!;
  let ext = false;
  let rtr = false;
  switch (tag) {
    case "t": ext = false; rtr = false; break;
    case "T": ext = true;  rtr = false; break;
    case "r": ext = false; rtr = true;  break;
    case "R": ext = true;  rtr = true;  break;
    default: return null;  /* status echo, version, garbage */
  }
  const idLen = ext ? 8 : 3;
  if (line.length < 1 + idLen + 1) return null;   /* truncated */
  const idStr = line.slice(1, 1 + idLen);
  const id = parseInt(idStr, 16);
  if (!Number.isFinite(id) || id < 0) return null;
  const dlcChar = line[1 + idLen]!;
  const dlc = parseInt(dlcChar, 16);
  if (!Number.isFinite(dlc) || dlc < 0 || dlc > 8) return null;

  let cursor = 1 + idLen + 1;
  let data: Uint8Array;
  if (rtr) {
    data = new Uint8Array(0);
  } else {
    /* Expect 2 hex chars per byte. Truncated payloads → null;
       we'd rather drop a bad frame than emit garbage to the decoders. */
    if (line.length < cursor + dlc * 2) return null;
    data = new Uint8Array(dlc);
    for (let i = 0; i < dlc; i++) {
      const byte = parseInt(line.slice(cursor, cursor + 2), 16);
      if (!Number.isFinite(byte) || byte < 0 || byte > 0xff) return null;
      data[i] = byte;
      cursor += 2;
    }
  }

  /* Optional device timestamp: 4 hex chars, ms-since-start, after
     the payload. Some dongles emit it even when not asked — accept
     it but don't trust it for cross-device sync. */
  let deviceTsMs: number | undefined;
  if (line.length >= cursor + 4) {
    const tsHex = line.slice(cursor, cursor + 4);
    if (/^[0-9A-Fa-f]{4}$/.test(tsHex)) {
      deviceTsMs = parseInt(tsHex, 16);
    }
  }

  return {
    frame: { id, ext, rtr, data },
    deviceTsMs,
  };
}

/**
 * Streaming line accumulator. Bytes flow in via `push(chunk)`; the
 * iterator yields complete `\r`-terminated lines without the
 * terminator. Used by both Web Serial and WebSocket transports so
 * partial-read handling is identical.
 *
 * Designed for the SLCAN happy path where individual lines are
 * tiny (10-30 bytes); a degenerate input could grow `buf`
 * unbounded if `\r` never arrives, so we cap at 1 KiB and drop
 * the buffer on overflow. Real dongles never approach this.
 */
export class LineBuffer {
  private buf = "";
  private static readonly MAX = 1024;

  push(chunk: string): string[] {
    this.buf += chunk;
    if (this.buf.length > LineBuffer.MAX) {
      /* Pathological — likely a bad dongle or a misframed stream.
         Reset and drop; the next frame will resync. */
      this.buf = "";
      return [];
    }
    const lines: string[] = [];
    let cr: number;
    while ((cr = this.buf.indexOf("\r")) !== -1) {
      lines.push(this.buf.slice(0, cr));
      this.buf = this.buf.slice(cr + 1);
    }
    return lines;
  }

  reset(): void {
    this.buf = "";
  }
}
