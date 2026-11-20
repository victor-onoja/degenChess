# The Away Chess risk service (tools/risk/risk-watch.mjs) as a container: fair-play checks with
# Stockfish, collusion flags to Discord, bounded freezes and trust-tier promotions. See deploy/risk/README.md.
FROM node:24-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git stockfish \
    && rm -rf /var/lib/apt/lists/*
# Debian installs the engine under /usr/games.
ENV STOCKFISH_PATH=/usr/games/stockfish

ARG REPO=https://github.com/victor-onoja/degenChess.git
ARG REF=master
ARG CACHE_BUST=0
WORKDIR /app
RUN git clone --depth 1 --branch "$REF" "$REPO" . \
    && rm package.json package-lock.json && npm init -y >/dev/null && npm install --no-audit --no-fund viem@2.57.0

ENV STATE_FILE=/state/risk-state.json
CMD ["node", "--no-warnings", "tools/risk/risk-watch.mjs"]
