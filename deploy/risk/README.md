# Risk service on a server

Runs `tools/risk/risk-watch.mjs` in a container next to the referee. Each pass (every five minutes) it
reads newly finished games, checks moves against Stockfish, looks for collusion between pairs of accounts,
posts flags to Discord, freezes accounts on strong flags, and promotes clean players to higher trust tiers.

## Set up

1. Make a fresh key for the service. Fund it with a little MON (each freeze or promotion is one transaction).
2. From the owner key, make it the risk operator: `setRiskOperator(<service address>)` on the game
   contract (or pass `RISK_OPERATOR=<address>` to `scripts/deploy.js` at deploy time). That key can set
   tiers, freeze (at most 14 days, then a 7-day cooldown) and penalize. It cannot touch fees, the
   arbiter or ownership.
3. On the server, copy this folder, then create `.env`:

   ```
   RISK_PRIVATE_KEY=0x...
   DISCORD_RISK_WEBHOOK=https://discord.com/api/webhooks/...
   # optional
   # CHESS_ADDRESS=0x...        (defaults to src/deployments.ts)
   # RISK_AUTO_FREEZE=0         (alert only, never freeze)
   # RISK_FREEZE_HOURS=72
   # ENGINE_DEPTH=14
   ```

4. `./update.sh`

## Reviewing a flag

A Discord flag gives the accounts, the evidence and a link to the game. Open the game and its replay. Then:

- Fair: `docker compose exec risk node tools/risk/risk-watch.mjs unfreeze <address>`
- Cheating: `docker compose exec risk node tools/risk/risk-watch.mjs penalize <gameId> <cheater>`. That
  gives the cheater's unwithdrawn winnings from that game to the opponent and corrects both records.
- Look up an account: `docker compose exec risk node tools/risk/risk-watch.mjs status <address>`

Before a penalty the accounts stay frozen; if nobody acts, the freeze ends by itself when it runs out.
