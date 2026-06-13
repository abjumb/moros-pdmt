export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
};

const CLASS_CHARS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  // No quotes/backslash/space — avoids breakage when a password is pasted
  // into shells, JSON, or CSV without losing meaningful entropy.
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
};

/** Returns a uniformly random integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Cryptographically secure, unbiased integer source (rejection sampling over a
 * 32-bit window). Used by default; tests inject a deterministic source.
 */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0');
  // Largest multiple of maxExclusive that fits in 32 bits; values at or above
  // it are rejected so the modulo is unbiased.
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % maxExclusive;
};

export function clampLength(length: number): number {
  if (!Number.isFinite(length)) return DEFAULT_GENERATOR_OPTIONS.length;
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.floor(length)));
}

export function enabledPools(options: GeneratorOptions): string[] {
  const pools: string[] = [];
  if (options.lowercase) pools.push(CLASS_CHARS.lowercase);
  if (options.uppercase) pools.push(CLASS_CHARS.uppercase);
  if (options.digits) pools.push(CLASS_CHARS.digits);
  if (options.symbols) pools.push(CLASS_CHARS.symbols);
  return pools;
}

/**
 * Generate a random password. Guarantees at least one character from every
 * enabled class, fills the rest from the combined pool, then shuffles so the
 * guaranteed characters aren't predictably positioned. The length is clamped
 * to [MIN_LENGTH, MAX_LENGTH]; since MIN_LENGTH (8) exceeds the four classes,
 * the per-class guarantee always fits.
 *
 * Throws if no character class is enabled.
 */
export function generatePassword(
  options: GeneratorOptions,
  randomInt: RandomInt = cryptoRandomInt
): string {
  const pools = enabledPools(options);
  if (pools.length === 0) {
    throw new Error('Enable at least one character set to generate a password.');
  }
  const length = clampLength(options.length);
  const all = pools.join('');

  const chars: string[] = [];
  for (const pool of pools) {
    chars.push(pool[randomInt(pool.length)]);
  }
  while (chars.length < length) {
    chars.push(all[randomInt(all.length)]);
  }
  // Fisher–Yates shuffle.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}
