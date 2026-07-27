#!/usr/bin/env bash
# Fails if a literal colour or font-size escaped tokens.css.
#
# Colours, spacing and type come from packages/web/src/styles/tokens.css only —
# an agent building the album grid at 11pm has no memory of --color-panel unless
# something forces it to look. This is that something.
#
#   check-tokens.sh [dir]      scan dir (default packages/web/src)
#   check-tokens.sh --self-test  prove the guard can still fail
#
# The self-test exists because a broken guard exits 0 forever and CI stays green
# while drift accumulates. CI runs it before the real scan.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKENS="styles/tokens.css"

scan() {
  local src="$1"
  local fail=0

  report() {
    local label="$1" pattern="$2"
    local hits
    hits=$(grep -rInE "$pattern" "$src" \
      --include='*.ts' --include='*.tsx' --include='*.css' \
      | grep -v "/$TOKENS:" || true)
    if [ -n "$hits" ]; then
      echo "✗ $label — use a token from $TOKENS instead:"
      echo "$hits" | sed 's/^/    /'
      fail=1
    fi
  }

  report "hardcoded hex colour" '#[0-9a-fA-F]{3,8}\b'
  report "hardcoded rgb()/hsl() colour" '\b(rgba?|hsla?)\('
  report "hardcoded font-size" 'font-size:[[:space:]]*[0-9]'

  if [ "$fail" -eq 0 ]; then
    echo "✓ no literal colours or font-sizes outside $TOKENS"
  fi
  return "$fail"
}

self_test() {
  local tmp status out
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  # 1. A file with a literal colour must fail, and must name the offender.
  printf 'const c = "#ff0000";\n' > "$tmp/dirty.ts"
  set +e
  out="$(scan "$tmp" 2>&1)"
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    echo "✗ self-test: the guard passed a file containing #ff0000 — it is not guarding." >&2
    return 1
  fi
  if ! printf '%s' "$out" | grep -q 'dirty.ts'; then
    echo "✗ self-test: the guard failed but did not report the offending file." >&2
    printf '%s\n' "$out" >&2
    return 1
  fi

  # 2. A file using tokens must pass, or the guard is unusable.
  rm "$tmp/dirty.ts"
  printf 'const c = "var(--color-magenta)";\n' > "$tmp/clean.ts"
  set +e
  scan "$tmp" >/dev/null 2>&1
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    echo "✗ self-test: the guard rejected a file that only uses tokens." >&2
    return 1
  fi

  echo "✓ self-test: the guard rejects #ff0000 and accepts var(--color-*)"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
else
  scan "${1:-$ROOT/packages/web/src}"
fi
