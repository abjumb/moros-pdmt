import React from 'react';
import { localized } from 'mailspring-exports';
import TasksStore, {
  MorosTask,
  TaskPriority,
  TaskStatus,
  NEXT_STATUS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  isOverdue,
} from './tasks-store';

interface TasksRootState {
  tasks: ReadonlyArray<MorosTask>;
  draftTitle: string;
  searchQuery: string;
}

export default class TasksRoot extends React.Component<Record<string, unknown>, TasksRootState> {
  static displayName = 'TasksRoot';

  _unlisten?: () => void;

  state: TasksRootState = {
    tasks: TasksStore.items(),
    draftTitle: '',
    searchQuery: '',
  };

  componentDidMount() {
    this._unlisten = TasksStore.listen(() => this.setState({ tasks: TasksStore.items() }));
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
  }

  _onCreate = () => {
    const title = this.state.draftTitle.trim();
    if (!title) return;
    TasksStore.create({ title, status: 'todo', priority: 'none' });
    this.setState({ draftTitle: '' });
  };

  _renderTask(task: MorosTask) {
    return (
      <div className="moros-row" key={task.id}>
        <button
          className={`moros-status-ring status-${task.status}`}
          title={`${STATUS_LABELS[task.status]} — ${localized('Click to advance')}`}
          onClick={() => TasksStore.update(task.id, { status: NEXT_STATUS[task.status] })}
        />
        <span className={`moros-row-title ${task.status === 'done' ? 'is-done' : ''}`}>
          {task.title}
        </span>
        <select
          className="moros-select"
          value={task.priority}
          onChange={(e) => TasksStore.update(task.id, { priority: e.target.value as TaskPriority })}
        >
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={`moros-due-date ${isOverdue(task) ? 'is-overdue' : ''}`}
          title={localized('Due date')}
          value={task.dueDate || ''}
          onChange={(e) => TasksStore.update(task.id, { dueDate: e.target.value })}
        />
        <button
          className="moros-row-delete"
          title={localized('Delete')}
          onClick={() => TasksStore.remove(task.id)}
        >
          &times;
        </button>
      </div>
    );
  }

  _renderGroup(status: TaskStatus, tasks: MorosTask[]) {
    if (tasks.length === 0) return null;
    return (
      <div className="moros-group" key={status}>
        <div className="moros-group-header">
          <span className={`moros-status-ring status-${status}`} />
          <span className="moros-group-title">{STATUS_LABELS[status]}</span>
          <span className="moros-group-count">{tasks.length}</span>
        </div>
        {tasks.map((task) => this._renderTask(task))}
      </div>
    );
  }

  render() {
    const groups = TasksStore.tasksByStatus(this.state.searchQuery);
    const visibleCount = STATUS_ORDER.reduce((sum, status) => sum + groups[status].length, 0);

    return (
      <div className="moros-root moros-tasks">
        <div className="moros-header">
          <h2>{localized('Tasks')}</h2>
        </div>
        <div className="moros-toolbar-row">
          <input
            type="text"
            className="moros-input"
            placeholder={localized('Add a task…')}
            value={this.state.draftTitle}
            onChange={(e) => this.setState({ draftTitle: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && this._onCreate()}
          />
          <input
            type="text"
            className="moros-input moros-input-search"
            placeholder={localized('Search…')}
            value={this.state.searchQuery}
            onChange={(e) => this.setState({ searchQuery: e.target.value })}
          />
          <button className="btn btn-emphasis" onClick={this._onCreate}>
            {localized('New Task')}
          </button>
        </div>
        <div className="moros-scroll-region">
          {visibleCount > 0 ? (
            STATUS_ORDER.map((status) => this._renderGroup(status, groups[status]))
          ) : (
            <div className="moros-empty">
              {this.state.tasks.length > 0
                ? localized('No tasks match your search.')
                : localized('No tasks yet — add your first one above.')}
            </div>
          )}
        </div>
      </div>
    );
  }
}
