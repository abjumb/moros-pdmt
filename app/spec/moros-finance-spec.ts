// Import the function under test directly from the source file.
// We use a relative path because the plugin is not registered in
// moros-exports.
import { parseAmountToCents } from '../internal_packages/moros/lib/finance/finance-store';

describe('Moros finance amount parsing', () => {
  it('parses plain decimals into integer cents', () => {
    expect(parseAmountToCents('12.50')).toBe(1250);
    expect(parseAmountToCents('0.99')).toBe(99);
    expect(parseAmountToCents('100')).toBe(10000);
  });

  it('ignores currency symbols and whitespace', () => {
    expect(parseAmountToCents('$1,200')).toBe(120000);
    expect(parseAmountToCents('  £42.00 ')).toBe(4200);
  });

  it('handles US grouping with a decimal point', () => {
    expect(parseAmountToCents('1,200.50')).toBe(120050);
    expect(parseAmountToCents('1,000,000')).toBe(100000000);
  });

  it('handles European grouping where comma is the decimal separator', () => {
    expect(parseAmountToCents('1.200,50')).toBe(120050);
    expect(parseAmountToCents('1.000')).toBe(100000); // thousands, not 1.0
    expect(parseAmountToCents('12,5')).toBe(1250); // 1-2 trailing digits => decimal
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseAmountToCents('')).toBe(null);
    expect(parseAmountToCents('abc')).toBe(null);
  });
});
