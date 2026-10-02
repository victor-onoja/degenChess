# Running the referee on a server

The referee watches the game contract and runs the Chainlink CRE workflow whenever a game needs a
verdict (see [cre/README.md](../../cre/README.md)). Without a CRE API key it delivers the workflow's
own verdict directly, so games settle either way. This folder runs it as one Docker container that
restarts on failure and catches up after downtime.

## Set up

```bash
mkdir -p ~/degenchess-referee && cd ~/degenchess-referee
# copy Dockerfile, compose.yml and update.sh from this folder, then:
cat > .env <<'ENV'
CRE_API_KEY=...            # app.chain.link -> Account Settings -> API keys (optional: without it, verdicts go direct)
CRE_ETH_PRIVATE_KEY=0x...  # a wallet with testnet MON; it pays gas for each verdict
# REFEREE_MODE=auto        # auto (workflow, then direct) | cre | direct
ENV
chmod 600 .env
./update.sh
```

## Operate

| What | Command (in `~/degenchess-referee`) |
| --- | --- |
| Watch it work | `docker compose logs -f` |
| Is it up? | `docker compose ps` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |
| Pick up new code or addresses | `./update.sh` |

It remembers the last block it handled in a Docker volume, so moves made while it was down are
judged when it comes back. After a contract redeploy, run `./update.sh`: the state resets for the new contract.

Keep the `CRE_ETH_PRIVATE_KEY` wallet funded. Use a wallet that holds nothing else: it does not need
to be the contract owner, but the owner must allow it as a reporter:
`ChessReferee.setReporter(<its address>, true)` (`scripts/deploy-referee.js` does this through
`REFEREE_REPORTERS`). The live server's key, `0xC25D50Ed673B3fC347ae00d1288213F8F3C7eA5C`, is allowed.

Once the workflow is deployed to a Chainlink DON this container is no longer needed.
