# Away Chess referee (Chainlink CRE workflow)

Away Chess records every chess move on-chain but does not check that moves are legal chess: doing that
in Solidity on every move is expensive. This workflow is the referee instead.

```text
MoveMade event ──▶ CRE workflow ──▶ signed verdict ──▶ Chainlink forwarder ──▶ ChessReferee.onReport
 (Away Chess)      read the game        (only when the                          └▶ DegenChess.arbitrate
                   replay with chess.js   game is over)
```

| Step | What happens | Where |
| --- | --- | --- |
| Trigger | EVM log trigger on `MoveMade` | `referee/main.ts` |
| Read | `getGame` and `getMoves` for that game | `referee/main.ts` |
| Decide | Replay the moves with chess.js | `referee/judge.ts` |
| Write | DON-signed report → forwarder → `ChessReferee` → `arbitrate` | `contracts/ChessReferee.sol` |
| Tell | HTTP call to the app's `/api/announce`, which posts the result to the team's Discord. A failed call is logged and never undoes a verdict | `referee/main.ts` (`announceUrl` in the config) |

Verdicts:

- **Illegal move**: the player who made it loses and forfeits everything, including any stake the illegal move "captured".
- **Checkmate**: the winner is paid without waiting for the loser to resign. The loser keeps their capture gains.
- **Stalemate, insufficient material, threefold repetition, fifty-move rule**: settled as a draw.

`ChessReferee` only accepts reports from the Chainlink forwarder, and can additionally require a
specific workflow owner. While no workflow owner is set (simulation, where the mock forwarder checks
nothing), it also requires the transaction to come from an allowed reporter key (`setReporter`).
`DegenChess.arbitrate` only works on an active game, so a verdict cannot be applied twice.

## Deployed on Monad testnet

| Contract | Address |
| --- | --- |
| Away Chess | `0x2e44f61ea3616a1b1ff5393ddccdb2fac58b2f00` |
| ChessReferee | `0xba90386c49ebdbe1f4ae572e5081421a909f8617` |
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

## The second workflow: chess.com ratings (`cre/rating`)

A player can link their chess.com account so opponents see a real rating next to their name. The chain
cannot read chess.com, and chess.com knows nothing about Monad addresses; this workflow connects them.

```text
LinkRequested event ──▶ CRE workflow ──▶ chess.com public API ──▶ signed report ──▶ forwarder ──▶ ChessRatings.onReport
 (ChessRatings)         player, username   profile + ratings        ratings, or why not
```

| Step | What happens | Where |
| --- | --- | --- |
| Trigger | EVM log trigger on `LinkRequested(player, handle)` | `rating/main.ts` |
| Fetch | HTTP capability: `GET api.chess.com/pub/player/{handle}` and `/stats`; the nodes' answers must agree | `rating/main.ts` |
| Decide | The account is the player's if its Location (or Name) shows the code derived from their address (`away-` + the last six characters) | `src/lib/rating.ts` (`assess`) |
| Write | Signed report → forwarder → `ChessRatings`: rapid, blitz and bullet ratings, or the reason for refusal | `contracts/ChessRatings.sol` |

`ChessRatings` (Monad testnet): `0xd06d7d6c4de3aedd13c781e1fb3580464c863c60`. It holds no money and the game
contract does not consult it: a rating is information for choosing an opponent.

```bash
cd cre/rating && bun install && node --test assess.test.ts && cd ../..

# ask to link a chess.com username for the deployer's address (prints the code and the transaction)
node tools/request-rating.mjs hikaru
cd cre && cre workflow simulate rating --non-interactive --trigger-index 0 \
  --evm-tx-hash <hash printed above> --evm-event-index 0 --broadcast --target staging-settings
```

A run on 11 October 2026: request `0x8cee2566249b5d660177a9b69c8879f183065d7b8db33f7392f73c9e0d2df58b`; the workflow read
chess.com/hikaru (location "Florida", rapid 2838, blitz 3482, bullet 3403), found no code, and delivered a
refusal in `0x39fe7e8a2b558dcff3e6d9332a6cdf8aed725bfc1b9c734ed4d3ed0c911eb2df`. To see a link succeed, put the printed
code in your own chess.com profile's Location and run the two commands with your username.

In the app, a request is answered by `/api/rating`, which runs the same `assess` function and sends the
same report through the same forwarder. Like the referee's direct mode, it stands in until the workflow
runs on Chainlink's network.

## Keeping it running on a server

Until the workflow is deployed to a DON, something has to run `npm run referee`. It runs as a Docker
service: see [deploy/referee](../deploy/referee/README.md). The watcher remembers the last block it
handled, so moves made while it was down are judged when it comes back.

The key in `CRE_ETH_PRIVATE_KEY` pays the gas for each verdict, so keep it funded, and it must be an
allowed reporter on `ChessReferee` (`setReporter`), or its verdicts are rejected.

**Fallback.** A server needs `CRE_API_KEY` to run the CRE CLI (it has no browser for `cre login`).
Without one, or if the CLI fails, the watcher delivers the verdict itself: the same `judge.ts`
decision, encoded the way the workflow encodes it, sent through the same mock forwarder to the same
`ChessReferee`. `REFEREE_MODE=direct` skips the workflow, `REFEREE_MODE=cre` disables the fallback,
and the default (`auto`) tries the workflow first. On 3 October 2026 the server settled a live
checkmate this way while the CRE API key was pending.

## Going to production

Deploying to Chainlink's network is a commercial service (quoted at roughly $7,200 a year in October 2026). The hackathon entry runs in simulation, as its rules allow; this is the plan to revisit before mainnet.

1. Request CRE deployment access and `cre workflow deploy referee --target production-settings`.
2. Point the referee at the production forwarder:
   `ChessReferee.setForwarder(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)` (Monad testnet `KeystoneForwarder`).
3. Lock it to our workflow: `ChessReferee.setExpectedWorkflowOwner(<workflow owner address>)`.

After that Chainlink's network triggers the workflow on every `MoveMade` and `tools/referee-watch.mjs`
is no longer needed.
