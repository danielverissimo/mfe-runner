#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVER_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REMOTE_HOST=${MFE_RUNNER_UPDATE_HOST:-forge@mferunner.com}
REMOTE_DIR=${MFE_RUNNER_UPDATE_REMOTE_DIR:-/home/forge/mfe-runner-update-server}
COMPOSE_PROJECT=${MFE_RUNNER_COMPOSE_PROJECT:-mfe-runner-update-server}
DEPLOY_ID=$(date -u +%Y%m%dT%H%M%SZ)-$$
REMOTE_STAGING="$REMOTE_DIR/.deploy-staging-$DEPLOY_ID"

case "$REMOTE_DIR" in
  /*) ;;
  *)
    echo "O diretório remoto deve ser absoluto: $REMOTE_DIR" >&2
    exit 2
    ;;
esac

case "$REMOTE_DIR$COMPOSE_PROJECT" in
  *[!0-9A-Za-z_./-]*)
    echo "Diretório remoto ou nome do projeto Compose contém caracteres inválidos." >&2
    exit 2
    ;;
esac

cleanup_staging() {
  ssh "$REMOTE_HOST" \
    "case '$REMOTE_STAGING' in '$REMOTE_DIR'/.deploy-staging-*) rm -rf -- '$REMOTE_STAGING' ;; *) exit 2 ;; esac" \
    >/dev/null 2>&1 || true
}
trap cleanup_staging EXIT INT TERM

ssh "$REMOTE_HOST" \
  "mkdir -p '$REMOTE_STAGING/landing-page'"

rsync -av \
  "$SERVER_DIR/compose.yml" \
  "$SERVER_DIR/Caddyfile" \
  "$SCRIPT_DIR/remote-deploy.sh" \
  "$REMOTE_HOST:$REMOTE_STAGING/"

rsync -av \
  "$SERVER_DIR/landing-page/" \
  "$REMOTE_HOST:$REMOTE_STAGING/landing-page/"

ssh "$REMOTE_HOST" \
  "sh '$REMOTE_STAGING/remote-deploy.sh' '$REMOTE_DIR' '$REMOTE_STAGING' '$COMPOSE_PROJECT'"
