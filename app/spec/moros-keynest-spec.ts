// Direct imports from source — the plugin is not registered in moros-exports.
import {
  DEFAULT_GENERATOR_OPTIONS,
  GeneratorOptions,
  MAX_LENGTH,
  MIN_LENGTH,
  clampLength,
  enabledPools,
  generatePassword,
} from '../internal_packages/moros/lib/keynest/password-generator';
import {
  estimateStrength,
  isWeak,
} from '../internal_packages/moros/lib/keynest/password-strength';
import { analyzeHealth } from '../internal_packages/moros/lib/keynest/password-health';
import { KeyNestEntry } from '../internal_packages/moros/lib/keynest/keynest-store';

// A deterministic "random" source so generator output is testable: always
// returns 0, i.e. the first character of any pool and a no-op shuffle.
const zero = () => 0;

const opts = (over: Partial<GeneratorOptions> = {}): GeneratorOptions => ({
  ...DEFAULT_GENERATOR_OPTIONS,
  ...over,
});

describe('KeyNest password generator', () => {
  it('produces a password of the requested length', () => {
    expect(generatePassword(opts({ length: 24 }), zero).length).toBe(24);
  });

  it('clamps the length into [MIN_LENGTH, MAX_LENGTH]', () => {
    expect(generatePassword(opts({ length: 2 }), zero).length).toBe(MIN_LENGTH);
    expect(generatePassword(opts({ length: 9999 }), zero).length).toBe(MAX_LENGTH);
  });

  it('includes at least one character from every enabled class', () => {
    const pw = generatePassword(opts({ length: 16 }), zero);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true);
  });

  it('only draws from the enabled classes', () => {
    const pw = generatePassword(
      opts({ length: 40, uppercase: false, symbols: false }),
      zero
    );
    expect(/^[a-z0-9]+$/.test(pw)).toBe(true);
  });

  it('throws when no character class is enabled', () => {
    expect(() =>
      generatePassword(
        opts({ lowercase: false, uppercase: false, digits: false, symbols: false }),
        zero
      )
    ).toThrow();
  });

  it('reports the enabled pools', () => {
    expect(enabledPools(opts()).length).toBe(4);
    expect(enabledPools(opts({ uppercase: false, digits: false, symbols: false })).length).toBe(1);
  });

  it('clampLength bounds and floors the requested length', () => {
    expect(clampLength(4)).toBe(MIN_LENGTH);
    expect(clampLength(9999)).toBe(MAX_LENGTH);
    expect(clampLength(20.7)).toBe(20);
    expect(clampLength(NaN)).toBe(DEFAULT_GENERATOR_OPTIONS.length);
  });

  it('default crypto source yields a valid password', () => {
    const pw = generatePassword(opts({ length: 32 }));
    expect(pw.length).toBe(32);
    expect(/^[\x21-\x7e]+$/.test(pw)).toBe(true);
  });
});

describe('KeyNest password strength', () => {
  it('scores an empty password as zero', () => {
    expect(estimateStrength('')).toEqual({ score: 0, entropyBits: 0 });
  });

  it('rates short single-class passwords as very weak', () => {
    expect(estimateStrength('abcde').score).toBe(0);
  });

  it('rates a long mixed-class password as very strong', () => {
    expect(estimateStrength('Abc123!@xyzQRS456&*').score).toBeGreaterThanOrEqual(3);
    expect(estimateStrength('Abcd1234!@#$Wxyz5678%^&*Qrst').score).toBe(4);
  });

  it('grows entropy with a larger character pool', () => {
    const lower = estimateStrength('abcdefgh').entropyBits;
    const mixed = estimateStrength('Abcd1!gh').entropyBits;
    expect(mixed).toBeGreaterThan(lower);
  });

  it('flags only the bottom two bands as weak', () => {
    expect(isWeak('abcde')).toBe(true);
    expect(isWeak('Abcd1234!@#$Wxyz5678%^&*Qrst')).toBe(false);
  });
});

describe('KeyNest password health audit', () => {
  const entry = (id: string, name: string): KeyNestEntry => ({
    id,
    name,
    kind: 'password',
    username: '',
    url: '',
    expiresAt: '',
    createdAt: 0,
    updatedAt: 0,
  });

  it('flags reused secrets across entries', () => {
    const summary = analyzeHealth([
      { entry: entry('1', 'A'), secret: 'Abcd1234!@#$Wxyz5678%^&*Qrst' },
      { entry: entry('2', 'B'), secret: 'Abcd1234!@#$Wxyz5678%^&*Qrst' },
      { entry: entry('3', 'C'), secret: 'Unique9876!@#$Zyxw5432%^&*Lkjh' },
    ]);
    expect(summary.reusedCount).toBe(2);
    expect(summary.entries[0].reused).toBe(true);
    expect(summary.entries[2].reused).toBe(false);
  });

  it('flags weak secrets', () => {
    const summary = analyzeHealth([
      { entry: entry('1', 'A'), secret: 'abc' },
      { entry: entry('2', 'B'), secret: 'Abcd1234!@#$Wxyz5678%^&*Qrst' },
    ]);
    expect(summary.weakCount).toBe(1);
    expect(summary.entries[0].weak).toBe(true);
    expect(summary.entries[1].weak).toBe(false);
  });

  it('ignores empty secrets for both checks', () => {
    const summary = analyzeHealth([
      { entry: entry('1', 'A'), secret: '' },
      { entry: entry('2', 'B'), secret: '' },
    ]);
    expect(summary.weakCount).toBe(0);
    expect(summary.reusedCount).toBe(0);
    // Empty-secret entries are not counted as "checked".
    expect(summary.checked).toBe(0);
  });
});
