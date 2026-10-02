# The DegenChess referee as a container: watches the game contract and runs the Chainlink CRE
# workflow whenever a game needs a verdict. See deploy/referee/README.md.
# Debian 13: the CRE CLI needs glibc 2.38 or newer.
FROM node:24-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates git gnupg \
    && rm -rf /var/lib/apt/lists/*

# Bun (builds the TypeScript workflow) and the Chainlink CRE CLI.
RUN curl -fsSL https://bun.sh/install | bash && curl -sSL https://app.chain.link/cre/install.sh | bash
ENV PATH=/root/.bun/bin:/root/.cre/bin:$PATH

ARG REPO=https://github.com/victor-onoja/degenChess.git
ARG REF=master
# Changing this value (update.sh passes the current time) forces a fresh clone.
ARG CACHE_BUST=0
WORKDIR /app
RUN git clone --depth 1 --branch "$REF" "$REPO" . \
    && rm package.json package-lock.json && npm init -y >/dev/null && npm install --no-audit --no-fund viem@2.57.0 \
    && cd cre/referee && bun install && bun x cre-setup

ENV STATE_FILE=/state/referee-state.json
# The CRE CLI reads the signing key from cre/.env.
CMD ["sh", "-c", "printf 'CRE_ETH_PRIVATE_KEY=%s\\n' \"$CRE_ETH_PRIVATE_KEY\" > cre/.env && exec node tools/referee-watch.mjs"]
