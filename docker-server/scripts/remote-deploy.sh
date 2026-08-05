#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "Uso: $0 <diretorio-remoto> <diretorio-staging> <diretorio-proxy> <container-proxy>" >&2
  exit 2
fi

REMOTE_DIR=$1
STAGING_DIR=$2
PROXY_DIR=$3
PROXY_CONTAINER=$4
CADDY_IMAGE=caddy:2.11.4-alpine
BACKUP_ID=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$REMOTE_DIR/.deploy-backups/$BACKUP_ID"
VALIDATION_DIR="$REMOTE_DIR/.proxy-validation.$BACKUP_ID.$$"
PROXY_CONFIG_DIR="$PROXY_DIR/config"
SITE_CONFIG="$PROXY_CONFIG_DIR/sites/mferunner.caddy"
SITE_CONFIG_NEW="$PROXY_CONFIG_DIR/sites/.mferunner.caddy.new.$$"

case "$REMOTE_DIR" in
  /*) ;;
  *)
    echo "O diretório remoto deve ser absoluto: $REMOTE_DIR" >&2
    exit 2
    ;;
esac

case "$PROXY_DIR" in
  /*) ;;
  *)
    echo "O diretório do proxy deve ser absoluto: $PROXY_DIR" >&2
    exit 2
    ;;
esac

case "$STAGING_DIR" in
  "$REMOTE_DIR"/.deploy-staging-*) ;;
  *)
    echo "O staging não pertence ao diretório isolado do MFE Runner." >&2
    exit 2
    ;;
esac

case "$REMOTE_DIR$STAGING_DIR$PROXY_DIR$PROXY_CONTAINER" in
  *[!0-9A-Za-z_./-]*)
    echo "Parâmetros de deploy contêm caracteres inválidos." >&2
    exit 2
    ;;
esac

if [ ! -f "$STAGING_DIR/mferunner.caddy" ]; then
  echo "Fragmento Caddy do MFE Runner ausente no staging." >&2
  exit 2
fi

if [ ! -d "$STAGING_DIR/landing-page" ]; then
  echo "Landing page ausente no staging." >&2
  exit 2
fi

if [ ! -f "$PROXY_CONFIG_DIR/Caddyfile" ] || [ ! -d "$PROXY_CONFIG_DIR/sites" ]; then
  echo "Configuração do proxy compartilhado não encontrada em $PROXY_CONFIG_DIR" >&2
  exit 2
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync não encontrado no servidor." >&2
  exit 2
fi

if ! docker inspect "$PROXY_CONTAINER" >/dev/null 2>&1; then
  echo "Container do proxy compartilhado não encontrado: $PROXY_CONTAINER" >&2
  exit 2
fi

cleanup_temporary_files() {
  case "$VALIDATION_DIR" in
    "$REMOTE_DIR"/.proxy-validation.*) rm -rf -- "$VALIDATION_DIR" ;;
  esac
  rm -f -- "$SITE_CONFIG_NEW"
}
trap cleanup_temporary_files EXIT INT TERM

reload_proxy() {
  docker exec "$PROXY_CONTAINER" \
    caddy validate --config /etc/caddy/Caddyfile
  docker exec "$PROXY_CONTAINER" \
    caddy reload --config /etc/caddy/Caddyfile \
    --address 127.0.0.1:2019
}

resolve_served_landing_dir() {
  mounted_identity=$(docker exec "$PROXY_CONTAINER" \
    stat -c '%d:%i' /srv/mferunner 2>/dev/null || true)
  if [ -z "$mounted_identity" ]; then
    return 1
  fi

  for candidate in \
    "$REMOTE_DIR/landing-page" \
    "$REMOTE_DIR"/.landing-page.previous.*; do
    if [ ! -d "$candidate" ]; then
      continue
    fi
    candidate_identity=$(stat -c '%d:%i' "$candidate" 2>/dev/null || true)
    if [ "$candidate_identity" = "$mounted_identity" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

sync_landing() {
  source_dir=$1
  target_dir=$2
  mkdir -p "$target_dir"
  rsync -a --delete --delay-updates "$source_dir/" "$target_dir/"
}

wait_for_health() {
  attempt=0
  while [ "$attempt" -lt 20 ]; do
    status=$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$PROXY_CONTAINER" 2>/dev/null || true)
    if [ "$status" = "healthy" ] && \
      docker exec "$PROXY_CONTAINER" test -f /srv/mferunner/download-catalog.js; then
      return 0
    fi
    case "$status" in
      unhealthy|exited|dead)
        return 1
        ;;
    esac
    attempt=$((attempt + 1))
    sleep 1
  done
  return 1
}

restore_previous_files() {
  echo "Restaurando a última configuração conhecida do MFE Runner..." >&2

  if [ -d "$BACKUP_DIR/landing-page" ]; then
    sync_landing "$BACKUP_DIR/landing-page" "$REMOTE_DIR/landing-page"
  fi

  if [ -d "$BACKUP_DIR/served-landing-page" ]; then
    sync_landing "$BACKUP_DIR/served-landing-page" "$SERVED_LANDING_DIR"
  fi

  if [ -f "$BACKUP_DIR/mferunner.caddy" ]; then
    cp "$BACKUP_DIR/mferunner.caddy" "$SITE_CONFIG_NEW"
    mv "$SITE_CONFIG_NEW" "$SITE_CONFIG"
  fi

  reload_proxy
}

echo "Validando o fragmento do MFE Runner com a configuração compartilhada..."
cp -R "$PROXY_CONFIG_DIR" "$VALIDATION_DIR"
cp "$STAGING_DIR/mferunner.caddy" "$VALIDATION_DIR/sites/mferunner.caddy"
docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /data \
  --tmpfs /config \
  --security-opt no-new-privileges:true \
  -v "$VALIDATION_DIR:/etc/caddy:ro" \
  "$CADDY_IMAGE" \
  caddy validate --config /etc/caddy/Caddyfile

SERVED_LANDING_DIR=$(resolve_served_landing_dir || true)
if [ -z "$SERVED_LANDING_DIR" ]; then
  echo "Não foi possível localizar o diretório montado em /srv/mferunner." >&2
  exit 2
fi

mkdir -p "$REMOTE_DIR" "$BACKUP_DIR"

if [ -d "$REMOTE_DIR/landing-page" ]; then
  cp -R "$REMOTE_DIR/landing-page" "$BACKUP_DIR/landing-page"
fi
if [ "$SERVED_LANDING_DIR" != "$REMOTE_DIR/landing-page" ]; then
  cp -R "$SERVED_LANDING_DIR" "$BACKUP_DIR/served-landing-page"
fi
if [ -f "$SITE_CONFIG" ]; then
  cp "$SITE_CONFIG" "$BACKUP_DIR/mferunner.caddy"
fi

# O primeiro deploy com o modelo antigo renomeava o diretório já montado pelo
# proxy. Enquanto esse bind mount existir, atualizamos tanto o caminho canônico
# quanto o inode que o container realmente está servindo.
sync_landing "$STAGING_DIR/landing-page" "$REMOTE_DIR/landing-page"
if [ "$SERVED_LANDING_DIR" != "$REMOTE_DIR/landing-page" ]; then
  sync_landing "$STAGING_DIR/landing-page" "$SERVED_LANDING_DIR"
fi

cp "$STAGING_DIR/mferunner.caddy" "$SITE_CONFIG_NEW"
mv "$SITE_CONFIG_NEW" "$SITE_CONFIG"

if ! reload_proxy; then
  restore_previous_files
  exit 1
fi

if ! wait_for_health; then
  echo "O proxy compartilhado não confirmou a landing page atualizada." >&2
  restore_previous_files
  exit 1
fi

echo "Deploy concluído. Somente a landing page e o fragmento Caddy do MFE Runner foram alterados."
docker inspect \
  --format '{{.Name}}: {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
  "$PROXY_CONTAINER"
