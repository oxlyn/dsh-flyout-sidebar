#!/bin/sh
# Pre-commit guard: keep the built bundles (dist/index.js, dist/client.js) in
# sync with the TS/TSX source under src/. Rebuilds them with tsdown, then
# blocks the commit when the staged bundles are stale (source edited but not
# rebuilt). Install once with:
#
#   ln -sf ../../scripts/precommit.sh .git/hooks/pre-commit
set -e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "[pre-commit] tsdown 重新构建 dist/ …"
npm run -s build

if ! git diff --quiet -- dist; then
  echo "" >&2
  echo "[pre-commit] ✗ 构建产物与源码不同步，已取消本次提交。" >&2
  echo "[pre-commit]   已重新构建产物，请执行:" >&2
  echo "[pre-commit]     git add dist && git commit" >&2
  exit 1
fi

echo "[pre-commit] ✓ 构建产物已同步"
