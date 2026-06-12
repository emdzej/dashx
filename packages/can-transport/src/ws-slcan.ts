/**
 * `createSlcanWsTransport` — DASHX `CanTransport` backed by a
 * SLCAN bridge reached via WebSocket. The wire protocol is the
 * same Lawicel ASCII the Web Serial transport speaks; only the
 * underlying byte channel differs.
 *
 * Two scenarios this serves:
 *
 *   • **Remote SLCAN dongle.** A Node-side service holds the
 *     adapter and tunnels it to the browser — useful when the
 *     adapter sits on a Raspberry Pi in the garage but the
 *     dashboard runs on a laptop / phone.
 *
 * Both messages directions: the server sends `t...\r` /
 * `T...\r` frame lines; the client sends `S<n>\r`, `O\r`/`L\r`,
 * `C\r`, `t...\r` for TX. Identical to Web Serial.
 *
 * Frame format:
 *   - Text frames carry ASCII SLCAN lines (preferred — newer
 *     bridges).
 *   - Binary frames are decoded as UTF-8 and treated the same way
 *     (some older bridges only emit binary). Either works.
 */

import type { CanFrame, TimestampedCanFrame } from "@emdzej/dashx-can-decoder";
import type { CanTransport, CanTransportOpenOptions, Unsubscribe } from "./types.js";
import { LineBuffer, bitrateCommand, decodeFrameLine, encodeFrame } from "./slcan.js";

export interface SlcanWsTransportOptions {
  /** Full WebSocket URL of the SLCAN bridge, e.g. `ws://host:port`. */
  url: string;
}

export function createSlcanWsTransport(
  options: SlcanWsTransportOptions,
): CanTransport {
  const frameHandlers = new Set<(f: TimestampedCanFrame) => void>();
  const errorHandlers = new Set<(err: Error) => void>();

  let socket: WebSocket | null = null;
  let opened = false;
  const lineBuffer = new LineBuffer();
  const textDecoder = new TextDecoder("ascii", { fatal: false });

  function fanOutFrame(f: TimestampedCanFrame): void {
    for (const h of frameHandlers) h(f);
  }
  function fanOutError(err: Error): void {
    for (const h of errorHandlers) h(err);
  }

  /**
   * Process incoming text — accumulate into LineBuffer, decode each
   * complete `\r`-terminated line, stamp + fan out.
   */
  function ingestText(text: string): void {
    const lines = lineBuffer.push(text);
    if (lines.length === 0) return;
    for (const line of lines) {
      const decoded = decodeFrameLine(line);
      if (!decoded) continue;
      const ts = Math.round(performance.now() * 1000);
      fanOutFrame({ ...decoded.frame, ts });
    }
  }

  function sendCommand(cmd: string): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not open");
    }
    socket.send(`${cmd}\r`);
  }

  /**
   * Open a fresh WebSocket and resolve once it's ready. Reject
   * (without firing onError handlers) if the initial handshake
   * fails — `open()` is supposed to bubble that to the caller.
   * Post-open errors DO route through `fanOutError`.
   */
  function dial(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(options.url);
      ws.binaryType = "arraybuffer";
      const onOpen = (): void => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onErrorInitial);
        resolve(ws);
      };
      const onErrorInitial = (): void => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onErrorInitial);
        /* The WebSocket `error` event is fire-and-pretend — it
           doesn't carry detail. Best we can do is a generic
           message that the caller can prefix with the URL. */
        reject(new Error(`WebSocket failed to connect: ${options.url}`));
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onErrorInitial);
    });
  }

  return {
    async open(opts: CanTransportOpenOptions): Promise<void> {
      if (opened && socket && socket.readyState === WebSocket.OPEN) {
        /* Reconfigure: C → S → M → O. M0/M1 must be set while
           closed, so this works only because we send C first.
           See web-serial.ts for the full rationale. */
        sendCommand("C");
        sendCommand(bitrateCommand(opts.bitrate));
        sendCommand(opts.mode === "normal" ? "M0" : "M1");
        sendCommand("O");
        return;
      }

      socket = await dial();
      lineBuffer.reset();

      socket.addEventListener("message", (ev) => {
        if (typeof ev.data === "string") {
          ingestText(ev.data);
        } else if (ev.data instanceof ArrayBuffer) {
          ingestText(textDecoder.decode(new Uint8Array(ev.data)));
        }
        /* Blob path — browsers vary; we set `binaryType` to
           `arraybuffer` above so this shouldn't trigger. Drop
           silently if it does. */
      });
      socket.addEventListener("close", () => {
        if (!opened) return;  /* explicit close path — silent */
        fanOutError(new Error("WebSocket closed by remote"));
      });
      socket.addEventListener("error", () => {
        if (!opened) return;
        fanOutError(new Error("WebSocket error"));
      });

      sendCommand("C");
      sendCommand(bitrateCommand(opts.bitrate));
      sendCommand(opts.mode === "normal" ? "M0" : "M1");
      sendCommand("O");
      opened = true;
    },

    async close(): Promise<void> {
      if (!opened) return;
      opened = false;
      try {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send("C\r");
        }
      } catch { /* swallow */ }
      try {
        socket?.close(1000, "client requested");
      } catch { /* swallow */ }
      socket = null;
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
      if (!opened || !socket) throw new Error("Transport not open");
      socket.send(`${encodeFrame(frame)}\r`);
    },
  };
}
