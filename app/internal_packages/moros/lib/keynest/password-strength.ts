export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface StrengthResult {
  score: StrengthScore;
  /** Rough Shannon entropy estimate in bits (length × log2(pool size)). */
  entropyBits: number;
}

/**
 * Estimate password strength from length and character-class diversity. This
 * is a lightweight heuristic — `length × log2(pool size)` — not a dictionary
 * or pattern check, so it over-credits things like "Password1!". It exists to
 * nudge users toward longer, more varied secrets, not to certify them.
 */
export function estimateStrength(password: string): StrengthResult {
  if (!password) return { score: 0, entropyBits: 0 };

  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;

  const entropyBits = pool > 0 ? password.length * Math.log2(pool) : 0;

  let score: StrengthScore;
  if (entropyBits < 28) score = 0;
  else if (entropyBits < 36) score = 1;
  else if (entropyBits < 60) score = 2;
  else if (entropyBits < 128) score = 3;
  else score = 4;

  return { score, entropyBits };
}

/** A password is "weak" if it scores in the bottom two bands. */
export function isWeak(password: string): boolean {
  return estimateStrength(password).score <= 1;
}
