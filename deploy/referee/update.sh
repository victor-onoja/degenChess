#!/usr/bin/env bash
# Rebuild from the latest master and restart. Run on the server after a contract redeploy or a workflow change.
set -euo pipefail
cd "$(dirname "$0")"
docker compose build --build-arg CACHE_BUST="$(date +%s)"
docker compose up -d
docker compose logs --tail 5
