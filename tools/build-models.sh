#!/usr/bin/env bash
# Rebuilds public/models/<army>-<piece>.glb from the Mixamo exports in art/<army>/<piece>/.
# Every army folder is built; pieces without a rig.fbx yet are skipped.
#   npm run models                  all armies
#   npm run models -- bulls         one army
#   PREVIEWS=dir npm run models     also write a preview PNG per character
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
ARMIES="${*:-$(ls -d art/*/ | xargs -n1 basename)}"
for army in $ARMIES; do
  for piece in king queen rook bishop knight pawn; do
    dir="art/$army/$piece"
    ls "$dir" 2>/dev/null | grep -qi '^rig\.fbx$' || { echo "skip $army/$piece (no rig.fbx yet)"; continue; }
    "$BLENDER" -b -P tools/blender/build_piece.py -- "$dir" "public/models/$army-$piece.glb" \
      ${PREVIEWS:+"$PREVIEWS/$army-$piece.png"} 2>&1 | grep -E "^(OK|WARN)|Error" || echo "FAILED $army/$piece"
  done
done
echo "Check the result at /models (npm run build && npm start, then open http://localhost:3000/models)"
