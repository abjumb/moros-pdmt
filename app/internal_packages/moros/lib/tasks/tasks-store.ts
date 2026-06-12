import MorosDataStore, { MorosRecord } from '../moros-data-store';

export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

export interface MorosTask extends MorosRecord {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
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

class TasksStore extends MorosDataStore<MorosTask> {
  constructor() {
    super('tasks.json');
  }

  tasksByStatus(): { [S in TaskStatus]: MorosTask[] } {
    const groups: { [S in TaskStatus]: MorosTask[] } = {
      backlog: [],
      todo: [],
      'in-progress': [],
      done: [],
    };
    for (const task of this.items()) {
      (groups[task.status] || groups.backlog).push(task);
    }
    return groups;
  }
}

export default new TasksStore();
