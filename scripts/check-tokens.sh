#!/usr/bin/env bash
# Fails if a literal colour or font-size escaped tokens.css.
#
# D-01 ships this runnable; D-06 wires it into ci.yml. Colours, spacing and
# type come from packages/web/src/styles/tokens.css only — an agent building
# the album grid at 11pm has no memory of --color-panel unless this forces it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/packages/web/src"
TOKENS="styles/tokens.css"

fail=0

report() {
  local label="$1" pattern="$2"
  local hits
  hits=$(grep -rInE "$pattern" "$SRC" \
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
exit "$fail"
