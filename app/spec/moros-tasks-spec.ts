// Direct import from source — the plugin is not registered in moros-exports.
// TasksStore is a singleton backed by a JSON file; in spec mode writes land
// in the throwaway spec config dir, so we just reset its in-memory items
// before each test.
import TasksStore, { MorosTask } from '../internal_packages/moros/lib/tasks/tasks-store';

function resetStore() {
  for (const task of TasksStore.items().slice()) {
    TasksStore.remove(task.id);
  }
}

describe('Moros tasks store', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('labels', () => {
    it('starts with no labels and adds them via update', () => {
      const task = TasksStore.create({ title: 'Ship release', status: 'todo', priority: 'none' });
      expect(task.labels).toBeUndefined();

      TasksStore.update(task.id, { labels: ['urgent', 'release'] });
      const stored = TasksStore.get(task.id) as MorosTask;
      expect(stored.labels).toEqual(['urgent', 'release']);
    });

    it('removes a single label while keeping the rest', () => {
      const task = TasksStore.create({
        title: 'Ship release',
        status: 'todo',
        priority: 'none',
        labels: ['urgent', 'release', 'docs'],
      });

      const remaining = (task.labels || []).filter((l) => l !== 'release');
      TasksStore.update(task.id, { labels: remaining });

      const stored = TasksStore.get(task.id) as MorosTask;
      expect(stored.labels).toEqual(['urgent', 'docs']);
      expect(stored.labels).toContain('urgent');
    });

    it('reports the distinct sorted set of labels across tasks', () => {
      TasksStore.create({
        title: 'A',
        status: 'todo',
        priority: 'none',
        labels: ['beta', 'alpha'],
      });
      TasksStore.create({ title: 'B', status: 'todo', priority: 'none', labels: ['alpha'] });
      TasksStore.create({ title: 'C', status: 'todo', priority: 'none' });

      expect(TasksStore.allLabels()).toEqual(['alpha', 'beta']);
    });
  });

  describe('thread link-back', () => {
    it('persists threadId and threadAccountId on creation', () => {
      const task = TasksStore.create({
        title: 'Reply to Dana',
        status: 'todo',
        priority: 'none',
        threadId: 'thread-123',
        threadAccountId: 'acct-9',
      });

      const stored = TasksStore.get(task.id) as MorosTask;
      expect(stored.threadId).toBe('thread-123');
      expect(stored.threadAccountId).toBe('acct-9');
    });

    it('leaves the linkage undefined for tasks created without a thread', () => {
      const task = TasksStore.create({ title: 'Standalone', status: 'todo', priority: 'none' });
      const stored = TasksStore.get(task.id) as MorosTask;
      expect(stored.threadId).toBeUndefined();
      expect(stored.threadAccountId).toBeUndefined();
    });
  });

  describe('tasksByStatus', () => {
    it('groups tasks under their status', () => {
      TasksStore.create({ title: 'In flight', status: 'in-progress', priority: 'none' });
      TasksStore.create({ title: 'Queued', status: 'todo', priority: 'none' });
      TasksStore.create({ title: 'Shipped', status: 'done', priority: 'none' });

      const groups = TasksStore.tasksByStatus();
      expect(groups['in-progress'].length).toBe(1);
      expect(groups.todo.length).toBe(1);
      expect(groups.done.length).toBe(1);
      expect(groups.backlog.length).toBe(0);
      expect(groups.todo[0].title).toBe('Queued');
    });

    it('sorts within a group by priority, then due date', () => {
      TasksStore.create({ title: 'Low', status: 'todo', priority: 'low' });
      TasksStore.create({ title: 'Urgent', status: 'todo', priority: 'urgent' });
      TasksStore.create({ title: 'Medium', status: 'todo', priority: 'medium' });

      const order = TasksStore.tasksByStatus().todo.map((t) => t.title);
      expect(order).toEqual(['Urgent', 'Medium', 'Low']);
    });

    it('filters by a case-insensitive title query', () => {
      TasksStore.create({ title: 'Pay invoice', status: 'todo', priority: 'none' });
      TasksStore.create({ title: 'Walk dog', status: 'todo', priority: 'none' });

      const groups = TasksStore.tasksByStatus('INVOICE');
      expect(groups.todo.length).toBe(1);
      expect(groups.todo[0].title).toBe('Pay invoice');
    });

    it('filters by an exact label', () => {
      TasksStore.create({ title: 'Tagged', status: 'todo', priority: 'none', labels: ['work'] });
      TasksStore.create({ title: 'Other', status: 'todo', priority: 'none', labels: ['home'] });
      TasksStore.create({ title: 'Untagged', status: 'todo', priority: 'none' });

      const groups = TasksStore.tasksByStatus('', 'work');
      expect(groups.todo.length).toBe(1);
      expect(groups.todo[0].title).toBe('Tagged');
    });

    it('combines the search query and label filter', () => {
      TasksStore.create({
        title: 'Send report',
        status: 'todo',
        priority: 'none',
        labels: ['work'],
      });
      TasksStore.create({
        title: 'Send gift',
        status: 'todo',
        priority: 'none',
        labels: ['home'],
      });

      const groups = TasksStore.tasksByStatus('send', 'work');
      expect(groups.todo.length).toBe(1);
      expect(groups.todo[0].title).toBe('Send report');
    });
  });

  describe('reorderWithinStatus', () => {
    it('assigns sequential order values in the given arrangement', () => {
      const a = TasksStore.create({ title: 'A', status: 'todo', priority: 'none' });
      const b = TasksStore.create({ title: 'B', status: 'todo', priority: 'none' });
      const c = TasksStore.create({ title: 'C', status: 'todo', priority: 'none' });

      TasksStore.reorderWithinStatus('todo', [c.id, a.id, b.id]);

      expect((TasksStore.get(c.id) as MorosTask).order).toBe(0);
      expect((TasksStore.get(a.id) as MorosTask).order).toBe(1);
      expect((TasksStore.get(b.id) as MorosTask).order).toBe(2);
    });

    it('sorts a manually-ordered group by order, ignoring priority', () => {
      // Priority/due-date would normally put Urgent first; manual order wins.
      const low = TasksStore.create({ title: 'Low', status: 'todo', priority: 'low' });
      const urgent = TasksStore.create({ title: 'Urgent', status: 'todo', priority: 'urgent' });

      TasksStore.reorderWithinStatus('todo', [low.id, urgent.id]);

      const order = TasksStore.tasksByStatus().todo.map((t) => t.title);
      expect(order).toEqual(['Low', 'Urgent']);
    });

    it('leaves other status groups on the default auto-sort', () => {
      const todoLow = TasksStore.create({ title: 'TodoLow', status: 'todo', priority: 'low' });
      const todoUrgent = TasksStore.create({
        title: 'TodoUrgent',
        status: 'todo',
        priority: 'urgent',
      });
      // A separate backlog group that we never reorder.
      TasksStore.create({ title: 'BackLow', status: 'backlog', priority: 'low' });
      TasksStore.create({ title: 'BackUrgent', status: 'backlog', priority: 'urgent' });

      TasksStore.reorderWithinStatus('todo', [todoLow.id, todoUrgent.id]);

      const groups = TasksStore.tasksByStatus();
      // Manual group: order respected.
      expect(groups.todo.map((t) => t.title)).toEqual(['TodoLow', 'TodoUrgent']);
      // Untouched group: still priority-sorted (urgent before low).
      expect(groups.backlog.map((t) => t.title)).toEqual(['BackUrgent', 'BackLow']);
    });

    it('appends a newly added task to the end of a manual group', () => {
      const a = TasksStore.create({ title: 'A', status: 'todo', priority: 'low' });
      const b = TasksStore.create({ title: 'B', status: 'todo', priority: 'low' });
      TasksStore.reorderWithinStatus('todo', [a.id, b.id]);

      // New high-priority task: auto-sort would float it to the top, but in a
      // manual group it has no order yet, so it appends at the end.
      TasksStore.create({ title: 'C', status: 'todo', priority: 'urgent' });

      const order = TasksStore.tasksByStatus().todo.map((t) => t.title);
      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('still respects the search query and label filter for a manual group', () => {
      const keep = TasksStore.create({
        title: 'Send report',
        status: 'todo',
        priority: 'none',
        labels: ['work'],
      });
      const other = TasksStore.create({
        title: 'Send gift',
        status: 'todo',
        priority: 'none',
        labels: ['home'],
      });
      TasksStore.reorderWithinStatus('todo', [other.id, keep.id]);

      const groups = TasksStore.tasksByStatus('send', 'work');
      expect(groups.todo.length).toBe(1);
      expect(groups.todo[0].title).toBe('Send report');
    });

    it('skips ids that are missing or belong to a different status', () => {
      const todo = TasksStore.create({ title: 'Todo', status: 'todo', priority: 'none' });
      const backlog = TasksStore.create({ title: 'Backlog', status: 'backlog', priority: 'none' });

      // A stale id and a cross-group id should not be written.
      TasksStore.reorderWithinStatus('todo', ['does-not-exist', todo.id, backlog.id]);

      expect((TasksStore.get(todo.id) as MorosTask).order).toBe(0);
      // The backlog task is not in the 'todo' group, so it keeps no order.
      expect((TasksStore.get(backlog.id) as MorosTask).order).toBeUndefined();
    });
  });
});
