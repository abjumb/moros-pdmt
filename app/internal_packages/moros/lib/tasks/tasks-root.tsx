import React from 'react';
import { localized, Actions, DatabaseStore, Thread } from 'moros-exports';
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

type ViewMode = 'list' | 'board';

// Maps number keys to the priority they assign to the selected task.
const PRIORITY_KEYS: { [key: string]: TaskPriority } = {
  '0': 'none',
  '1': 'urgent',
  '2': 'high',
  '3': 'medium',
  '4': 'low',
};

interface TasksRootState {
  tasks: ReadonlyArray<MorosTask>;
  draftTitle: string;
  searchQuery: string;
  labelFilter: string;
  viewMode: ViewMode;
  selectedId: string | null;
}

export default class TasksRoot extends React.Component<Record<string, unknown>, TasksRootState> {
  static displayName = 'TasksRoot';

  _unlisten?: () => void;
  _addInput = React.createRef<HTMLInputElement>();

  state: TasksRootState = {
    tasks: TasksStore.items(),
    draftTitle: '',
    searchQuery: '',
    labelFilter: '',
    viewMode: 'list',
    selectedId: null,
  };

  componentDidMount() {
    this._unlisten = TasksStore.listen(() => this.setState({ tasks: TasksStore.items() }));
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
  }

  // The ordered list of currently-visible tasks, matching the on-screen
  // grouping order so keyboard up/down moves through rows as they're shown.
  _visibleTasks(): MorosTask[] {
    const groups = TasksStore.tasksByStatus(this.state.searchQuery, this.state.labelFilter);
    return STATUS_ORDER.reduce<MorosTask[]>((all, status) => all.concat(groups[status]), []);
  }

  _onCreate = () => {
    const title = this.state.draftTitle.trim();
    if (!title) return;
    const task = TasksStore.create({ title, status: 'todo', priority: 'none' });
    this.setState({ draftTitle: '', selectedId: task.id });
  };

  _addLabel(task: MorosTask, raw: string) {
    const label = raw.trim();
    if (!label) return;
    const labels = task.labels || [];
    if (labels.includes(label)) return;
    TasksStore.update(task.id, { labels: [...labels, label] });
  }

  _removeLabel(task: MorosTask, label: string) {
    const labels = (task.labels || []).filter((l) => l !== label);
    TasksStore.update(task.id, { labels });
    if (this.state.labelFilter === label && !labels.includes(label)) {
      // Don't strand the user on a filter for a label that may no longer exist.
      if (!TasksStore.allLabels().includes(label)) this.setState({ labelFilter: '' });
    }
  }

  _toggleLabelFilter(label: string) {
    this.setState({ labelFilter: this.state.labelFilter === label ? '' : label });
  }

  _openThread(task: MorosTask) {
    if (!task.threadId) return;
    AppEnv.displayWindow();
    DatabaseStore.find<Thread>(Thread, task.threadId)
      .then((thread) => {
        if (!thread) {
          AppEnv.showErrorDialog(localized(`Can't find the linked email in your mailbox.`));
          return;
        }
        Actions.ensureCategoryIsFocused('inbox', thread.accountId);
        Actions.setFocus({ collection: 'thread', item: thread });
      })
      .catch((err) => AppEnv.reportError(err));
  }

  _onRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Never hijack typing inside the toolbar inputs / label editors.
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    const isTyping =
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;

    if (e.key === 'c' && !isTyping) {
      e.preventDefault();
      if (this._addInput.current) this._addInput.current.focus();
      return;
    }

    if (isTyping) return;

    const visible = this._visibleTasks();
    if (visible.length === 0) return;
    const currentIndex = visible.findIndex((t) => t.id === this.state.selectedId);
    const selected = currentIndex >= 0 ? visible[currentIndex] : null;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const next = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, visible.length - 1);
      this.setState({ selectedId: visible[next].id });
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const prev = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
      this.setState({ selectedId: visible[prev].id });
      return;
    }
    if (!selected) return;
    if (Object.prototype.hasOwnProperty.call(PRIORITY_KEYS, e.key)) {
      e.preventDefault();
      TasksStore.update(selected.id, { priority: PRIORITY_KEYS[e.key] });
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const fallback = visible[currentIndex + 1] || visible[currentIndex - 1] || null;
      TasksStore.remove(selected.id);
      this.setState({ selectedId: fallback ? fallback.id : null });
    }
  };

  _renderLabels(task: MorosTask) {
    const labels = task.labels || [];
    return (
      <span className="moros-labels">
        {labels.map((label) => (
          <span className="moros-label-chip" key={label}>
            <button
              type="button"
              className="moros-label-text"
              title={localized('Filter by label')}
              aria-pressed={this.state.labelFilter === label}
              onClick={() => this._toggleLabelFilter(label)}
            >
              {label}
            </button>
            <button
              type="button"
              className="moros-label-remove"
              title={localized('Remove label')}
              aria-label={localized('Remove label %@', label)}
              onClick={() => this._removeLabel(task, label)}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          type="text"
          className="moros-label-add"
          placeholder="+"
          title={localized('Add a label')}
          aria-label={localized('Add a label')}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            this._addLabel(task, e.currentTarget.value);
            e.currentTarget.value = '';
          }}
        />
      </span>
    );
  }

  _renderPrioritySelect(task: MorosTask) {
    return (
      <select
        className="moros-select"
        value={task.priority}
        aria-label={localized('Priority')}
        onChange={(e) => TasksStore.update(task.id, { priority: e.target.value as TaskPriority })}
      >
        {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  _renderThreadLink(task: MorosTask) {
    if (!task.threadId) return null;
    return (
      <button
        type="button"
        className="moros-thread-link"
        title={localized('Open the linked email')}
        aria-label={localized('Open the linked email')}
        onClick={() => this._openThread(task)}
      >
        ✉
      </button>
    );
  }

  _renderTask(task: MorosTask) {
    const selected = this.state.selectedId === task.id;
    return (
      <div
        className={`moros-row ${selected ? 'is-selected' : ''}`}
        key={task.id}
        role="option"
        aria-selected={selected}
        onClick={() => this.setState({ selectedId: task.id })}
      >
        <button
          className={`moros-status-ring status-${task.status}`}
          title={`${STATUS_LABELS[task.status]} — ${localized('Click to advance')}`}
          aria-label={localized('Advance status')}
          onClick={() => TasksStore.update(task.id, { status: NEXT_STATUS[task.status] })}
        />
        <span className={`moros-row-title ${task.status === 'done' ? 'is-done' : ''}`}>
          {task.title}
        </span>
        {this._renderLabels(task)}
        {this._renderThreadLink(task)}
        {this._renderPrioritySelect(task)}
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
          aria-label={localized('Delete task')}
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

  _renderCard(task: MorosTask) {
    const selected = this.state.selectedId === task.id;
    return (
      <div
        className={`moros-card-task ${selected ? 'is-selected' : ''}`}
        key={task.id}
        role="option"
        aria-selected={selected}
        onClick={() => this.setState({ selectedId: task.id })}
      >
        <div className="moros-card-task-head">
          <button
            className={`moros-status-ring status-${task.status}`}
            title={`${STATUS_LABELS[task.status]} — ${localized('Click to advance')}`}
            aria-label={localized('Advance status')}
            onClick={() => TasksStore.update(task.id, { status: NEXT_STATUS[task.status] })}
          />
          <span className={`moros-row-title ${task.status === 'done' ? 'is-done' : ''}`}>
            {task.title}
          </span>
          {this._renderThreadLink(task)}
        </div>
        {this._renderLabels(task)}
        <div className="moros-card-task-foot">
          {this._renderPrioritySelect(task)}
          {task.dueDate ? (
            <span className={`moros-row-date ${isOverdue(task) ? 'is-overdue' : ''}`}>
              {task.dueDate}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  _renderBoardColumn(status: TaskStatus, tasks: MorosTask[]) {
    return (
      <div className="moros-board-column" key={status}>
        <div className="moros-group-header">
          <span className={`moros-status-ring status-${status}`} />
          <span className="moros-group-title">{STATUS_LABELS[status]}</span>
          <span className="moros-group-count">{tasks.length}</span>
        </div>
        <div className="moros-board-column-body" role="listbox" aria-label={STATUS_LABELS[status]}>
          {tasks.map((task) => this._renderCard(task))}
        </div>
      </div>
    );
  }

  _renderViewToggle() {
    return (
      <div className="moros-view-toggle" role="group" aria-label={localized('View')}>
        {(['list', 'board'] as ViewMode[]).map((mode) => (
          <button
            type="button"
            key={mode}
            className={`moros-view-btn ${this.state.viewMode === mode ? 'is-active' : ''}`}
            aria-pressed={this.state.viewMode === mode}
            onClick={() => this.setState({ viewMode: mode })}
          >
            {mode === 'list' ? localized('List') : localized('Board')}
          </button>
        ))}
      </div>
    );
  }

  render() {
    const groups = TasksStore.tasksByStatus(this.state.searchQuery, this.state.labelFilter);
    const visibleCount = STATUS_ORDER.reduce((sum, status) => sum + groups[status].length, 0);
    const allLabels = TasksStore.allLabels();

    return (
      <div
        className="moros-root moros-tasks"
        tabIndex={0}
        role="application"
        aria-label={localized('Tasks')}
        onKeyDown={this._onRootKeyDown}
      >
        <div className="moros-header moros-header-split">
          <h2>{localized('Tasks')}</h2>
          {this._renderViewToggle()}
        </div>
        <div className="moros-toolbar-row">
          <input
            ref={this._addInput}
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
        {allLabels.length > 0 && (
          <div className="moros-toolbar-row moros-label-filter-row">
            <div className="moros-filter-chips">
              {allLabels.map((label) => (
                <button
                  type="button"
                  key={label}
                  className={`moros-filter-chip ${
                    this.state.labelFilter === label ? 'selected' : ''
                  }`}
                  aria-pressed={this.state.labelFilter === label}
                  onClick={() => this._toggleLabelFilter(label)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="moros-scroll-region">
          {visibleCount > 0 ? (
            this.state.viewMode === 'board' ? (
              <div className="moros-board">
                {STATUS_ORDER.map((status) => this._renderBoardColumn(status, groups[status]))}
              </div>
            ) : (
              STATUS_ORDER.map((status) => this._renderGroup(status, groups[status]))
            )
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
