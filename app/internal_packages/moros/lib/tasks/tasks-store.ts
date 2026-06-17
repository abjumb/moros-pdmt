import MorosDataStore, { MorosRecord, todayISO } from '../moros-data-store';

export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

export interface MorosTask extends MorosRecord {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Optional ISO date (yyyy-mm-dd). Empty string / undefined = no due date. */
  dueDate?: string;
  /** Free-form labels for grouping/filtering. */
  labels?: string[];
  /** Id of the originating email thread, when the task was filed from mail. */
  threadId?: string;
  /** Account id of the originating thread — needed to reopen it. */
  threadAccountId?: string;
  /**
   * Manual sort position within a status group. Undefined = not manually
   * ordered (the group falls back to the priority/due-date auto-sort). Once
   * the user drags within a group, every task in that group is assigned a
   * sequential `order`, switching the whole group to manual ordering.
   */
  order?: number;
}

export const STATUS_ORDER: TaskStatus[] = ['in-progress', 'todo', 'backlog', 'done'];

export const STATUS_LABELS: { [S in TaskStatus]: string } = {
  backlog: 'Backlog',
  todo: 'Todo',
  'in-progress': 'In Progress',
  done: 'Done',
};

export const PRIORITY_LABELS: { [P in TaskPriority]: string } = {
  none: 'No priority',
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// Clicking a task's status ring advances it through the workflow, Linear-style.
export const NEXT_STATUS: { [S in TaskStatus]: TaskStatus } = {
  backlog: 'todo',
  todo: 'in-progress',
  'in-progress': 'done',
  done: 'backlog',
};

const PRIORITY_RANK: { [P in TaskPriority]: number } = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export function isOverdue(task: MorosTask) {
  return !!task.dueDate && task.status !== 'done' && task.dueDate < todayISO();
}

class TasksStore extends MorosDataStore<MorosTask> {
  constructor() {
    super('tasks.json');
  }

  /** Distinct labels across all tasks, alphabetically sorted. */
  allLabels(): string[] {
    const seen = new Set<string>();
    for (const task of this.items()) {
      for (const label of task.labels || []) seen.add(label);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }

  tasksByStatus(query = '', label = ''): { [S in TaskStatus]: MorosTask[] } {
    const normalized = query.trim().toLowerCase();
    const groups: { [S in TaskStatus]: MorosTask[] } = {
      backlog: [],
      todo: [],
      'in-progress': [],
      done: [],
    };
    for (const task of this.items()) {
      if (normalized && !task.title.toLowerCase().includes(normalized)) continue;
      if (label && !(task.labels || []).includes(label)) continue;
      (groups[task.status] || groups.backlog).push(task);
    }
    // Manual-vs-auto sort rule: if ANY task in a status group carries an
    // explicit `order`, the user has dragged within that group, so honour the
    // manual arrangement (sort ascending by `order`; tasks added since — which
    // have no `order` yet — sort last, i.e. append at the end). Otherwise fall
    // back to the default Linear ordering: priority first, then nearest due
    // date (undated last), then newest first.
    for (const status of Object.keys(groups) as TaskStatus[]) {
      const group = groups[status];
      if (group.some((t) => t.order !== undefined)) {
        group.sort(
          (a, b) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
            b.createdAt - a.createdAt
        );
      } else {
        group.sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
            b.createdAt - a.createdAt
        );
      }
    }
    return groups;
  }

  /**
   * Switch a status group to manual ordering by writing a sequential `order`
   * to each task in `orderedIds` (the group's tasks in their new arrangement).
   * Pure with respect to inputs: it only depends on the ids passed in and the
   * store's current items. Ids that don't exist or aren't in `status` are
   * skipped, so a stale drop can't corrupt another group.
   */
  reorderWithinStatus(status: TaskStatus, orderedIds: string[]) {
    let position = 0;
    for (const id of orderedIds) {
      const task = this.get(id);
      if (!task || task.status !== status) continue;
      this.update(id, { order: position });
      position += 1;
    }
  }
}

export default new TasksStore();
