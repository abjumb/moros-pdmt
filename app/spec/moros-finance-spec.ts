// Import the functions under test directly from the source file.
// We use a relative path because the plugin is not registered in
// moros-exports.
import {
  budgetSummary,
  parseAmountToCents,
  parseTransactionsCsv,
} from '../internal_packages/moros/lib/finance/finance-store';

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

describe('Moros finance budget math', () => {
  const expense = (category: string, amountCents: number) => ({
    category,
    kind: 'expense' as const,
    amountCents,
  });
  const income = (category: string, amountCents: number) => ({
    category,
    kind: 'income' as const,
    amountCents,
  });

  it('sums spending per category and ignores income', () => {
    const summaries = budgetSummary(
      [expense('Food', 1000), expense('Food', 500), income('Salary', 100000)],
      { Food: 2000 }
    );
    const food = summaries.find((s) => s.category === 'Food');
    expect(food.spentCents).toBe(1500);
    expect(food.budgetCents).toBe(2000);
    expect(food.overBudget).toBe(false);
    // No row for income-only categories without a budget.
    expect(summaries.find((s) => s.category === 'Salary')).toBeUndefined();
  });

  it('computes the spent/budget ratio', () => {
    const [food] = budgetSummary([expense('Food', 1500)], { Food: 2000 });
    expect(food.ratio).toBe(0.75);
  });

  it('flags categories over budget', () => {
    const [food] = budgetSummary([expense('Food', 2500)], { Food: 2000 });
    expect(food.overBudget).toBe(true);
    expect(food.ratio).toBeGreaterThan(1);
  });

  it('treats spending without a budget as not over budget and zero ratio', () => {
    const [transport] = budgetSummary([expense('Transport', 5000)], {});
    expect(transport.budgetCents).toBe(0);
    expect(transport.ratio).toBe(0);
    expect(transport.overBudget).toBe(false);
  });

  it('omits categories with neither spending nor a budget', () => {
    const summaries = budgetSummary([expense('Food', 1000)], { Food: 2000 });
    expect(summaries.length).toBe(1);
    expect(summaries[0].category).toBe('Food');
  });

  it('includes budgeted categories with no spending this month', () => {
    const [housing] = budgetSummary([], { Housing: 50000 });
    expect(housing.spentCents).toBe(0);
    expect(housing.budgetCents).toBe(50000);
    expect(housing.overBudget).toBe(false);
  });
});

describe('Moros finance CSV import parsing', () => {
  it('parses a header row and creates positive-cents expense rows', () => {
    const csv = [
      'date,description,amount,category',
      '2026-06-01,Groceries,42.50,Food',
      '2026-06-02,Coffee,3.75,Food',
    ].join('\n');
    const { rows, skipped } = parseTransactionsCsv(csv);
    expect(skipped).toBe(0);
    expect(rows.length).toBe(2);
    expect(rows[0].description).toBe('Groceries');
    expect(rows[0].amountCents).toBe(4250);
    expect(rows[0].kind).toBe('expense');
    expect(rows[0].category).toBe('Food');
    expect(rows[0].date).toBe('2026-06-01');
  });

  it('treats negative amounts (and an explicit kind) as income, storing positive cents', () => {
    const csv = [
      'date,description,amount',
      '2026-06-03,Refund,-20.00',
      '2026-06-04,Paycheck,1500.00,income',
    ].join('\n');
    const { rows } = parseTransactionsCsv(csv);
    expect(rows[0].kind).toBe('income');
    expect(rows[0].amountCents).toBe(2000);
  });

  it('honors an explicit kind column over the amount sign', () => {
    const csv = ['date,description,amount,kind', '2026-06-05,Bonus,99.00,income'].join('\n');
    const { rows } = parseTransactionsCsv(csv);
    expect(rows[0].kind).toBe('income');
    expect(rows[0].amountCents).toBe(9900);
  });

  it('parses positionally when there is no header row', () => {
    const csv = ['2026-06-01,Rent,1200.00,Housing'].join('\n');
    const { rows, skipped } = parseTransactionsCsv(csv);
    expect(skipped).toBe(0);
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe('Rent');
    expect(rows[0].amountCents).toBe(120000);
    expect(rows[0].category).toBe('Housing');
  });

  it('defaults the category to General when omitted', () => {
    const csv = ['date,description,amount', '2026-06-01,Snacks,5.00'].join('\n');
    const { rows } = parseTransactionsCsv(csv);
    expect(rows[0].category).toBe('General');
  });

  it('handles quoted fields containing commas', () => {
    const csv = ['date,description,amount', '2026-06-01,"Dinner, with friends",60.00'].join('\n');
    const { rows } = parseTransactionsCsv(csv);
    expect(rows[0].description).toBe('Dinner, with friends');
    expect(rows[0].amountCents).toBe(6000);
  });

  it('uses locale-tolerant amount parsing for European-formatted numbers', () => {
    const csv = ['date,description,amount', '2026-06-01,Hotel,"1.200,50"'].join('\n');
    const { rows } = parseTransactionsCsv(csv);
    expect(rows[0].amountCents).toBe(120050);
  });

  it('skips malformed rows and reports the count without throwing', () => {
    const csv = [
      'date,description,amount',
      '2026-06-01,Valid,10.00',
      ',Missing date,5.00',
      '2026-06-02,,5.00',
      '2026-06-03,Bad amount,abc',
      '2026-06-04,Zero,0.00',
      '2026-06-05,Another valid,7.50',
    ].join('\n');
    const { rows, skipped } = parseTransactionsCsv(csv);
    expect(rows.length).toBe(2);
    expect(skipped).toBe(4);
    expect(rows[0].description).toBe('Valid');
    expect(rows[1].description).toBe('Another valid');
  });

  it('ignores blank lines and returns an empty result for empty input', () => {
    const blank = parseTransactionsCsv('\n\n   \n');
    expect(blank.rows.length).toBe(0);
    expect(blank.skipped).toBe(0);
    expect(parseTransactionsCsv('').rows.length).toBe(0);
  });
});
