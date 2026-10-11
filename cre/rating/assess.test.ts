// Unit tests for the decision the rating workflow makes: node --test assess.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, cleanHandle, HANDLE_RULE, headline, linkCode, Outcome } from "../../src/lib/rating.ts";

const player = "0xc1F2533DA70F6d6713A543B15056A774F0e1edF9";
const stats = { chess_rapid: { last: { rating: 1450 } }, chess_blitz: { last: { rating: 1380.4 } } };

test("the code comes from the player's address, in lower case", () => {
  assert.equal(linkCode(player), "away-e1edf9");
  assert.notEqual(linkCode("0x85056F886e20Eca2a55f4A9dceF1BC5ecC8b2Acd"), linkCode(player));
});

test("an account carrying the code is verified, with its ratings", () => {
  const profile = { username: "Alice_W", name: "Alice", location: "Lagos AWAY-E1EDF9" };
  assert.deepEqual(assess(player, "alice_w", profile, stats), { outcome: Outcome.Verified, rapid: 1450, blitz: 1380, bullet: 0 });
  // The code may sit in the name instead.
  assert.equal(assess(player, "alice_w", { username: "alice_w", name: "away-e1edf9" }, stats).outcome, Outcome.Verified);
});

test("someone else's code, or none, is refused and reports no rating", () => {
  const profile = { username: "alice_w", location: "Florida away-b2acd0" };
  assert.deepEqual(assess(player, "alice_w", profile, stats), { outcome: Outcome.CodeMissing, rapid: 0, blitz: 0, bullet: 0 });
  assert.equal(assess(player, "alice_w", { username: "alice_w" }, stats).outcome, Outcome.CodeMissing);
});

test("a missing account, or an answer for a different username, is no account", () => {
  assert.equal(assess(player, "ghost", null, null).outcome, Outcome.NoAccount);
  assert.equal(assess(player, "alice_w", { username: "someone_else", location: "away-e1edf9" }, stats).outcome, Outcome.NoAccount);
});

test("ratings are whole numbers that fit the contract, and missing ones are 0", () => {
  const profile = { username: "a_b", location: "away-e1edf9" };
  assert.deepEqual(assess(player, "a_b", profile, null), { outcome: Outcome.Verified, rapid: 0, blitz: 0, bullet: 0 });
  assert.equal(assess(player, "a_b", profile, { chess_bullet: { last: { rating: 999999 } } }).bullet, 65535);
  assert.equal(assess(player, "a_b", profile, { chess_rapid: { last: { rating: -5 } } }).rapid, 0);
});

test("usernames are cleaned to what the contract accepts; the headline is rapid, then blitz, then bullet", () => {
  assert.equal(cleanHandle("  Magnus Carlsen! "), "magnuscarlsen");
  assert.ok(HANDLE_RULE.test("hikaru") && !HANDLE_RULE.test("ab") && !HANDLE_RULE.test("Hikaru"));
  assert.equal(headline({ rapid: 0, blitz: 1380, bullet: 1200 }), 1380);
  assert.equal(headline({ rapid: 0, blitz: 0, bullet: 0 }), 0);
});
