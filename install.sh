#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Instala Node 18 o superior antes de continuar." >&2
  exit 1
fi
node agent/cli.mjs install
node agent/cli.mjs start
