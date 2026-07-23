#!/usr/bin/env bash
# Clone/update upstream pi-web, apply Chinese overlay, build and optionally install globally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${PI_WEB_DIR:-${ROOT}/.upstream/pi-web}"
UPSTREAM_URL="$(python3 - <<PY
import json
from pathlib import Path
print(json.load(open("${ROOT}/BASE.json")).get("upstream", "https://github.com/agegr/pi-web.git"))
PY
)"
INSTALL_GLOBAL=0
REF=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/sync-upstream.sh [--dir <path>] [--ref <git-ref>] [--install]

  --dir PATH   Working copy of upstream (default: .upstream/pi-web or $PI_WEB_DIR)
  --ref REF    Checkout this upstream ref/tag/commit after fetch (default: origin/main)
  --install    After build, run npm install -g .

Workflow:
  1. clone/fetch agegr/pi-web
  2. apply this repo's Chinese overlay (hybrid)
  3. npm install && npm run build
  4. optional global install
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) WORK_DIR="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --install) INSTALL_GLOBAL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

mkdir -p "$(dirname "${WORK_DIR}")"

if [[ ! -d "${WORK_DIR}/.git" ]]; then
  echo "Cloning ${UPSTREAM_URL} -> ${WORK_DIR}"
  git clone --depth 1 "${UPSTREAM_URL}" "${WORK_DIR}"
else
  echo "Fetching upstream in ${WORK_DIR}"
  git -C "${WORK_DIR}" fetch --tags --force origin
fi

if [[ -n "${REF}" ]]; then
  git -C "${WORK_DIR}" checkout --force "${REF}"
else
  git -C "${WORK_DIR}" checkout --force main 2>/dev/null || git -C "${WORK_DIR}" checkout --force master
  git -C "${WORK_DIR}" reset --hard origin/main 2>/dev/null || git -C "${WORK_DIR}" reset --hard origin/master
fi

echo "Clean upstream at $(git -C "${WORK_DIR}" rev-parse --short HEAD)"
# Drop any previous localization
git -C "${WORK_DIR}" clean -fd
git -C "${WORK_DIR}" reset --hard HEAD

"${ROOT}/scripts/apply.sh" "${WORK_DIR}" hybrid

cd "${WORK_DIR}"
if [[ -f package-lock.json ]]; then
  npm ci || npm install
else
  npm install
fi
npm run build

if [[ "${INSTALL_GLOBAL}" -eq 1 ]]; then
  npm install -g .
  echo "Installed globally. Restart pi-web to use the Chinese UI."
fi

echo "Done. Tree: ${WORK_DIR}"
