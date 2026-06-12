/**
 * Byte-assembly helpers — the canonical way to read multi-byte
 * scalars out of a CAN payload. Decoder code reaches for these
 * instead of inline `bytes[i] | (bytes[i+1] << 8)` so the intent
 * (LE vs BE, signed vs unsigned) stays grep-able and the byte
 * arithmetic is centralised.
 *
 * Why this matters for BMW PT-CAN: some E46 frames carry both LE
 * scalars (engine speed in 0x316) and BE scalars (vehicle speed in
 * 0x153) within the same payload. Inline shifts hide that
 * inconsistency; named helpers surface it.
 *
 * All helpers tolerate short buffers — returning `0` (or the
 * fallback you pass) rather than throwing. Decoders signal "no
 * value" by returning `null` from {@link SignalDecoder.decode},
 * not by trusting a thrown bounds error to propagate.
 */

/** Unsigned 8-bit at offset. Defaults to 0 if out of range. */
export function u8(data: Uint8Array, offset: number): number {
  return offset >= 0 && offset < data.length ? data[offset]! : 0;
}

/** Single bit (0/1) at byte `offset`, bit position `bit` (0=LSB). */
export function bit(data: Uint8Array, offset: number, bitPos: number): 0 | 1 {
  return ((u8(data, offset) >> bitPos) & 1) as 0 | 1;
}

/** Little-endian unsigned 16-bit. `offset` is the LOW byte. */
export function leU16(data: Uint8Array, offset: number): number {
  return u8(data, offset) | (u8(data, offset + 1) << 8);
}

/** Big-endian unsigned 16-bit. `offset` is the HIGH byte. */
export function beU16(data: Uint8Array, offset: number): number {
  return (u8(data, offset) << 8) | u8(data, offset + 1);
}

/**
 * Little-endian signed 16-bit. Sign-extends via `<< 16 >> 16` so
 * the V8 SMI representation stays correct. `offset` is LOW byte.
 */
export function leI16(data: Uint8Array, offset: number): number {
  return (leU16(data, offset) << 16) >> 16;
}

/** Big-endian signed 16-bit. `offset` is HIGH byte. */
export function beI16(data: Uint8Array, offset: number): number {
  return (beU16(data, offset) << 16) >> 16;
}

/**
 * Little-endian unsigned 32-bit. `>>> 0` coerces to unsigned so the
 * caller gets a positive number even when bit 31 is set. `offset`
 * is the LOW byte.
 */
export function leU32(data: Uint8Array, offset: number): number {
  return (
    (u8(data, offset) |
      (u8(data, offset + 1) << 8) |
      (u8(data, offset + 2) << 16) |
      (u8(data, offset + 3) << 24)) >>>
    0
  );
}

/** Big-endian unsigned 32-bit. `offset` is HIGH byte. */
export function beU32(data: Uint8Array, offset: number): number {
  return (
    ((u8(data, offset) << 24) |
      (u8(data, offset + 1) << 16) |
      (u8(data, offset + 2) << 8) |
      u8(data, offset + 3)) >>>
    0
  );
}

/**
 * Apply an affine transform `raw → raw * scale + offset` to whatever
 * a sub-decoder returned. Encourages decoders to read out:
 *
 *   const coolantC = scaled(u8(data, 1), 0.75, -48.373);
 *
 * over the inline form, which reads as a wall of magic numbers.
 * The widget tier never sees raw bytes — it sees engineered values.
 */
export function scaled(raw: number, scale: number, offset = 0): number {
  return raw * scale + offset;
}
