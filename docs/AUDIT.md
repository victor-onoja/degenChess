# Away Chess: security review brief

Thanks for looking at this. This page tells you what to review, what the contract is meant to guarantee, and what we already know is weak, so you can spend your time on what we don't know.

## Scope

| In scope | Where | Notes |
| --- | --- | --- |
| Game contract | `contracts/DegenChess.sol` (Solidity 0.8.24, OpenZeppelin 5) | The only contract that holds funds |
| Referee | `contracts/ChessReferee.sol`, `cre/referee/` | Receives verdicts from a Chainlink CRE workflow and calls `arbitrate` |
| Usernames | `contracts/PlayerNames.sol` | Holds no funds |
| Tournaments | `contracts/Tournaments.sol` | **Holds funds when a tournament has an entry fee.** Entry fees form a pot; `record` reads finished games from `DegenChess` (stake, both players joined, created after the start, first game per pair); `settle` pays the pot by points (winner takes all, or 50/30/20, ties sharing places) once every pairing is recorded or the deadline passes. No fee, no owner, no admin. `leave` and `cancel` refund before the start |
| Key handling in the browser | `src/lib/mera.ts`, `src/lib/account.tsx` | Passkey-derived keys, signing sessions |
| Faucet | `src/pages/api/drip.ts` | Testnet only |
| Audience count | `src/pages/api/watch.ts` | In-memory head-count of spectators; anyone can inflate it, nothing depends on it |

Out of scope: `contracts/test/MockUSD.sol` (a test token anyone can mint), the 3D rendering code.

Deployed on Monad testnet (chain 10143): Away Chess `0xb035514b25f72bc329529551b5177079ea54c4d9`, ChessReferee `0xd34e5e6b1c8d0825a1468713d5764d6070fe5d0d`, stake token (MockUSD, 6 decimals) `0xfbf011ba1f7d08651181b5eebabb7048596de9de`.

Browser tests: `tools/e2e/passkey-game.mjs` (sign-up, staking, prompt-free moves, the stateless restore, resign, withdraw, rematch) and `tools/e2e/core-flows.mjs` (cancel, tap-to-move, promotion, spectating, draw, win on time).

Run the tests with `npm install && npm test` (37 contract tests, including random legal games cross-checked against chess.js) and `cd cre/referee && bun install && node --test judge.test.ts` (the referee's judging logic).

## What the contract does

Two players each escrow the same ERC-20 stake. Every move is a transaction. The contract keeps the board in one `uint256` (4 bits per square) so it can see captures, and each capture moves that piece's value from the victim's balance to the capturer's. Piece weights are pawn 1, knight 3, bishop 3, rook 5, queen 9; a side's 15 non-king pieces sum to 39, so they are worth exactly one stake.

When the game ends, the winner takes the loser's balance except what the loser gained through captures. A draw leaves the capture-adjusted balances as they are and charges no fee. When a game is won, a 2.5% fee on the pot accrues to the owner, less referral shares: each player can record a referrer once (`setReferrer`), who is credited 20% of that player's half of the fee (`referralEarnings`, pulled with `withdrawReferralEarnings`). Players withdraw their own payout.

A game ends by `resign`, `acceptDraw`, `claimTimeout` (the player not on move, after `moveTimeout`), or `arbitrate` (the owner, or the registered `arbiter`).

**The referee.** The `arbiter` is `ChessReferee`, the consumer contract of a Chainlink CRE workflow (`cre/README.md`). The workflow fires on every `MoveMade`, replays the game with chess.js and, if the game is over or a move was illegal, sends a signed verdict through the Chainlink forwarder. Checkmate and rule draws settle normally; an illegal move is settled with `forfeit = true`, so the cheater keeps nothing.

**Game keys.** Each player can register a second address per game. It may call `makeMove`, `offerDraw`, `acceptDraw` and `claimTimeout` for them. It may never call `resign`, `cancelGame`, `withdraw` or `setGameKey`. MON sent with `createGame`, `joinGame` or `setGameKey` is forwarded to the key for gas.

## Properties we want to hold

1. **Solvency.** The contract's token balance always covers every unfinished game's two balances plus every finished game's unwithdrawn payouts. Nothing can be withdrawn twice.
2. **Conservation.** Within a game, `whiteBalance + blackBalance` equals twice the stake until settlement, and equals the pot minus the fee after it.
3. **No stuck funds.** Every game that starts can reach `Finished` or `Cancelled`, and every payout can be withdrawn. (The previous contract failed this: its `endGame` underflowed.)
4. **Authority.** Only the player on move, or their game key, can move. A game key can never cause a token transfer or change who is paid. Nobody outside the game can affect it, except the owner through `arbitrate`.
5. **Board tracking** matches real chess for every *legal* move, including en passant, castling and promotion.

## Known weaknesses

These are deliberate trade-offs or open problems. We'd value your view on how bad each is and what the cheapest sound fix would be.

1. **Moves are not checked for legality on-chain; the referee is what punishes them.** The contract checks turn order, that you move your own piece, that you don't capture your own piece or a king, and promotion rules. A modified client can still submit an illegal capture and be credited its value. The referee then forfeits that player. So the guarantee is only as strong as the referee:
   - **Liveness.** If the referee is not running, nothing settles automatically. The honest client stops accepting moves after an illegal one, which puts the honest player on the clock; after `moveTimeout` the cheater could call `claimTimeout`. The owner can still `arbitrate` by hand. Today the referee is `tools/referee-watch.mjs` in a Docker container on a server: it runs the workflow with `cre workflow simulate --broadcast` and, when the CRE CLI cannot run, delivers the workflow's own verdict (`judge.ts`) through the same forwarder. It is not yet on a Chainlink DON.
   - **Authenticity (found and fixed on 3 October 2026).** `ChessReferee` points at Chainlink's `MockKeystoneForwarder` (simulation), which verifies no signatures and lets anyone call it. Until then `onReport` only checked `msg.sender == forwarder`, so anyone could relay a report and settle any active game for either side. We confirmed it with a simulated call from an unrelated address that reached `arbitrate`. The fix: while `expectedWorkflowOwner` is unset, `onReport` also requires `tx.origin` to be an allowed reporter (`setReporter`, owner only). The fixed referee is deployed and set as arbiter; the old one can no longer arbitrate. `tx.origin` is deliberate, because the mock forwarder is `msg.sender` and passes nothing else about the caller. The residual risk: a leaked reporter key can settle any active game, the same power as the owner. Moving to the production `KeystoneForwarder` with `setExpectedWorkflowOwner` removes the reporter path.
   - **Correctness.** The verdict logic is `cre/referee/judge.ts`. A bug there (a legal move judged illegal) forfeits an honest player.
2. **The owner is trusted.** `arbitrate` can settle any active game for either side, with or without forfeit, and `setArbiter` can install any arbiter. There is no timelock, multisig or appeal. The owner address is immutable.
3. **Draw claims.** Rule draws are settled by the referee. Without it, a draw needs the opponent's agreement.
4. **Fees** accrue in `accruedFees` and are pulled with `withdrawFees`, so a failing transfer to the owner cannot block settlement. Check that `accruedFees` can never exceed what the contract holds beyond players' balances.
5. **Referral farming.** A player can refer themselves through a second account and so get back 10% of the fee on their own games. It is a discount, not a drain: referral shares come out of the fee, never out of a player's payout. Check that `accruedFees + referralEarnings` can never exceed what the contract holds beyond players' balances.
6. **Random sides.** With side 2 the seats are decided at join by `keccak256(prevrandao, gameId, joiner)`. A joiner who can predict `prevrandao` could join only when the coin falls their way. It decides colour, not money; fine for testnet, worth a commit-reveal or VRF before real stakes.
7. **Token assumptions.** The stake token is assumed to be a plain ERC-20. Fee-on-transfer and rebasing tokens would break the accounting.
8. **Promotion and the value cap.** A promoted piece can be worth more than the pawn it was, so one side's pieces can exceed one stake. `_transferCaptureValue` caps each transfer at the victim's balance.
9. **Faucet abuse.** `/api/drip` rate-limits per address in memory only, so anyone can drain it with fresh addresses. It holds testnet funds only.
10. **Keys live in page memory.** Both keys are derived from the passkey in the browser. Any script running on the page could sign with the live game key, which is why that key is scoped by the contract and the money key is wiped after each money action. An XSS or a malicious dependency could still play moves for a user, or capture the money key during a money action.

## Places we'd like a second pair of eyes

- `Tournaments`: can a pot be drained, double-paid or stuck? `_payOut` (sorting, tie groups, rounding dust to first place), `leave` (swap-and-pop of the players array against `pot`), `cancel` (refund loop), and `_record` (two colluding players can only affect their own pairing's result, by playing it; can a game be counted for two tournaments' pairings in a harmful way, or a pairing recorded with a game from before the start?). After the deadline the pot pays on the results recorded so far, so players who never play can still be ranked level on zero points.
- `DegenChess._record` / `getPlayers`: the leaderboard counters are informational; check they cannot revert `_finish` (overflow of the `uint32` counters is out of reach).

- `makeMove`: the board update, especially the en passant square, the castling detection (a king moving two files from the e-file) and the promotion checks. Can a crafted `uint16` corrupt the board, capture a piece that isn't there, or make `_transferCaptureValue` move value twice?
- `_setKey`: the raw `call` that forwards MON to an arbitrary address. Every function that reaches it is `nonReentrant`, but `makeMove` and `offerDraw` are not. Is there a useful re-entry through them?
- `_playerFor`: can a player register a key that lets them act as their opponent? `_setKey` clears a key equal to either player's address, but what about a key equal to the opponent's game key, or a key set before the opponent joins?
- `_finish`: rounding, and the new `_forfeit` path. The fee is recomputed as `total - whitePayout - blackPayout` so dust goes to the fee. Can either payout exceed what the contract holds for that game?
- The chess clock in `makeMove` and `claimTimeout`: time is charged from `block.timestamp - lastMoveAt` into `uint32` fields, with an increment added after each move. Can a player gain time, move after their flag fell, or be flagged early? `createGame` caps the clock at 3 hours and the increment at 5 minutes so the `uint32` arithmetic can't overflow (an uncapped increment could make every move revert and lock both stakes); is that bound sufficient over a long game?
- `claimTimeout`: `lastMoveAt` is set when the second player joins. Any way to claim early, or to reset the clock without moving?
- `withdraw`, `cancelGame` and `withdrawFees`: double-withdraw or withdraw-after-cancel paths.
- `ChessReferee.onReport`: the metadata slice used for `expectedWorkflowOwner` (`metadata[42:62]`), whether a report for one game can be replayed against another, and whether the `tx.origin` reporter check can be satisfied by anyone other than a reporter (for example a reporter's transaction calling into a contract that then calls the forwarder).

## Monad specifics that shaped the code

- A transaction that sends MON from an account holding under 10 MON reverts if that account sent anything else in the previous 3 blocks. The client and the faucet space such transactions out.
- Gas affordability is checked against the balance from 3 blocks earlier, so freshly funded keys wait before their first transaction.
- Gas is billed on the gas limit, not gas used.

## How to report

Open a GitHub issue on the repo, or message Victor directly for anything exploitable. Severity, a short reproduction (a Hardhat test is ideal) and a suggested fix are all we need.
