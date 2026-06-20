#!/bin/sh
# Run Moros with an isolated workspace-local development data directory.
set -e

. .conductor/node-env.sh

workspace_name="${CONDUCTOR_WORKSPACE_NAME:-local}"
config_dir="$HOME/Library/Application Support/Moros-dev-$workspace_name"

exec npm start -- --config-dir-path "$config_dir"
