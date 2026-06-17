import crypto from 'crypto';

/**
 * RFC 6238 Time-based One-Time Password (TOTP), implemented as pure functions
 * over Node's `crypto`. The TOTP *seed* is a secret and is stored exactly like
 * any other KeyNest secret (KeyManager → safeStorage / OS keychain); only a
 * boolean flag ever reaches `vault.json`. These functions take the seed as an
 * argument and return only the derived public code — they never log it.
 */

export const DEFAULT_TOTP_STEP_SECONDS = 30;
export const DEFAULT_TOTP_DIGITS = 6;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode an RFC 4648 base32 string (the format authenticator apps use for TOTP
 * seeds) into raw bytes. Whitespace and the `=` padding are ignored and the
 * input is upper-cased, so seeds copied with spaces or in lowercase still work.
 * Throws on any character outside the base32 alphabet.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  if (cleaned.length === 0) return Buffer.alloc(0);

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** True when the string is a valid, non-empty base32 TOTP seed. */
export function isValidBase32Seed(input: string): boolean {
  if (!input || !input.trim()) return false;
  try {
    return base32Decode(input).length > 0;
  } catch {
    return false;
  }
}

/**
 * Compute the TOTP code for a given counter value (HOTP, RFC 4226). Uses
 * HMAC-SHA1 over the 8-byte big-endian counter, then the standard dynamic
 * truncation. Returns a zero-padded string of `digits` length.
 */
export function hotp(secret: Buffer, counter: number, digits = DEFAULT_TOTP_DIGITS): string {
  // 8-byte big-endian counter. We split across two 32-bit halves so values
  // beyond 2^32 (far-future timestamps) still encode correctly.
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();

  // Dynamic truncation (RFC 4226 §5.3).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
}

/**
 * Compute the RFC 6238 TOTP code from a base32 seed at a given time.
 *
 * @param seedBase32 base32-encoded shared secret
 * @param timeMs unix time in milliseconds (defaults to now)
 * @param step time step in seconds (default 30)
 * @param digits number of code digits (default 6)
 */
export function generateTotp(
  seedBase32: string,
  timeMs: number = Date.now(),
  step: number = DEFAULT_TOTP_STEP_SECONDS,
  digits: number = DEFAULT_TOTP_DIGITS
): string {
  const secret = base32Decode(seedBase32);
  const counter = Math.floor(timeMs / 1000 / step);
  return hotp(secret, counter, digits);
}

/**
 * Seconds remaining in the current time step (1..step). Drives the UI
 * countdown so the user knows how long the displayed code stays valid.
 */
export function secondsRemaining(
  timeMs: number = Date.now(),
  step: number = DEFAULT_TOTP_STEP_SECONDS
): number {
  const seconds = Math.floor(timeMs / 1000);
  return step - (seconds % step);
}
