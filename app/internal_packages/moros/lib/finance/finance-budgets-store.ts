import MorosDataStore, { MorosRecord } from '../moros-data-store';

/**
 * A monthly spending budget for a single category, in integer cents. One
 * record per budgeted category; budgets are modeled as their own MorosDataStore
 * (`budgets.json`) rather than crammed into the settings blob because they are
 * a keyed collection that grows/shrinks per category — the same shape as the
 * other Moros record stores (transactions, subscriptions, …).
 */
export interface MorosBudget extends MorosRecord {
  category: string;
  /** Monthly budget in integer cents — always positive. */
  budgetCents: number;
}

class BudgetsStore extends MorosDataStore<MorosBudget> {
  constructor() {
    super('budgets.json');
  }

  /** The budget record for a category, if one exists. */
  forCategory(category: string): MorosBudget | undefined {
    return this.items().find((b) => b.category === category);
  }

  /** Budgets as a `{ [category]: budgetCents }` map for the pure budget math. */
  asMap(): { [category: string]: number } {
    const map: { [category: string]: number } = {};
    for (const b of this.items()) {
      map[b.category] = b.budgetCents;
    }
    return map;
  }

  /**
   * Set (or clear) a category's monthly budget. A non-positive value removes
   * the budget so cleared categories don't linger as zero records.
   */
  setBudget(category: string, budgetCents: number) {
    const existing = this.forCategory(category);
    if (budgetCents > 0) {
      if (existing) {
        this.update(existing.id, { budgetCents });
      } else {
        this.create({ category, budgetCents });
      }
    } else if (existing) {
      this.remove(existing.id);
    }
  }
}

export default new BudgetsStore();
