# Brief for a legal opinion: Away Chess

For a gaming or fintech lawyer. It describes how the product works and lists the questions we need answered before real money goes in. It is not legal advice. It exists so the consultation is short and specific.

## What the product is

- An online chess platform. Two players each put up the same stake in a US-dollar stablecoin (USDC) to play one game.
- Every piece carries a fixed share of the stake. When a piece is captured, its share moves to the capturing player's balance in that game. At the end the winner receives the opponent's remaining balance, except what the opponent won through captures. Draws return the balances as they stand.
- **The outcome is decided by the players' chess skill alone.** There are no dice, cards, random events or house opponents. The only random element is which side moves first, and only when a player chooses a coin flip.
- We charge a 2.5% fee on the pot of a won game. Draws are free. Up to 20% of the fee goes to whoever invited the players.
- Stakes are held by a smart contract on the Monad blockchain, not by us. We cannot spend players' stakes. Our admin powers are limited and published: we can pause an account for at most 14 days at a time for a fair-play review, and we can rule a game lost for cheating, which gives the cheater's winnings from that game to the opponent. We cannot move money anywhere else.
- Tournaments: players may pay an entry fee into a prize pot, paid out by points to the top finishers. We take no cut.
- Players sign up with a passkey (Face ID or fingerprint). Today we collect a username and nothing else: no name, no ID, no email.
- We operate the website, the game referee (an automated service that settles checkmates and illegal moves) and a fair-play service.

## Where we are and who we'd serve first

- Founder based in [country, state/region].
- First players likely from [countries: list the ones you expect, e.g. where the communities you will approach are].

## Questions

1. **Classification.** In [founder's country] and in each first market, is a stake on one's own chess game a game of skill outside gambling law, a regulated "skill gaming" activity, or gambling? Does charging a fee on won games change that?
2. **Licensing.** If any regulation applies, what licence or registration would we need, roughly what does it cost, and how long does it take? Is there a de minimis or low-stake exemption?
3. **Operator status.** The stakes sit in a smart contract we cannot spend from. Are we still the operator for legal purposes, given we run the site, take the fee and hold the review powers above? (We assume yes.)
4. **Money transmission and AML.** Does holding stakes in a contract and paying out to players make us a money transmitter or payment service anywhere? Players can also send money to each other by username. At what point do we need KYC: from the first dollar, above a threshold, or at withdrawal?
5. **Tournaments with prize pots.** Do entry-fee prize pots count as a lottery, a prize competition or skill gaming? Would free-entry tournaments with sponsored prizes avoid that?
6. **Referral share.** Is paying part of the fee to whoever invited a player permitted, and are there disclosure duties?
7. **Restricted places.** Which jurisdictions must we block? Is blocking by IP address plus a self-declaration at sign-up enough, or do we need more?
8. **Consumer duties.** Required terms, age limits, responsible-play features (self-exclusion, limits) and complaint handling.
9. **Tax.** How the fee income is treated for us, and whether we have any reporting duty for players' winnings.
10. **Structure.** Should the operating entity sit somewhere other than the founder's home country? What would that change?

## Documents we can provide

Contract source and tests (public, MIT): https://github.com/victor-onoja/degenChess. Security review notes: `docs/AUDIT.md`. Live test version: https://test.awaychess.com (test dollars only).
