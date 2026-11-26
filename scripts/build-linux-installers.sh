#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
IMAGE=mfe-runner-linux-packager:node24-rpm
NODE_MODULES_DIR="$PROJECT_DIR/node_modules"

case "$(uname -s)" in
  Darwin)
    ELECTRON_CACHE_DIR="$HOME/Library/Caches/electron"
    ELECTRON_BUILDER_CACHE_DIR="$HOME/Library/Caches/electron-builder"
    ;;
  *)
    CACHE_ROOT=${XDG_CACHE_HOME:-"$HOME/.cache"}
    ELECTRON_CACHE_DIR="$CACHE_ROOT/electron"
    ELECTRON_BUILDER_CACHE_DIR="$CACHE_ROOT/electron-builder"
    ;;
esac

usage() {
  echo "Uso: $0 <deb|rpm> [outros targets/arquiteturas do electron-builder]" >&2
  echo "       $0 --prepare" >&2
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado; ele é obrigatório para gerar instaladores Linux." >&2
  exit 2
fi

echo "Verificando Docker (limite de 15 segundos)..."
if ! node "$SCRIPT_DIR/build-network.mjs" --timeout-ms 15000 -- docker info >/dev/null; then
  echo "Docker não está disponível. Inicie o Docker Desktop e tente novamente." >&2
  exit 2
fi

echo "Preparando imagem de empacotamento Linux..."
node "$SCRIPT_DIR/build-network.mjs" --attempts 3 -- docker build \
  --file "$SCRIPT_DIR/linux-packager.Dockerfile" \
  --tag "$IMAGE" \
  "$SCRIPT_DIR"

mkdir -p "$ELECTRON_CACHE_DIR" "$ELECTRON_BUILDER_CACHE_DIR"
node "$SCRIPT_DIR/prepare-linux-electron.mjs" "$ELECTRON_CACHE_DIR"

if [ "${1:-}" = "--prepare" ]; then
  if [ "$#" -ne 1 ]; then
    usage
    exit 2
  fi
  exit 0
fi

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

if [ ! -d "$NODE_MODULES_DIR" ]; then
  echo "node_modules não encontrado. Execute 'npm ci' no host antes de empacotar." >&2
  exit 2
fi

run_in_linux_packager() {
  node "$SCRIPT_DIR/build-network.mjs" --attempts 3 -- docker run --rm \
    --mount "type=bind,source=$PROJECT_DIR,target=/project" \
    --mount "type=bind,source=$NODE_MODULES_DIR,target=/project/node_modules,readonly" \
    --mount "type=bind,source=$ELECTRON_CACHE_DIR,target=/root/.cache/electron" \
    --mount "type=bind,source=$ELECTRON_BUILDER_CACHE_DIR,target=/root/.cache/electron-builder" \
    --workdir /project \
    "$IMAGE" \
    "$@"
}

echo "Gerando pacotes Linux com Electron já verificado no cache..."
run_in_linux_packager npm exec electron-builder -- --linux "$@" \
  --config.electronDist=/root/.cache/electron/mfe-runner-linux --publish never
