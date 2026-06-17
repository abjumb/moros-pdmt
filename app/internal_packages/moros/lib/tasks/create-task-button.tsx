import React from 'react';
import { localized, Thread } from 'moros-exports';
import { RetinaImg } from 'moros-component-kit';
import TasksStore from './tasks-store';

/**
 * Toolbar button rendered alongside Archive / Snooze etc. (the
 * `ThreadActionsToolbarButton` role) that files the selected email
 * thread(s) as Moros tasks, titled with each thread's subject.
 */
export default class CreateTaskButton extends React.Component<
  { items: Thread[] },
  { createdAtMs: number }
> {
  static displayName = 'CreateTaskButton';
  static containerRequired = false;

  state = { createdAtMs: 0 };

  _resetTimer: ReturnType<typeof setTimeout> | null = null;

  componentWillUnmount() {
    if (this._resetTimer) clearTimeout(this._resetTimer);
  }

  _onCreate = () => {
    for (const thread of this.props.items) {
      TasksStore.create({
        title: thread.subject || localized('(No Subject)'),
        status: 'todo',
        priority: 'none',
        threadId: thread.id,
        threadAccountId: thread.accountId,
      });
    }
    if (this._resetTimer) clearTimeout(this._resetTimer);
    this.setState({ createdAtMs: Date.now() });
    this._resetTimer = setTimeout(() => this.setState({ createdAtMs: 0 }), 1500);
  };

  render() {
    if (this.props.items.length === 0) {
      return false;
    }
    const justCreated = Date.now() - this.state.createdAtMs < 1500;
    return (
      <button
        className="btn btn-toolbar moros-create-task-btn"
        title={
          justCreated
            ? localized('Task created')
            : this.props.items.length === 1
              ? localized('Create task from email')
              : localized('Create tasks from emails')
        }
        onClick={this._onCreate}
      >
        <RetinaImg name="today.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}
