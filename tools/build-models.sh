#!/usr/bin/env bash
# Rebuilds public/models/*.glb from the raw Mixamo exports in art/. Pass a directory to also write preview PNGs.
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
PREVIEWS="${1:-}"
for army in bulls bears; do
  for piece in king queen rook bishop knight pawn; do
    "$BLENDER" -b -P tools/blender/build_piece.py -- "art/$army/$piece" "public/models/$army-$piece.glb" \
      ${PREVIEWS:+"$PREVIEWS/$army-$piece.png"} 2>&1 | grep -E "^(OK|WARN)|Error" || echo "FAILED $army/$piece"
  done
done
