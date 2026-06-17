import React from 'react';
import ReactDOM from 'react-dom';

import CommandPalette from './command-palette';
import { buildCommands } from './commands';

const CONTAINER_ID = 'moros-command-palette-container';
const COMMAND = 'moros:toggle-command-palette';

/**
 * Owns the command palette's lifecycle for the package. On `register()` it:
 *   - creates a dedicated DOM container (mirroring `ModalStore`'s container
 *     pattern in `app/src/flux/stores/modal-store.tsx`), and
 *   - registers the `moros:toggle-command-palette` command on `document.body`
 *     via `AppEnv.commands.add` (the standard package command mechanism — see
 *     `app/src/registries/command-registry.ts`). The Cmd/Ctrl-K keystroke maps
 *     to this command through `keymaps/command-palette.json`.
 *
 * `unregister()` disposes the command binding, unmounts React, and removes the
 * container, leaving nothing behind.
 */
class CommandPaletteController {
  _container: HTMLElement | null = null;
  _commandDisposable: { dispose: () => void } | null = null;
  _isOpen = false;

  register() {
    this._container = document.createElement('div');
    this._container.id = CONTAINER_ID;
    document.body.appendChild(this._container);

    this._commandDisposable = AppEnv.commands.add(document.body, COMMAND, this.toggle);
  }

  unregister() {
    if (this._commandDisposable) {
      this._commandDisposable.dispose();
      this._commandDisposable = null;
    }
    if (this._container) {
      ReactDOM.unmountComponentAtNode(this._container);
      this._container.remove();
      this._container = null;
    }
    this._isOpen = false;
  }

  toggle = () => {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  };

  open() {
    if (!this._container) return;
    this._isOpen = true;
    ReactDOM.render(
      <CommandPalette commands={buildCommands()} onClose={this.close} />,
      this._container
    );
  }

  close = () => {
    if (!this._container) return;
    this._isOpen = false;
    ReactDOM.unmountComponentAtNode(this._container);
  };
}

export default new CommandPaletteController();
