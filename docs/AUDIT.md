# DegenChess: security review brief

Thanks for looking at this. This page tells you what to review, what the contract is meant to guarantee, and what we already know is weak, so you can spend your time on what we don't know.

## Scope

| In scope | Where | Notes |
| --- | --- | --- |
| Game contract | `contracts/DegenChess.sol` (446 lines, Solidity 0.8.24, OpenZeppelin 5) | The only contract that holds funds |
| Key handling in the browser | `src/lib/mera.ts`, `src/lib/account.tsx` | Passkey-derived keys, signing sessions |
| Faucet | `src/pages/api/drip.ts` | Testnet only |

Out of scope: `contracts/test/MockUSD.sol` (a test token anyone can mint), the 3D rendering code.

Deployed on Monad testnet (chain 10143): `0x60f552d97862ad8b1697443e48cf0e75182168cb`. Stake token (MockUSD, 6 decimals): `0xfbf011ba1f7d08651181b5eebabb7048596de9de`. The contract in the repo has not changed since this deployment.

Run the tests with `npm install && npm test` (17 tests, including random legal games cross-checked against chess.js).

## What the contract does

Two players each escrow the same ERC-20 stake. Every move is a transaction. The contract keeps the board in one `uint256` (4 bits per square) so it can see captures, and each capture moves that piece's value from the victim's balance to the capturer's. Piece weights are pawn 1, knight 3, bishop 3, rook 5, queen 9; a side's 15 non-king pieces sum to 39, so they are worth exactly one stake.

When the game ends, the winner takes the loser's balance except what the loser gained through captures. A draw leaves the capture-adjusted balances as they are. A 2.5% fee on the pot goes to the owner. Players withdraw their own payout.

A game ends by `resign`, `acceptDraw`, `claimTimeout` (the player not on move, after `moveTimeout`), or `arbitrate` (owner only).

**Game keys.** Each player can register a second address per game. It may call `makeMove`, `offerDraw`, `acceptDraw` and `claimTimeout` for them. It may never call `resign`, `cancelGame`, `withdraw` or `setGameKey`. MON sent with `createGame`, `joinGame` or `setGameKey` is forwarded to the key for gas.

## Properties we want to hold

1. **Solvency.** The contract's token balance always covers every unfinished game's two balances plus every finished game's unwithdrawn payouts. Nothing can be withdrawn twice.
2. **Conservation.** Within a game, `whiteBalance + blackBalance` equals twice the stake until settlement, and equals the pot minus the fee after it.
3. **No stuck funds.** Every game that starts can reach `Finished` or `Cancelled`, and every payout can be withdrawn. (The previous contract failed this: its `endGame` underflowed.)
4. **Authority.** Only the player on move, or their game key, can move. A game key can never cause a token transfer or change who is paid. Nobody outside the game can affect it, except the owner through `arbitrate`.
5. **Board tracking** matches real chess for every *legal* move, including en passant, castling and promotion.

## Known weaknesses

These are deliberate trade-offs or open problems. We'd value your view on how bad each is and what the cheapest sound fix would be.

1. **Moves are not checked for legality on-chain. This is the big one.** The contract checks turn order, that you move your own piece, that you don't capture your own piece or a king, and promotion rules. It does not check that the move is legal chess. A modified client can teleport a queen across the board to capture the opponent's queen and collect 9/39 of the stake immediately.
   - The honest client detects this (it replays every move with chess.js) and stops accepting moves. But then the honest player is the one on the clock, and after `moveTimeout` the cheater can call `claimTimeout` and win.
   - Today the only defence is the owner calling `arbitrate` inside the timeout window (24 hours on testnet).
   - Options we're considering: full on-chain move validation; an off-chain checker (Chainlink CRE workflow) that calls `arbitrate` automatically; a dispute flag that freezes the clock.
2. **The owner is trusted.** `arbitrate` can settle any active game for either side. There is no timelock, multisig or appeal. The owner address is immutable.
3. **Draws need agreement.** Stalemate, repetition and the fifty-move rule are not detected. If the opponent won't accept a draw, the player on move in a stalemate loses on timeout.
4. **Fee transfer inside settlement.** `_finish` sends the fee to `owner` with `safeTransfer`. If that transfer reverts (for example a token that blocklists the owner), no game can settle.
5. **Token assumptions.** The stake token is assumed to be a plain ERC-20. Fee-on-transfer and rebasing tokens would break the accounting.
6. **Promotion and the value cap.** A promoted piece can be worth more than the pawn it was, so one side's pieces can exceed one stake. `_transferCaptureValue` caps each transfer at the victim's balance.
7. **Faucet abuse.** `/api/drip` rate-limits per address in memory only, so anyone can drain it with fresh addresses. It holds testnet funds only.
8. **Keys live in page memory.** Both keys are derived from the passkey in the browser. Any script running on the page could sign with the live game key, which is why that key is scoped by the contract and the money key is wiped after each money action. An XSS or a malicious dependency could still play moves for a user, or capture the money key during a money action.

## Places we'd like a second pair of eyes

- `makeMove` (line 167): the board update, especially the en passant square, the castling detection (a king moving two files from the e-file) and the promotion checks. Can a crafted `uint16` corrupt the board, capture a piece that isn't there, or make `_transferCaptureValue` move value twice?
- `_setKey` (line 360): the raw `call` that forwards MON to an arbitrary address. Every function that reaches it is `nonReentrant`, but `makeMove` and `offerDraw` are not. Is there a useful re-entry through them?
- `_playerFor` (line 352): can a player register a key that lets them act as their opponent? `_setKey` clears a key equal to either player's address, but what about a key equal to the opponent's game key, or a key set before the opponent joins?
- `_finish` (line 388): rounding. The fee is recomputed as `total - whitePayout - blackPayout` so dust goes to the owner. Can either payout exceed what the contract holds for that game?
- `claimTimeout` (line 243): `lastMoveAt` is set when the second player joins. Any way to claim early, or to reset the clock without moving?
- `withdraw` (line 278) and `cancelGame` (line 129): double-withdraw or withdraw-after-cancel paths.

## Monad specifics that shaped the code

- A transaction that sends MON from an account holding under 10 MON reverts if that account sent anything else in the previous 3 blocks. The client and the faucet space such transactions out.
- Gas affordability is checked against the balance from 3 blocks earlier, so freshly funded keys wait before their first transaction.
- Gas is billed on the gas limit, not gas used.

## How to report

Open a GitHub issue on the repo, or message Victor directly for anything exploitable. Severity, a short reproduction (a Hardhat test is ideal) and a suggested fix are all we need.
