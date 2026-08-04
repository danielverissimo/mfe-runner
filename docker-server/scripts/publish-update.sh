#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Uso: $0 <versao> [diretorio-de-artefatos]" >&2
  exit 2
fi

VERSION=$1
case "$VERSION" in
  *[!0-9A-Za-z._-]*|'')
    echo "Versão inválida: $VERSION" >&2
    exit 2
    ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
SOURCE_DIR=${2:-"$PROJECT_DIR/release"}
REPOSITORY=${MFE_RUNNER_GITHUB_REPOSITORY:-danielverissimo/mfe-runner}
TAG="v$VERSION"
UPLOAD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mfe-runner-update.XXXXXX")
trap 'rm -rf "$UPLOAD_DIR"' EXIT INT TERM

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) não encontrado. Instale-o e execute 'gh auth login'." >&2
  exit 2
fi

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "GitHub CLI não está autenticado. Execute 'gh auth login --hostname github.com'." >&2
  exit 2
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Diretório de artefatos não encontrado: $SOURCE_DIR" >&2
  exit 2
fi

METADATA_COUNT=$(find "$SOURCE_DIR" -maxdepth 1 -type f -name 'latest*.yml' | wc -l | tr -d ' ')
if [ "$METADATA_COUNT" -eq 0 ]; then
  echo "Nenhum metadado latest*.yml encontrado em $SOURCE_DIR" >&2
  exit 2
fi

find "$SOURCE_DIR" -maxdepth 1 -type f -name 'latest*.yml' -exec cp {} "$UPLOAD_DIR/" \;

# A landing page oferece todos os instaladores da versão, enquanto o updater
# também precisa dos ZIPs do macOS e dos blockmaps referenciados nos metadados.
find "$SOURCE_DIR" -maxdepth 1 -type f \
  \( -name "MFE-Runner-$VERSION-*.dmg" \
  -o -name "MFE-Runner-$VERSION-*.zip" \
  -o -name "MFE-Runner-$VERSION-*.exe" \
  -o -name "MFE-Runner-$VERSION-*.deb" \
  -o -name "MFE-Runner-$VERSION-*.rpm" \
  -o -name "MFE-Runner-$VERSION-*.blockmap" \) \
  -exec cp {} "$UPLOAD_DIR/" \;

for metadata in "$UPLOAD_DIR"/latest*.yml; do
  sed -n 's/^[[:space:]]*-[[:space:]]*url:[[:space:]]*//p' "$metadata"
done | sort -u | while IFS= read -r artifact; do
  case "$artifact" in
    *[!0-9A-Za-z._-]*|'')
      echo "Nome de artefato inválido nos metadados: $artifact" >&2
      exit 2
      ;;
  esac
  if [ ! -f "$SOURCE_DIR/$artifact" ]; then
    echo "Artefato referenciado não encontrado: $SOURCE_DIR/$artifact" >&2
    exit 2
  fi
  if [ ! -f "$UPLOAD_DIR/$artifact" ]; then
    cp "$SOURCE_DIR/$artifact" "$UPLOAD_DIR/"
  fi
  if [ -f "$SOURCE_DIR/$artifact.blockmap" ]; then
    cp "$SOURCE_DIR/$artifact.blockmap" "$UPLOAD_DIR/"
  fi
done

INSTALLER_COUNT=$(find "$UPLOAD_DIR" -maxdepth 1 -type f \
  \( -name '*.dmg' -o -name '*.exe' -o -name '*.deb' -o -name '*.rpm' \) | wc -l | tr -d ' ')
if [ "$INSTALLER_COUNT" -eq 0 ]; then
  echo "Nenhum instalador da versão $VERSION encontrado em $SOURCE_DIR" >&2
  exit 2
fi

RPM_COUNT=$(find "$UPLOAD_DIR" -maxdepth 1 -type f \
  -name "MFE-Runner-$VERSION-*.rpm" | wc -l | tr -d ' ')
if [ "$RPM_COUNT" -ne 2 ]; then
  echo "A release exige os pacotes RPM x64 e arm64; encontrados: $RPM_COUNT" >&2
  exit 2
fi

if gh release view "$TAG" --repo "$REPOSITORY" >/dev/null 2>&1; then
  echo "A release $TAG já existe em $REPOSITORY e não será sobrescrita." >&2
  exit 2
fi

DEFAULT_BRANCH=$(gh repo view "$REPOSITORY" --json defaultBranchRef --jq '.defaultBranchRef.name // empty')
if [ -z "$DEFAULT_BRANCH" ]; then
  echo "O repositório $REPOSITORY ainda não possui uma branch padrão." >&2
  echo "Envie o código-fonte para o GitHub antes de criar a primeira release." >&2
  exit 2
fi

gh release create "$TAG" \
  --repo "$REPOSITORY" \
  --target "$DEFAULT_BRANCH" \
  --title "MFE Runner $VERSION" \
  --notes "Instaladores oficiais do MFE Runner $VERSION para macOS, Windows, Debian/Ubuntu e Fedora/RHEL." \
  --draft

if ! gh release upload "$TAG" "$UPLOAD_DIR"/* --repo "$REPOSITORY"; then
  echo "Falha ao enviar os artefatos. A release $TAG foi mantida como rascunho." >&2
  exit 1
fi

gh release edit "$TAG" --repo "$REPOSITORY" --draft=false --latest

echo "Versão $VERSION publicada em https://github.com/$REPOSITORY/releases/tag/$TAG"
