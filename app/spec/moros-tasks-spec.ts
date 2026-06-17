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
});
