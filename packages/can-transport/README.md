# @emdzej/dashx-can-transport

`CanTransport` interface + implementations.

## Interface

```ts
interface CanTransport {
  open(options: { bitrate: CanBitrate; mode?: CanMode }): Promise<void>;
  close(): Promise<void>;
  onFrame(handler: (frame: TimestampedCanFrame) => void): Unsubscribe;
  onError(handler: (err: Error) => void): Unsubscribe;
  send(frame: CanFrame): Promise<void>;
}
```

## Backends

| Factory | Wire | Notes |
|---|---|---|
| `createRpcCanTransport({ url })` | JSON-RPC over WS | bimmerz-box dongle's `/rpc/can/<n>`. Used by the embedded build. |
| `createSerialCanTransport({ port })` | SLCAN ASCII over Web Serial | CANable, USB2CANFD V1, any Lawicel-compatible USB CAN dongle. Caller picks the port via `navigator.serial.requestPort()` and passes it in. |
| `createSlcanWsTransport({ url })` | SLCAN ASCII over WebSocket | Headless / remote setups; pair with a Node-side SLCAN bridge. |

All three normalise to the same `CanTransport` so the UI doesn't
branch beyond the factory call.

**Not supported: BMW K+DCAN.** The cable's MCU firmware filters all
CAN traffic down to the configured ISO-TP IDs and never forwards
broadcast frames. It's a diagnostic adapter, not a CAN sniffer — DASHX
can't use it. For diagnostic work on a K+DCAN cable see
[inpax](https://github.com/emdzej/inpax).

## SLCAN primitives

Also exported for use by future CLI / test harnesses without
constructing a full transport:

- `bitrateCommand(bitrate: CanBitrate): string` — `S0`…`S8`
- `encodeFrame(frame: CanFrame): string` — Lawicel ASCII line
- `decodeFrameLine(line: string): { frame, deviceTsMs? } | null`
- `LineBuffer` — streaming `\r`-terminated line accumulator

## License

[PolyForm Noncommercial 1.0.0](../../LICENSE).
