/**
 * `createSerialCanTransport` — DASHX `CanTransport` backed by a
 * SLCAN-compatible USB dongle (CANable, USB2CANFD v1, Innomaker
 * MCP25xx-based, …) reached via the browser's Web Serial API.
 *
 * Lifecycle:
 *
 *   1. Caller opens the port via `navigator.serial.requestPort()`
 *      (must happen inside a user gesture — typically the Connect
 *      button click) and passes the resulting `SerialPort` to
 *      `createSerialCanTransport({ port })`. We deliberately don't
 *      call `requestPort()` here — keeps the transport pure and
 *      lets the UI own the picker UX.
 *   2. `open({ bitrate, mode })` → port.open(115200, 8N1), then
 *      send the SLCAN config commands:
 *        - `C\r`        close any prior session (idempotent)
 *        - `S<n>\r`     bitrate
 *        - `O\r` / `L\r` open in normal or listen-only mode
 *      A small delay between commands lets the dongle settle —
 *      some SLCAN firmwares drop config bytes when chained
 *      back-to-back.
 *   3. Frames stream from the device as `t<id><len><data>\r` etc.
 *      The read loop slurps bytes, feeds them to `LineBuffer`, runs
 *      `decodeFrameLine` on each line, and fans out matches to
 *      registered handlers (timestamped via `performance.now()` µs).
 *   4. `close()` sends `C\r`, cancels the reader, releases the port.
 *
 * The SLCAN baud (host-side UART speed) is locked to 115200 — the
 * spec's default and the CANable bootloader's value. Some dongles
 * support higher (`U<n>\r`) but most don't need it for classical
 * CAN at 500 kbps PT-CAN rates (~6 KB/s after framing, well under
 * 115200 / 10 = 11.5 KB/s).
 */

import type { CanBitrate, CanFrame, TimestampedCanFrame } from "@emdzej/dashx-can-decoder";
import type { CanTransport, CanTransportOpenOptions, Unsubscribe } from "./types.js";
import { LineBuffer, bitrateCommand, decodeFrameLine, encodeFrame } from "./slcan.js";

/**
 * Minimal subset of the Web Serial `SerialPort` we touch. Declared
 * locally so the package doesn't need `"lib": ["DOM"]` in its
 * tsconfig — Node-side consumers (tests, future CLI) can build
 * without it. Mirrors the pattern @emdzej/ediabasx-interface-serial
 * uses.
 */
export interface WebSerialPortLike {
  open(options: {
    baudRate: number;
    dataBits?: 7 | 8;
    parity?: "none" | "even" | "odd";
    stopBits?: 1 | 2;
  }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}

export interface SerialCanTransportOptions {
  /** A `SerialPort` from `navigator.serial.requestPort()`. */
  port: WebSerialPortLike;
}

/** Host-side UART baud the SLCAN spec defaults to. */
const SLCAN_UART_BAUD = 115_200;

/**
 * Small inter-command delay (ms) — gives the dongle time to ACK
 * before the next config byte arrives. 20 ms is conservative;
 * shorter values work on most adapters but a CANable bootloader
 * I tested drops `S6` when sent within ~5 ms of `C`.
 */
const COMMAND_GAP_MS = 20;

export function createSerialCanTransport(
  options: SerialCanTransportOptions,
): CanTransport {
  const { port } = options;
  const frameHandlers = new Set<(f: TimestampedCanFrame) => void>();
  const errorHandlers = new Set<(err: Error) => void>();

  let opened = false;
  let readLoopPromise: Promise<void> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  const lineBuffer = new LineBuffer();
  const textDecoder = new TextDecoder("ascii", { fatal: false });
  const textEncoder = new TextEncoder();

  function fanOutFrame(f: TimestampedCanFrame): void {
    for (const h of frameHandlers) h(f);
  }
  function fanOutError(err: Error): void {
    for (const h of errorHandlers) h(err);
  }

  /**
   * Send one SLCAN command, terminated with `\r`. Awaits the write
   * to drain so the inter-command delay below is accurate. Doesn't
   * read back the dongle's ack — SLCAN replies are noisy
   * (`\r` for OK, `\a` for error) and the read loop pulls them
   * out of the stream as non-frame lines anyway.
   */
  async function sendCommand(cmd: string): Promise<void> {
    if (!writer) throw new Error("Writer not initialised");
    if (typeof console !== "undefined") {
      console.info(`[slcan→] ${cmd}\\r`);
    }
    await writer.write(textEncoder.encode(`${cmd}\r`));
  }

  async function delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async function readLoop(): Promise<void> {
    if (!reader) return;
    if (typeof console !== "undefined") {
      console.info("[slcan] read loop starting");
    }
    let chunkCount = 0;
    let frameCount = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (typeof console !== "undefined") {
            console.info(`[slcan] read loop ended (done=true), chunks=${chunkCount} frames=${frameCount}`);
          }
          return;
        }
        if (!value || value.length === 0) continue;
        chunkCount++;
        const chunk = textDecoder.decode(value, { stream: true });
        /* First few chunks: log raw bytes + decoded text so we can
           see what the adapter is actually sending. Most useful
           when frames aren't decoding — we get to see the wire form
           directly. After 10 chunks, switch to summary-only logging
           to stop spamming the console at full bus rate. */
        if (typeof console !== "undefined" && chunkCount <= 10) {
          const hex = Array.from(value)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
          console.info(
            `[slcan←] chunk #${chunkCount} (${value.length} bytes): hex=[${hex}] text=${JSON.stringify(chunk)}`,
          );
        }
        const lines = lineBuffer.push(chunk);
        if (lines.length === 0) continue;
        /* `performance.now()` is ms with sub-ms resolution; convert
           to µs to match the RPC transport's `ts` units. */
        for (const line of lines) {
          const decoded = decodeFrameLine(line);
          if (!decoded) {
            /* Non-frame line — likely an ack (`\r` = empty), error
               (`\a` BEL), or a version reply. Log the first few so
               the user can see what the adapter is replying to
               config commands. */
            if (typeof console !== "undefined" && chunkCount <= 10) {
              console.info(`[slcan ?] non-frame line: ${JSON.stringify(line)}`);
            }
            continue;
          }
          frameCount++;
          const ts = Math.round(performance.now() * 1000);
          fanOutFrame({ ...decoded.frame, ts });
        }
      }
    } catch (err) {
      /* Cancelled reader during close() throws an AbortError-like
         — swallow during teardown. Any other error is fatal. */
      if (!opened) return;
      if (typeof console !== "undefined") {
        console.error("[slcan] read loop error:", err);
      }
      fanOutError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async function bitrateFor(b: CanBitrate): Promise<string> {
    return bitrateCommand(b);
  }

  return {
    async open(opts: CanTransportOpenOptions): Promise<void> {
      if (opened) {
        /* Reconfigure-in-place: same C → S → M → O sequence as the
           initial-open path below. M0/M1 must be set while closed,
           so this works only because we're sending C first. */
        await sendCommand("C");
        await delay(COMMAND_GAP_MS);
        await sendCommand(await bitrateFor(opts.bitrate));
        await delay(COMMAND_GAP_MS);
        await sendCommand(opts.mode === "normal" ? "M0" : "M1");
        await delay(COMMAND_GAP_MS);
        await sendCommand("O");
        return;
      }

      await port.open({
        baudRate: SLCAN_UART_BAUD,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      });

      const readable = port.readable;
      const writable = port.writable;
      if (!readable || !writable) {
        await port.close().catch(() => undefined);
        throw new Error("Web Serial port has no readable/writable stream after open()");
      }

      reader = readable.getReader();
      writer = writable.getWriter();
      lineBuffer.reset();

      /* Init sequence (verified against WeAct USB2CANFDV1 firmware
         docs):
           1. C    — close any prior session (idempotent).
           2. S<n> — bitrate.
           3. M0/M1 — bus mode. `M1` = silent (true listen-only,
              no ACK, no TX); `M0` = normal (default). Both must
              be set while the channel is CLOSED, which is why
              this lives between `S` and `O`.
           4. O    — open the channel.
         The legacy `L` (listen-only open) is rejected with BEL
         by this firmware family; M1 + O is the supported way. */
      await sendCommand("C");
      await delay(COMMAND_GAP_MS);
      await sendCommand(await bitrateFor(opts.bitrate));
      await delay(COMMAND_GAP_MS);
      await sendCommand(opts.mode === "normal" ? "M0" : "M1");
      await delay(COMMAND_GAP_MS);
      await sendCommand("O");

      opened = true;
      readLoopPromise = readLoop();
    },

    async close(): Promise<void> {
      if (!opened) return;
      opened = false;
      try {
        await sendCommand("C");
      } catch {
        /* swallow — the port may already be in a bad state */
      }
      try {
        await reader?.cancel();
      } catch { /* swallow */ }
      try {
        reader?.releaseLock();
      } catch { /* swallow */ }
      try {
        writer?.releaseLock();
      } catch { /* swallow */ }
      reader = null;
      writer = null;
      /* Let the read loop unwind cleanly before we close the port —
         otherwise it can race with the underlying ReadableStream
         and surface as a stray exception in the next test run. */
      if (readLoopPromise) {
        await readLoopPromise.catch(() => undefined);
        readLoopPromise = null;
      }
      try {
        await port.close();
      } catch { /* swallow */ }
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
      if (!opened || !writer) throw new Error("Transport not open");
      const line = encodeFrame(frame);
      await writer.write(textEncoder.encode(`${line}\r`));
    },
  };
}
