#!/bin/sh
# Conductor workspace setup for Mailspring.
#
# Cold setup is slow: `postinstall` recompiles native modules (better-sqlite3)
# against Electron and downloads the mailsync binary. To make new workspaces
# fast we seed node_modules from the repo root (same Mac, same arch, same
# Electron version) using APFS clonefile (`cp -c`) — near-instant, zero extra
# disk. `npm install` then reconciles the tree and `postinstall` fetches the
# correct mailsync build for this commit.
set -e

# Clone a dir from the root checkout into this workspace if we don't have it.
seed() {
  src="$1"; dst="$2"
  [ -d "$src" ] || return 0
  if [ -e "$dst" ]; then return 0; fi
  cp -Rc "$src" "$dst" 2>/dev/null || cp -R "$src" "$dst"
}

# Only seed locally; cloud workspaces have no populated root to clone from.
if [ "$CONDUCTOR_IS_LOCAL" = "1" ] && [ -d "$CONDUCTOR_ROOT_PATH/app/node_modules" ]; then
  seed "$CONDUCTOR_ROOT_PATH/node_modules" node_modules
  seed "$CONDUCTOR_ROOT_PATH/app/node_modules" app/node_modules
fi

npm install
