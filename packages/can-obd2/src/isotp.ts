/**
 * ISO-TP (ISO 15765-2) single-frame framing for OBD-II Mode 01.
 *
 * OBD-II Mode 01 PIDs almost always fit in a single 7-byte payload,
 * which means we only need the single-frame format of ISO-TP — no
 * flow-control, no first-frame/consecutive-frame state machine. The
 * full ISO-TP spec is much bigger; this implementation covers the
 * subset DASHX needs (Mode 01 PIDs 0x01-0x64) and explicitly rejects
 * multi-frame inputs rather than trying to reassemble them.
 *
 * Single-frame format (8-byte CAN payload):
 *
 *   B0       = 0x0L            where L = SF length (1..7)
 *   B1..BL   = ISO-TP payload  (service ID, PID, data bytes)
 *   B(L+1).. = padding         (0x55 by convention; 0x00 also accepted)
 *
 * For Mode 01 PID requests:
 *
 *   payload = [0x01, PID]                  → L = 2
 *   wire    = [0x02, 0x01, PID, 0x55*5]
 *
 * For Mode 01 PID responses (the DME adds 0x40 to the service ID
 * per OBD-II spec — 0x01 → 0x41):
 *
 *   payload = [0x41, PID, A, ...]          → L = 2 + N data bytes
 *   wire    = [0x02+N, 0x41, PID, A, ..., 0x55..]
 *
 * CAN IDs (11-bit, on PT-CAN):
 *
 *   0x7DF — functional broadcast request (any responding ECU)
 *   0x7E0 — physical request to ECU #1 (DME on E46)
 *   0x7E8 — physical response from ECU #1 (DME on E46)
 *   0x7E1..0x7E7 / 0x7E9..0x7EF — additional ECUs
 *
 * Reference: ISO 15765-2:2016 § 9.6.2 (single frame).
 */

/** Functional-broadcast request ID. Any ECU that supports the
 *  requested PID will reply on its own response ID. */
export const OBD2_BROADCAST_REQUEST_ID = 0x7DF;

/** Physical request to ECU #1 (the DME on BMW E46). Use this if
 *  you want a deterministic single-source reply on 0x7E8 only. */
export const OBD2_DME_REQUEST_ID = 0x7E0;

/** Response ID from ECU #1 (the DME on BMW E46). */
export const OBD2_DME_RESPONSE_ID = 0x7E8;

/** OBD-II services. We use Mode 01 (current data) almost exclusively. */
export enum Obd2Service {
  CurrentData = 0x01,
  FreezeFrameData = 0x02,
  StoredDtcs = 0x03,
  ClearDtcs = 0x04,
  VehicleInfo = 0x09,
}

/** Pad byte used to fill the unused trailing bytes of a single
 *  frame. Most testers use 0x55; 0x00 is also commonly seen. */
const PAD = 0x55;

/**
 * Build the 8-byte CAN payload for an OBD-II Mode 01 PID request.
 * The payload contains exactly two ISO-TP data bytes: the service
 * id (0x01) and the PID.
 *
 * Example: `encodeMode01Request(0x06)` → `[02 01 06 55 55 55 55 55]`.
 */
export function encodeMode01Request(pid: number): Uint8Array {
  if (pid < 0 || pid > 0xFF) {
    throw new Error(`PID must be 0x00-0xFF, got ${pid}`);
  }
  const out = new Uint8Array(8);
  out[0] = 0x02;                       // SF length = 2 data bytes
  out[1] = Obd2Service.CurrentData;    // 0x01 = Mode 01
  out[2] = pid;
  out.fill(PAD, 3);                    // pad B3..B7
  return out;
}

/** Decoded single-frame ISO-TP payload — service id, PID, data. */
export interface Mode01Response {
  /** Service id with 0x40 ACK already stripped — `0x01` for Mode 01. */
  service: number;
  /** The PID that was requested. */
  pid: number;
  /** Data bytes A, B, C, D (0..N depending on PID). */
  data: Uint8Array;
}

/**
 * Parse an 8-byte CAN payload from a 0x7E8-class response ID into
 * a Mode 01 response. Returns `null` for anything that isn't a
 * Mode 01 single-frame OBD-II reply — multi-frame responses,
 * negative responses, unrelated chatter.
 *
 * We DO NOT validate the response CAN ID here — caller is expected
 * to filter on `id >= 0x7E8 && id <= 0x7EF`. This keeps the parser
 * a pure data function suitable for both passive sniffing (any
 * response ID) and active polling (single known ID).
 */
export function decodeMode01Response(payload: Uint8Array): Mode01Response | null {
  if (payload.length < 3) return null;

  const pci = payload[0]!;
  /* PCI high nibble: 0x0 = single frame, 0x1 = first frame,
     0x2 = consecutive frame, 0x3 = flow control. We only handle SF. */
  const pciType = (pci >> 4) & 0x0F;
  if (pciType !== 0x0) return null;

  const sfLen = pci & 0x0F;
  if (sfLen < 2 || sfLen > 7) return null;  // invalid SF length

  const service = payload[1]!;
  /* A Mode 01 response has service id 0x41 (0x01 + 0x40 ACK).
     Anything else is either a negative response (0x7F) or a different
     service — both irrelevant to the PID poller. */
  if (service !== Obd2Service.CurrentData + 0x40) return null;

  const pid = payload[2]!;
  const dataLen = sfLen - 2;   // bytes after service + pid
  if (3 + dataLen > payload.length) return null;
  const data = payload.slice(3, 3 + dataLen);

  return {
    service: service - 0x40,   // strip ACK so service === 0x01
    pid,
    data,
  };
}
