#!/usr/bin/env bash
# Generates an image with the Cloudflare image skill, using the CLOUDFLARE_* credentials in .env.local.
#   tools/gen-image.sh "<prompt>" <output.jpg> [steps]
set -euo pipefail
cd "$(dirname "$0")/.."
value() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"; }
CF_ACCOUNT_ID="$(value CLOUDFLARE_ACCOUNT_ID)" CF_API_TOKEN="$(value CLOUDFLARE_API_TOKEN)" \
  python3 .claude/skills/level-3-image-generator/generate.py "$1" -o "$2" --steps "${3:-8}"
