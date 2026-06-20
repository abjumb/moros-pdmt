#!/bin/sh
# Make the repo's Node/npm available in Conductor's non-interactive script shell.

use_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "/opt/homebrew/opt/nvm/nvm.sh"
  elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "/usr/local/opt/nvm/nvm.sh"
  else
    return 1
  fi

  if [ -f .nvmrc ]; then
    nvm use --silent >/dev/null 2>&1 || nvm install --silent >/dev/null
  fi
}

if [ -f .nvmrc ]; then
  use_nvm || true
elif ! command -v npm >/dev/null 2>&1; then
  use_nvm || true
fi

if ! command -v npm >/dev/null 2>&1 && [ -d "$HOME/.volta/bin" ]; then
  PATH="$HOME/.volta/bin:$PATH"
  export PATH
fi

if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.asdf/asdf.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.asdf/asdf.sh"
fi

if ! command -v npm >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Moros Conductor setup requires Node.js and npm on PATH.

Install Node.js >=16.17 with npm >=8, or configure nvm/asdf/Volta so npm is
available to non-interactive shells, then rerun the Conductor setup script.
EOF
  exit 127
fi
