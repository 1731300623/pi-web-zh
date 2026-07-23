#!/usr/bin/env bash
# Export current Chinese localization from a modified pi-web tree into this repo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/export-from-tree.sh <localized-pi-web-source-dir>

Copies localization files into overlay/, regenerates patches/zh-cn-ui.patch
against that tree's git HEAD, and updates BASE.json upstream_commit.
EOF
}

if [[ -z "${SRC}" || "${SRC}" == "-h" || "${SRC}" == "--help" ]]; then
  usage
  exit 1
fi

SRC="$(cd "${SRC}" && pwd)"
OVERLAY="${ROOT}/overlay"
PATCH_DIR="${ROOT}/patches"
mkdir -p "${OVERLAY}" "${PATCH_DIR}"

if [[ ! -f "${ROOT}/BASE.json" ]]; then
  echo "error: BASE.json missing" >&2
  exit 1
fi

mapfile -t FILES < <(python3 - <<PY
import json
print("\n".join(json.load(open("${ROOT}/BASE.json"))["files"]))
PY
)

echo "Exporting localization files from ${SRC}"
for f in "${FILES[@]}"; do
  if [[ ! -f "${SRC}/${f}" ]]; then
    echo "warn: missing ${f} in source tree" >&2
    continue
  fi
  mkdir -p "${OVERLAY}/$(dirname "${f}")"
  cp -a "${SRC}/${f}" "${OVERLAY}/${f}"
  echo "  = ${f}"
done

if ! git -C "${SRC}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "warn: source is not a git repo; skipped patch / BASE.json commit update" >&2
  echo "Export complete (overlay only)."
  exit 0
fi

COMMIT="$(git -C "${SRC}" rev-parse HEAD)"
echo "Source HEAD: ${COMMIT}"

# Stage listed files so new files (e.g. lib/i18n.ts) appear in the patch.
git -C "${SRC}" add -A -- "${FILES[@]}" 2>/dev/null || true
git -C "${SRC}" diff --cached -- "${FILES[@]}" > "${PATCH_DIR}/zh-cn-ui.patch"
git -C "${SRC}" reset HEAD -- "${FILES[@]}" >/dev/null 2>&1 || true

python3 - <<PY
import json
from pathlib import Path
path = Path("${ROOT}/BASE.json")
data = json.loads(path.read_text())
data["upstream_commit"] = "${COMMIT}"
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print(f"Updated BASE.json upstream_commit={data['upstream_commit']}")
PY

echo "Wrote ${PATCH_DIR}/zh-cn-ui.patch ($(wc -l < "${PATCH_DIR}/zh-cn-ui.patch") lines)"
echo "Export complete."
