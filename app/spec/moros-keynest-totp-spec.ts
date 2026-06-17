// Direct imports from source — the plugin is not registered in moros-exports.
import {
  base32Decode,
  isValidBase32Seed,
  generateTotp,
  secondsRemaining,
  DEFAULT_TOTP_STEP_SECONDS,
} from '../internal_packages/moros/lib/keynest/totp';

// RFC 6238 Appendix B reference seed for the SHA1 vectors: the ASCII string
// "12345678901234567890", base32-encoded.
const RFC_SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

// RFC 6238 publishes 8-digit codes; KeyNest renders 6 digits, so the expected
// values are the last six digits of each published 8-digit code.
const VECTORS: Array<{ timeSeconds: number; code6: string }> = [
  { timeSeconds: 59, code6: '287082' }, // 94287082
  { timeSeconds: 1111111109, code6: '081804' }, // 07081804
  { timeSeconds: 1111111111, code6: '050471' }, // 14050471
  { timeSeconds: 1234567890, code6: '005924' }, // 89005924
  { timeSeconds: 2000000000, code6: '279037' }, // 69279037
  { timeSeconds: 20000000000, code6: '353130' }, // 65353130
];

describe('KeyNest TOTP', () => {
  describe('base32Decode', () => {
    it('decodes the ASCII seed used by the RFC vectors', () => {
      expect(base32Decode(RFC_SEED).toString('ascii')).toBe('12345678901234567890');
    });

    it('ignores whitespace, padding, and case', () => {
      expect(base32Decode('me ze=').toString('ascii')).toBe(base32Decode('MEZE').toString('ascii'));
      // "MZXW6===" is the canonical base32 for "foo".
      expect(base32Decode('MZXW6===').toString('ascii')).toBe('foo');
    });

    it('returns an empty buffer for empty input', () => {
      expect(base32Decode('').length).toBe(0);
    });

    it('throws on a character outside the base32 alphabet', () => {
      expect(() => base32Decode('1801')).toThrow();
    });
  });

  describe('isValidBase32Seed', () => {
    it('accepts a valid seed', () => {
      expect(isValidBase32Seed(RFC_SEED)).toBe(true);
    });

    it('rejects empty and non-base32 input', () => {
      expect(isValidBase32Seed('')).toBe(false);
      expect(isValidBase32Seed('   ')).toBe(false);
      expect(isValidBase32Seed('not-base32!')).toBe(false);
    });
  });

  describe('generateTotp (RFC 6238 vectors)', () => {
    VECTORS.forEach(({ timeSeconds, code6 }) => {
      it(`matches the RFC code at T=${timeSeconds}`, () => {
        // generateTotp takes milliseconds; convert from the RFC's seconds.
        expect(generateTotp(RFC_SEED, timeSeconds * 1000)).toBe(code6);
      });
    });

    it('produces a 6-digit, zero-padded string', () => {
      const code = generateTotp(RFC_SEED, 1234567890 * 1000);
      expect(code.length).toBe(6);
      expect(/^[0-9]{6}$/.test(code)).toBe(true);
    });

    it('is stable within a 30s step and changes across it', () => {
      const step = DEFAULT_TOTP_STEP_SECONDS * 1000;
      const base = 1500000000000; // arbitrary ms aligned arbitrarily
      const start = base - (base % step); // start of a step
      expect(generateTotp(RFC_SEED, start)).toBe(generateTotp(RFC_SEED, start + step - 1));
      expect(generateTotp(RFC_SEED, start)).not.toBe(generateTotp(RFC_SEED, start + step));
    });
  });

  describe('secondsRemaining', () => {
    it('reports a full step at the boundary', () => {
      // At an exact multiple of the step, the whole step remains.
      expect(secondsRemaining(0)).toBe(DEFAULT_TOTP_STEP_SECONDS);
      expect(secondsRemaining(30000)).toBe(DEFAULT_TOTP_STEP_SECONDS);
    });

    it('counts down within the step', () => {
      expect(secondsRemaining(1000)).toBe(DEFAULT_TOTP_STEP_SECONDS - 1);
      expect(secondsRemaining(29000)).toBe(1);
    });
  });
});
