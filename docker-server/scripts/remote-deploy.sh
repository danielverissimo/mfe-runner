#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "Uso: $0 <diretorio-remoto> <diretorio-staging> <projeto-compose>" >&2
  exit 2
fi

REMOTE_DIR=$1
STAGING_DIR=$2
COMPOSE_PROJECT=$3
CADDY_IMAGE=caddy:2.11.4-alpine
BACKUP_ID=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$REMOTE_DIR/.deploy-backups/$BACKUP_ID"
PREVIOUS_LANDING="$REMOTE_DIR/.landing-page.previous.$$"
NEW_LANDING="$REMOTE_DIR/.landing-page.new.$$"

case "$REMOTE_DIR" in
  /*) ;;
  *)
    echo "O diretório remoto deve ser absoluto: $REMOTE_DIR" >&2
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

case "$REMOTE_DIR$STAGING_DIR$COMPOSE_PROJECT" in
  *[!0-9A-Za-z_./-]*)
    echo "Parâmetros de deploy contêm caracteres inválidos." >&2
    exit 2
    ;;
esac

for required_file in compose.yml Caddyfile; do
  if [ ! -f "$STAGING_DIR/$required_file" ]; then
    echo "Arquivo obrigatório ausente no staging: $required_file" >&2
    exit 2
  fi
done

if [ ! -d "$STAGING_DIR/landing-page" ]; then
  echo "Landing page ausente no staging." >&2
  exit 2
fi

compose_live() {
  docker compose \
    --project-name "$COMPOSE_PROJECT" \
    --project-directory "$REMOTE_DIR" \
    -f "$REMOTE_DIR/compose.yml" \
    "$@"
}

restore_previous_files() {
  echo "Restaurando a última configuração conhecida do MFE Runner..." >&2

  if [ -f "$BACKUP_DIR/compose.yml" ]; then
    cp "$BACKUP_DIR/compose.yml" "$REMOTE_DIR/.compose.yml.rollback"
    mv "$REMOTE_DIR/.compose.yml.rollback" "$REMOTE_DIR/compose.yml"
  fi

  if [ -f "$BACKUP_DIR/Caddyfile" ]; then
    cp "$BACKUP_DIR/Caddyfile" "$REMOTE_DIR/.Caddyfile.rollback"
    mv "$REMOTE_DIR/.Caddyfile.rollback" "$REMOTE_DIR/Caddyfile"
  fi

  if [ -d "$BACKUP_DIR/landing-page" ]; then
    rm -rf -- "$REMOTE_DIR/landing-page"
    cp -R "$BACKUP_DIR/landing-page" "$REMOTE_DIR/landing-page"
  fi

  if [ -f "$REMOTE_DIR/compose.yml" ]; then
    compose_live up -d --force-recreate --no-deps update-server
  fi
}

wait_for_health() {
  CONTAINER_ID=$(compose_live ps -q update-server)
  if [ -z "$CONTAINER_ID" ]; then
    return 1
  fi

  attempt=0
  while [ "$attempt" -lt 40 ]; do
    status=$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$CONTAINER_ID" 2>/dev/null || true)
    case "$status" in
      healthy)
        return 0
        ;;
      unhealthy|exited|dead)
        return 1
        ;;
    esac
    attempt=$((attempt + 1))
    sleep 2
  done

  return 1
}

echo "Validando a configuração Compose em staging..."
docker compose \
  --project-name "$COMPOSE_PROJECT-validation" \
  --project-directory "$STAGING_DIR" \
  -f "$STAGING_DIR/compose.yml" \
  config --quiet

echo "Validando o Caddyfile sem acessar a rede..."
docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /data \
  --tmpfs /config \
  --security-opt no-new-privileges:true \
  -v "$STAGING_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
  "$CADDY_IMAGE" \
  caddy validate --config /etc/caddy/Caddyfile

mkdir -p "$REMOTE_DIR" "$BACKUP_DIR"

if [ -f "$REMOTE_DIR/compose.yml" ]; then
  cp "$REMOTE_DIR/compose.yml" "$BACKUP_DIR/compose.yml"
fi
if [ -f "$REMOTE_DIR/Caddyfile" ]; then
  cp "$REMOTE_DIR/Caddyfile" "$BACKUP_DIR/Caddyfile"
fi
if [ -d "$REMOTE_DIR/landing-page" ]; then
  cp -R "$REMOTE_DIR/landing-page" "$BACKUP_DIR/landing-page"
fi

cp "$STAGING_DIR/compose.yml" "$REMOTE_DIR/.compose.yml.new"
cp "$STAGING_DIR/Caddyfile" "$REMOTE_DIR/.Caddyfile.new"
rm -rf -- "$NEW_LANDING" "$PREVIOUS_LANDING"
cp -R "$STAGING_DIR/landing-page" "$NEW_LANDING"

mv "$REMOTE_DIR/.compose.yml.new" "$REMOTE_DIR/compose.yml"
mv "$REMOTE_DIR/.Caddyfile.new" "$REMOTE_DIR/Caddyfile"
if [ -d "$REMOTE_DIR/landing-page" ]; then
  mv "$REMOTE_DIR/landing-page" "$PREVIOUS_LANDING"
fi
mv "$NEW_LANDING" "$REMOTE_DIR/landing-page"

echo "Atualizando somente o serviço update-server do projeto $COMPOSE_PROJECT..."
if ! compose_live up -d --pull always --force-recreate --no-deps update-server; then
  restore_previous_files
  exit 1
fi

if ! wait_for_health; then
  echo "O serviço do MFE Runner não ficou saudável. O deploy será revertido." >&2
  compose_live logs --tail 100 update-server >&2 || true
  restore_previous_files
  exit 1
fi

rm -rf -- "$PREVIOUS_LANDING"

echo "Deploy concluído. Outros projetos Compose, containers e arquivos do Caddy não foram alterados."
compose_live ps update-server
