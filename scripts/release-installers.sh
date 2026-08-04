#!/bin/sh
set -eu

if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo "A árvore de trabalho precisa estar limpa antes de publicar uma release." >&2
  exit 2
fi

if ! command -v rpmbuild >/dev/null 2>&1; then
  echo "rpmbuild não encontrado; ele é obrigatório para gerar os pacotes RPM do Fedora." >&2
  echo "No macOS, instale o pré-requisito com: brew install rpm" >&2
  exit 2
fi

BRANCH=$(git symbolic-ref --quiet --short HEAD || true)
if [ -z "$BRANCH" ]; then
  echo "A publicação precisa ser executada em uma branch, não em detached HEAD." >&2
  exit 2
fi

git fetch origin "$BRANCH"
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
  echo "A branch local precisa estar sincronizada com origin/$BRANCH." >&2
  exit 2
fi

npm run release:bump
VERSION=$(node -p "require('./package.json').version")

git add package.json package-lock.json
git commit -m "Release v$VERSION"
git push origin "$BRANCH"

npm run dist:installers
npm run publish:update
