#!/bin/sh
# Rebuild from the latest master and restart. Run from this folder on the server.
set -e
docker compose build --build-arg CACHE_BUST="$(date +%s)"
docker compose up -d
docker compose logs --tail 20 risk
