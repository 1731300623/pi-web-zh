#!/usr/bin/env bash
# Apply Chinese localization overlay onto a pi-web source tree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"
MODE="${2:-overlay}" # overlay | patch | hybrid

usage() {
  cat <<'EOF'
Usage:
  ./scripts/apply.sh <pi-web-source-dir> [overlay|patch|hybrid]

Modes:
  overlay  Copy files from overlay/ over the target (default).
           Best when target is close to BASE.json upstream_commit.
  patch    Apply patches/zh-cn-ui.patch with git apply --3way.
  hybrid   Try patch first; on failure fall back to overlay copy.

Examples:
  ./scripts/apply.sh ../pi-web
  ./scripts/apply.sh /path/to/pi-web hybrid
EOF
}

if [[ -z "${TARGET}" || "${TARGET}" == "-h" || "${TARGET}" == "--help" ]]; then
  usage
  exit 1
fi

if [[ ! -d "${TARGET}" ]]; then
  echo "error: target directory not found: ${TARGET}" >&2
  exit 1
fi

TARGET="$(cd "${TARGET}" && pwd)"
OVERLAY="${ROOT}/overlay"
PATCH="${ROOT}/patches/zh-cn-ui.patch"
BASE_JSON="${ROOT}/BASE.json"

if [[ -f "${BASE_JSON}" ]]; then
  echo "Localization base: $(python3 - <<PY
import json
print(json.load(open("${BASE_JSON}"))["upstream_commit"][:12])
PY
) (see BASE.json)"
fi

copy_overlay() {
  echo "Copying overlay files into ${TARGET} ..."
  # Preserve relative paths under overlay/
  (
    cd "${OVERLAY}"
    find . -type f | while read -r rel; do
      rel="${rel#./}"
      mkdir -p "${TARGET}/$(dirname "${rel}")"
      cp -a "${OVERLAY}/${rel}" "${TARGET}/${rel}"
      echo "  + ${rel}"
    done
  )
  echo "Overlay copy done."
}

apply_patch() {
  if [[ ! -f "${PATCH}" ]]; then
    echo "error: patch not found: ${PATCH}" >&2
    return 1
  fi
  echo "Applying patch ${PATCH} ..."
  if git -C "${TARGET}" apply --check --3way "${PATCH}" 2>/tmp/pi-web-zh-apply-check.err; then
    git -C "${TARGET}" apply --3way "${PATCH}"
    echo "Patch applied cleanly."
    return 0
  fi

  # Non-git trees or apply --check failure: try plain patch
  if command -v patch >/dev/null 2>&1; then
    if patch -d "${TARGET}" -p1 --dry-run < "${PATCH}" >/tmp/pi-web-zh-patch-dry.out 2>&1; then
      patch -d "${TARGET}" -p1 < "${PATCH}"
      echo "Patch applied with patch(1)."
      return 0
    fi
  fi

  echo "Patch did not apply cleanly." >&2
  if [[ -f /tmp/pi-web-zh-apply-check.err ]]; then
    sed -n '1,40p' /tmp/pi-web-zh-apply-check.err >&2 || true
  fi
  return 1
}

case "${MODE}" in
  overlay)
    copy_overlay
    ;;
  patch)
    apply_patch
    ;;
  hybrid)
    if apply_patch; then
      :
    else
      echo "Falling back to overlay copy (may overwrite upstream edits in those files)."
      copy_overlay
    fi
    ;;
  *)
    echo "error: unknown mode: ${MODE}" >&2
    usage
    exit 1
    ;;
esac

cat <<EOF

Next steps:
  cd "${TARGET}"
  npm install
  npm run build
  npm install -g .
  # restart pi-web

Tip: after upstream upgrades, re-run this script. If many conflicts appear,
update the overlay on a fresh checkout of upstream and export a new snapshot
with ./scripts/export-from-tree.sh
EOF
