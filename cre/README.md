# DegenChess referee (Chainlink CRE workflow)

DegenChess records every chess move on-chain but does not check that moves are legal chess: doing that
in Solidity on every move is expensive. This workflow is the referee instead.

```text
MoveMade event ──▶ CRE workflow ──▶ signed verdict ──▶ Chainlink forwarder ──▶ ChessReferee.onReport
 (DegenChess)      read the game        (only when the                          └▶ DegenChess.arbitrate
                   replay with chess.js   game is over)
```

| Step | What happens | Where |
| --- | --- | --- |
| Trigger | EVM log trigger on `MoveMade` | `referee/main.ts` |
| Read | `getGame` and `getMoves` for that game | `referee/main.ts` |
| Decide | Replay the moves with chess.js | `referee/judge.ts` |
| Write | DON-signed report → forwarder → `ChessReferee` → `arbitrate` | `contracts/ChessReferee.sol` |

Verdicts:

- **Illegal move**: the player who made it loses and forfeits everything, including any stake the illegal move "captured".
- **Checkmate**: the winner is paid without waiting for the loser to resign. The loser keeps their capture gains.
- **Stalemate, insufficient material, threefold repetition, fifty-move rule**: settled as a draw.

`ChessReferee` only accepts reports from the Chainlink forwarder, and can additionally require a
specific workflow owner. `DegenChess.arbitrate` only works on an active game, so a verdict cannot be
applied twice.

## Deployed on Monad testnet

| Contract | Address |
| --- | --- |
| DegenChess | `0x7ae0bbe6747b4571990088d2522bf7da62297c48` |
| ChessReferee | `0xa44cb8a45c17094782c8b04ca252639525b61a20` |
| Forwarder (simulation `MockKeystoneForwarder`) | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |

## Run it

```bash
# once
curl -sSL https://app.chain.link/cre/install.sh | bash     # CRE CLI
curl -fsSL https://bun.sh/install | bash                   # Bun, used to build TypeScript workflows
cre login
cd cre/referee && bun install && cd ../..
echo "CRE_ETH_PRIVATE_KEY=<key with testnet MON>" > cre/.env

# unit tests for the judging logic
cd cre/referee && node --test judge.test.ts && cd ../..

# make a game that needs a verdict, then run the workflow on its last move
node tools/play-test-game.mjs mate          # or: cheat, stalemate
cd cre && cre workflow simulate referee --non-interactive --trigger-index 0 \
  --evm-tx-hash <hash printed above> --evm-event-index 0 --broadcast --target staging-settings

# or keep a referee running for live games
npm run referee
```

`--broadcast` sends the verdict as a real transaction on Monad testnet. Without it the workflow runs
as a dry run.

## Going to production

1. Request CRE deployment access and `cre workflow deploy referee --target production-settings`.
2. Point the referee at the production forwarder:
   `ChessReferee.setForwarder(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)` (Monad testnet `KeystoneForwarder`).
3. Lock it to our workflow: `ChessReferee.setExpectedWorkflowOwner(<workflow owner address>)`.

After that Chainlink's network triggers the workflow on every `MoveMade` and `tools/referee-watch.mjs`
is no longer needed.
