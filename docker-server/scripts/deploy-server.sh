#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVER_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REMOTE_HOST=${MFE_RUNNER_UPDATE_HOST:-forge@mferunner.com}
REMOTE_DIR=${MFE_RUNNER_UPDATE_REMOTE_DIR:-/home/forge/mfe-runner-update-server}

ssh "$REMOTE_HOST" \
  "mkdir -p '$REMOTE_DIR/landing-page/assets'"

rsync -av \
  "$SERVER_DIR/compose.yml" \
  "$SERVER_DIR/Caddyfile" \
  "$REMOTE_HOST:$REMOTE_DIR/"

rsync -av --delete \
  "$SERVER_DIR/landing-page/" \
  "$REMOTE_HOST:$REMOTE_DIR/landing-page/"

ssh "$REMOTE_HOST" \
  "cd '$REMOTE_DIR' && docker compose pull && docker compose up -d --force-recreate && docker compose ps"
