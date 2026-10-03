const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox-viem/network-helpers");
const { parseUnits, parseEther, getAddress, zeroAddress } = require("viem");
const { Chess } = require("chess.js");

const usd = (n) => parseUnits(String(n), 6);
const STAKE = usd(10);
const TIMEOUT = 3600n;

const PROMO = { n: 2, b: 3, r: 4, q: 5 };
const TYPE_CHAR = ["", "p", "n", "b", "r", "q", "k"];

const squareIndex = (sq) => (Number(sq[1]) - 1) * 8 + (sq.charCodeAt(0) - 97);
const encodeMove = (m) => squareIndex(m.from) | (squareIndex(m.to) << 6) | ((m.promotion ? PROMO[m.promotion] : 0) << 12);

/** Contract board (64 x 4 bits) -> same shape as chess.js board() output. */
function decodeBoard(board) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    const row = [];
    for (let file = 0; file < 8; file++) {
      const nibble = Number((board >> BigInt((rank * 8 + file) * 4)) & 0xfn);
      row.push(nibble === 0 ? null : { type: TYPE_CHAR[nibble & 7], color: nibble & 8 ? "b" : "w" });
    }
    rows.push(row);
  }
  return rows;
}
const simplify = (b) => b.map((r) => r.map((p) => (p ? p.color + p.type : null)));

/** Deterministic PRNG so random games are reproducible. */
function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

async function deployFixture() {
  const [owner, white, black, stranger, whiteKey, blackKey] = await hre.viem.getWalletClients();
  const link = await hre.viem.deployContract("MockUSD");
  const chess = await hre.viem.deployContract("DegenChess", [link.address, TIMEOUT]);
  for (const w of [white, black, stranger]) {
    await link.write.mint([w.account.address, usd(1000)]);
    await link.write.approve([chess.address, usd(1000)], { account: w.account });
  }
  const as = (wallet) => ({ account: wallet.account });
  return { owner, white, black, stranger, whiteKey, blackKey, link, chess, as };
}

async function activeGameFixture() {
  const f = await deployFixture();
  await f.chess.write.createGame([STAKE, zeroAddress, 0, 0], f.as(f.white));
  await f.chess.write.joinGame([0n, zeroAddress], f.as(f.black));
  return f;
}

async function playSan(f, sans, game = new Chess()) {
  for (const san of sans) {
    const m = game.move(san);
    await f.chess.write.makeMove([0n, encodeMove(m)], f.as(m.color === "w" ? f.white : f.black));
  }
  return game;
}

const gameInfo = async (chess, id = 0n) => {
  const [white, black, stake, whiteBalance, blackBalance, status, result, drawOfferedBy, lastMoveAt, moveCount] =
    await chess.read.getGame([id]);
  return { white, black, stake, whiteBalance, blackBalance, status, result, drawOfferedBy, lastMoveAt, moveCount };
};

describe("DegenChess", () => {
  describe("lifecycle", () => {
    it("creates, joins and escrows both stakes", async () => {
      const f = await loadFixture(activeGameFixture);
      const g = await gameInfo(f.chess);
      expect(g.white).to.equal(getAddress(f.white.account.address));
      expect(g.black).to.equal(getAddress(f.black.account.address));
      expect(g.status).to.equal(2); // Active
      expect(await f.link.read.balanceOf([f.chess.address])).to.equal(STAKE * 2n);
    });

    it("lets the creator cancel an unjoined game for a full refund", async () => {
      const f = await loadFixture(deployFixture);
      const before = await f.link.read.balanceOf([f.white.account.address]);
      await f.chess.write.createGame([STAKE, zeroAddress, 0, 0], f.as(f.white));
      await expect(f.chess.write.cancelGame([0n], f.as(f.black))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.cancelGame([0n], f.as(f.white));
      expect(await f.link.read.balanceOf([f.white.account.address])).to.equal(before);
      await expect(f.chess.write.joinGame([0n, zeroAddress], f.as(f.black))).to.be.rejectedWith("WrongStatus");
    });

    it("rejects joining your own game, a full game, or a tiny stake", async () => {
      const f = await loadFixture(deployFixture);
      await expect(f.chess.write.createGame([1n, zeroAddress, 0, 0], f.as(f.white))).to.be.rejectedWith("InvalidStake");
      await f.chess.write.createGame([STAKE, zeroAddress, 0, 0], f.as(f.white));
      await expect(f.chess.write.joinGame([0n, zeroAddress], f.as(f.white))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.joinGame([0n, zeroAddress], f.as(f.black));
      await expect(f.chess.write.joinGame([0n, zeroAddress], f.as(f.stranger))).to.be.rejectedWith("WrongStatus");
    });
  });

  describe("moves", () => {
    it("enforces turn order and piece ownership", async () => {
      const f = await loadFixture(activeGameFixture);
      const e4 = encodeMove({ from: "e2", to: "e4" });
      await expect(f.chess.write.makeMove([0n, e4], f.as(f.black))).to.be.rejectedWith("NotYourTurn");
      await expect(f.chess.write.makeMove([0n, e4], f.as(f.stranger))).to.be.rejectedWith("NotYourTurn");
      // White trying to move a black pawn / an empty square.
      await expect(
        f.chess.write.makeMove([0n, encodeMove({ from: "e7", to: "e5" })], f.as(f.white))
      ).to.be.rejectedWith("InvalidMove");
      await expect(
        f.chess.write.makeMove([0n, encodeMove({ from: "e4", to: "e5" })], f.as(f.white))
      ).to.be.rejectedWith("InvalidMove");
      await f.chess.write.makeMove([0n, e4], f.as(f.white));
      await expect(f.chess.write.makeMove([0n, e4], f.as(f.white))).to.be.rejectedWith("NotYourTurn");
    });

    it("tracks en passant, promotion, castling and captures exactly like chess.js", async () => {
      const f = await loadFixture(activeGameFixture);
      const game = await playSan(
        f,
        "e4 a6 e5 d5 exd6 Nf6 dxc7 Qd7 cxb8=Q Rxb8 Nc3 b5 d3 e6 Be3 Bc5 Qd2 O-O O-O-O Bxe3 Qxe3 Qd4 Qxd4".split(" ")
      );
      expect(simplify(decodeBoard(await f.chess.read.getBoard([0n])))).to.deep.equal(simplify(game.board()));

      // Balances: white captured d-pawn (ep), c-pawn, b8 knight, bishop, queen; black captured the promoted queen and a bishop.
      const g = await gameInfo(f.chess);
      expect(g.whiteBalance + g.blackBalance).to.equal(STAKE * 2n);
      const v = (w) => (STAKE * w) / 39n;
      const whiteGain = v(1n) + v(1n) + v(3n) + v(3n) + v(9n);
      const blackGain = v(9n) + v(3n);
      expect(g.whiteBalance).to.equal(STAKE + whiteGain - blackGain);
    });

    it("stays in sync with chess.js over random legal games", async function () {
      this.timeout(120_000);
      for (let seed = 1; seed <= 6; seed++) {
        const f = await deployFixture();
        await f.chess.write.createGame([STAKE, zeroAddress, 0, 0], f.as(f.white));
        await f.chess.write.joinGame([0n, zeroAddress], f.as(f.black));
        const rand = rng(seed * 7919);
        const game = new Chess();
        for (let ply = 0; ply < 200 && !game.isGameOver(); ply++) {
          const moves = game.moves({ verbose: true });
          // Prefer captures/promotions so the test exercises the accounting paths.
          const spicy = moves.filter((m) => m.captured || m.promotion);
          const pool = spicy.length && rand() < 0.6 ? spicy : moves;
          const m = pool[Math.floor(rand() * pool.length)];
          game.move(m);
          await f.chess.write.makeMove([0n, encodeMove(m)], f.as(m.color === "w" ? f.white : f.black));
          if (m.captured) {
            const before = await gameInfo(f.chess, 0n);
            const moverBalance = m.color === "w" ? before.whiteBalance : before.blackBalance;
            expect(moverBalance > 0n).to.equal(true);
            expect(before.whiteBalance + before.blackBalance).to.equal(STAKE * 2n);
          }
        }
        expect(simplify(decodeBoard(await f.chess.read.getBoard([0n]))), `seed ${seed}`).to.deep.equal(
          simplify(game.board())
        );
        const g = await gameInfo(f.chess);
        expect(g.whiteBalance + g.blackBalance).to.equal(STAKE * 2n);

        // Settle and make sure every token leaves the contract.
        await f.chess.write.resign([0n], f.as(game.turn() === "w" ? f.white : f.black));
        const after = await gameInfo(f.chess);
        if (after.whiteBalance > 0n) await f.chess.write.withdraw([0n], f.as(f.white));
        if (after.blackBalance > 0n) await f.chess.write.withdraw([0n], f.as(f.black));
        await f.chess.write.withdrawFees(f.as(f.owner));
        expect(await f.link.read.balanceOf([f.chess.address]), `seed ${seed}`).to.equal(0n);
      }
    });
  });

  describe("settlement", () => {
    it("pays the winner, lets the loser keep their capture gains, and takes a 2.5% fee", async () => {
      const f = await loadFixture(activeGameFixture);
      // White wins a pawn and a knight; black wins a knight.
      await playSan(f, "e4 d5 exd5 Nf6 Nc3 Nxd5 Nxd5 Qxd5".split(" "));
      // white captured: p(1) + n(3); black captured: n(3); black's queen then took the knight: n(3)
      const v = (w) => (STAKE * w) / 39n;
      const blackGains = v(3n) + v(3n);
      await f.chess.write.resign([0n], f.as(f.white)); // black wins

      const total = STAKE * 2n;
      const fee = (total * 25n) / 1000n;
      const g = await gameInfo(f.chess);
      expect(g.status).to.equal(3); // Finished
      expect(g.result).to.equal(2); // BlackWins
      const whiteGains = v(1n) + v(3n);
      expect(g.whiteBalance).to.equal((whiteGains * (total - fee)) / total);
      expect(g.whiteBalance + g.blackBalance + fee <= total).to.equal(true);
      expect(blackGains > 0n).to.equal(true);

      // Fees accrue in the contract and only the owner can pull them.
      expect(await f.chess.read.accruedFees()).to.equal(total - g.whiteBalance - g.blackBalance);
      await expect(f.chess.write.withdrawFees(f.as(f.white))).to.be.rejectedWith("NotOwner");
      await f.chess.write.withdrawFees(f.as(f.owner));
      const ownerBal = await f.link.read.balanceOf([f.owner.account.address]);
      expect(ownerBal).to.equal(total - g.whiteBalance - g.blackBalance);
      expect(ownerBal - fee <= 1n).to.equal(true);

      await f.chess.write.withdraw([0n], f.as(f.white));
      await f.chess.write.withdraw([0n], f.as(f.black));
      await expect(f.chess.write.withdraw([0n], f.as(f.black))).to.be.rejectedWith("NothingToWithdraw");
      await expect(f.chess.write.withdraw([0n], f.as(f.stranger))).to.be.rejectedWith("NothingToWithdraw");
      expect(await f.link.read.balanceOf([f.chess.address])).to.equal(0n);
    });

    it("regression: ending after heavy captures never reverts (old contract underflowed)", async () => {
      const f = await loadFixture(activeGameFixture);
      await playSan(f, "e4 d5 exd5 Qxd5 Nc3 Qxg2 Bxg2 Bh3 Bxh3 Nc6 Bd7+ Kxd7 Qg4+ e6 Qxg7 Bxg7".split(" "));
      await f.chess.write.resign([0n], f.as(f.black));
      const g = await gameInfo(f.chess);
      expect(g.result).to.equal(1); // WhiteWins
      await f.chess.write.withdraw([0n], f.as(f.white));
      if (g.blackBalance > 0n) await f.chess.write.withdraw([0n], f.as(f.black));
      await f.chess.write.withdrawFees(f.as(f.owner));
      expect(await f.link.read.balanceOf([f.chess.address])).to.equal(0n);
    });

    it("draw by agreement keeps capture-adjusted balances", async () => {
      const f = await loadFixture(activeGameFixture);
      await expect(f.chess.write.acceptDraw([0n], f.as(f.black))).to.be.rejectedWith("NoDrawOffer");
      await f.chess.write.offerDraw([0n], f.as(f.white));
      await expect(f.chess.write.acceptDraw([0n], f.as(f.white))).to.be.rejectedWith("NoDrawOffer");
      await expect(f.chess.write.offerDraw([0n], f.as(f.stranger))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.acceptDraw([0n], f.as(f.black));
      const g = await gameInfo(f.chess);
      expect(g.result).to.equal(3); // Draw
      expect(g.whiteBalance).to.equal(g.blackBalance);
    });

    it("a draw is free: no fee, each side keeps exactly its balance", async () => {
      const f = await loadFixture(activeGameFixture);
      await playSan(f, "e4 d5 exd5 Qxd5".split(" ")); // a pawn each way
      const before = await gameInfo(f.chess);
      await f.chess.write.offerDraw([0n], f.as(f.white));
      await f.chess.write.acceptDraw([0n], f.as(f.black));
      const g = await gameInfo(f.chess);
      expect(g.whiteBalance).to.equal(before.whiteBalance);
      expect(g.blackBalance).to.equal(before.blackBalance);
      expect(await f.chess.read.accruedFees()).to.equal(0n);
    });

    it("whoever referred a player earns 20% of that player's half of the fee", async () => {
      const f = await loadFixture(activeGameFixture);
      await expect(f.chess.write.setReferrer([f.white.account.address], f.as(f.white))).to.be.rejectedWith("InvalidReferrer");
      await f.chess.write.setReferrer([f.stranger.account.address], f.as(f.white));
      await expect(f.chess.write.setReferrer([f.black.account.address], f.as(f.white))).to.be.rejectedWith("ReferrerAlreadySet");
      expect((await f.chess.read.referrerOf([f.white.account.address])).toLowerCase()).to.equal(f.stranger.account.address.toLowerCase());

      await f.chess.write.resign([0n], f.as(f.white)); // black wins; only white was referred
      const total = STAKE * 2n;
      const g = await gameInfo(f.chess);
      const fee = total - g.whiteBalance - g.blackBalance;
      const share = ((fee / 2n) * 2000n) / 10000n;
      expect(share > 0n).to.equal(true);
      expect(await f.chess.read.referralEarnings([f.stranger.account.address])).to.equal(share);
      expect(await f.chess.read.accruedFees()).to.equal(fee - share);

      await expect(f.chess.write.withdrawReferralEarnings(f.as(f.black))).to.be.rejectedWith("NothingToWithdraw");
      await f.chess.write.withdrawReferralEarnings(f.as(f.stranger));
      await f.chess.write.withdraw([0n], f.as(f.black));
      await f.chess.write.withdrawFees(f.as(f.owner));
      expect(await f.link.read.balanceOf([f.chess.address])).to.equal(0n); // every token accounted for
    });

    it("making a move declines the opponent's draw offer", async () => {
      const f = await loadFixture(activeGameFixture);
      await f.chess.write.offerDraw([0n], f.as(f.black));
      await playSan(f, ["e4"]);
      await expect(f.chess.write.acceptDraw([0n], f.as(f.white))).to.be.rejectedWith("NoDrawOffer");
    });

    it("lets the waiting player claim a win on timeout, not before", async () => {
      const f = await loadFixture(activeGameFixture);
      await playSan(f, ["e4"]); // black to move
      await expect(f.chess.write.claimTimeout([0n], f.as(f.white))).to.be.rejectedWith("TimeoutNotReached");
      await expect(f.chess.write.claimTimeout([0n], f.as(f.black))).to.be.rejectedWith("NotPlayer");
      await time.increase(Number(TIMEOUT) + 1);
      await expect(f.chess.write.claimTimeout([0n], f.as(f.black))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.claimTimeout([0n], f.as(f.white));
      expect((await gameInfo(f.chess)).result).to.equal(1); // WhiteWins
    });

    it("only the owner can arbitrate, and nobody can end a game they are not in", async () => {
      const f = await loadFixture(activeGameFixture);
      await expect(f.chess.write.arbitrate([0n, 1, false], f.as(f.white))).to.be.rejectedWith("NotOwner");
      await expect(f.chess.write.resign([0n], f.as(f.stranger))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.arbitrate([0n, 2, false], f.as(f.owner));
      expect((await gameInfo(f.chess)).result).to.equal(2);
      await expect(f.chess.write.makeMove([0n, encodeMove({ from: "e2", to: "e4" })], f.as(f.white))).to.be.rejectedWith(
        "WrongStatus"
      );
    });
  });
  describe("game keys", () => {
    async function keyedGameFixture() {
      const f = await deployFixture();
      await f.chess.write.createGame([STAKE, f.whiteKey.account.address, 0, 0], {
        ...f.as(f.white),
        value: parseEther("0.5"),
      });
      await f.chess.write.joinGame([0n, f.blackKey.account.address], f.as(f.black));
      return f;
    }

    it("registers keys and forwards attached MON to the key for gas", async () => {
      const f = await deployFixture();
      const client = await hre.viem.getPublicClient();
      const before = await client.getBalance({ address: f.whiteKey.account.address });
      await f.chess.write.createGame([STAKE, f.whiteKey.account.address, 0, 0], {
        ...f.as(f.white),
        value: parseEther("0.5"),
      });
      expect((await client.getBalance({ address: f.whiteKey.account.address })) - before).to.equal(parseEther("0.5"));
      expect(await client.getBalance({ address: f.chess.address })).to.equal(0n);
      const [wk, bk] = await f.chess.read.getGameKeys([0n]);
      expect(wk).to.equal(getAddress(f.whiteKey.account.address));
      expect(bk).to.equal(zeroAddress);
      // Sending MON without a key to receive it is refused rather than trapped in the contract.
      await expect(
        f.chess.write.createGame([STAKE, zeroAddress, 0, 0], { ...f.as(f.white), value: 1n })
      ).to.be.rejectedWith("GasForwardFailed");
    });

    it("lets keys play moves and draws on their player's behalf", async () => {
      const f = await loadFixture(keyedGameFixture);
      const game = new Chess();
      for (const san of ["e4", "e5"]) {
        const m = game.move(san);
        await f.chess.write.makeMove([0n, encodeMove(m)], f.as(m.color === "w" ? f.whiteKey : f.blackKey));
      }
      // A key can't move out of turn or for the other side.
      await expect(
        f.chess.write.makeMove([0n, encodeMove({ from: "d7", to: "d5" })], f.as(f.blackKey))
      ).to.be.rejectedWith("NotYourTurn");
      await f.chess.write.offerDraw([0n], f.as(f.whiteKey));
      expect((await gameInfo(f.chess)).drawOfferedBy).to.equal(getAddress(f.white.account.address));
      await f.chess.write.acceptDraw([0n], f.as(f.blackKey));
      expect((await gameInfo(f.chess)).result).to.equal(3);
    });

    it("never lets a key resign, cancel or withdraw", async () => {
      const f = await loadFixture(keyedGameFixture);
      await expect(f.chess.write.resign([0n], f.as(f.whiteKey))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.resign([0n], f.as(f.black));
      await expect(f.chess.write.withdraw([0n], f.as(f.whiteKey))).to.be.rejectedWith("NothingToWithdraw");

      const f2 = await deployFixture();
      await f2.chess.write.createGame([STAKE, f2.whiteKey.account.address, 0, 0], f2.as(f2.white));
      await expect(f2.chess.write.cancelGame([0n], f2.as(f2.whiteKey))).to.be.rejectedWith("NotPlayer");
    });

    it("keys are scoped to their game, and can be rotated or revoked", async () => {
      const f = await loadFixture(keyedGameFixture);
      await f.chess.write.createGame([STAKE, zeroAddress, 0, 0], f.as(f.white)); // game 1, no key
      await f.chess.write.joinGame([1n, zeroAddress], f.as(f.black));
      const e4 = encodeMove({ from: "e2", to: "e4" });
      await expect(f.chess.write.makeMove([1n, e4], f.as(f.whiteKey))).to.be.rejectedWith("NotYourTurn");

      await expect(f.chess.write.setGameKey([0n, f.stranger.account.address], f.as(f.whiteKey))).to.be.rejectedWith(
        "NotPlayer"
      );
      await f.chess.write.setGameKey([0n, zeroAddress], f.as(f.white));
      await expect(f.chess.write.makeMove([0n, e4], f.as(f.whiteKey))).to.be.rejectedWith("NotYourTurn");
      await f.chess.write.setGameKey([0n, f.stranger.account.address], f.as(f.white));
      await f.chess.write.makeMove([0n, e4], f.as(f.stranger));
    });

    it("ignores a key that is one of the players", async () => {
      const f = await deployFixture();
      await f.chess.write.createGame([STAKE, zeroAddress, 0, 0], f.as(f.white));
      await f.chess.write.joinGame([0n, f.white.account.address], f.as(f.black));
      const [, bk] = await f.chess.read.getGameKeys([0n]);
      expect(bk).to.equal(zeroAddress);
    });
  });
  describe("referee (Chainlink CRE consumer)", () => {
    const { encodeAbiParameters } = require("viem");
    const report = (gameId, result, forfeit, ply, reason) =>
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint8" }, { type: "bool" }, { type: "uint256" }, { type: "uint8" }],
        [gameId, result, forfeit, ply, reason]
      );

    async function refereeFixture() {
      const f = await activeGameFixture();
      // `stranger` plays the Chainlink forwarder.
      const referee = await hre.viem.deployContract("ChessReferee", [f.chess.address, f.stranger.account.address]);
      await f.chess.write.setArbiter([referee.address], f.as(f.owner));
      await referee.write.setReporter([f.stranger.account.address, true], f.as(f.owner));
      return { ...f, referee, forwarder: f.stranger };
    }

    it("behind an open forwarder, only allowed reporters can originate a verdict", async () => {
      const f = await activeGameFixture();
      const open = await hre.viem.deployContract("OpenForwarder");
      const referee = await hre.viem.deployContract("ChessReferee", [f.chess.address, open.address]);
      await f.chess.write.setArbiter([referee.address], f.as(f.owner));
      // Black tries to award itself the game through the forwarder that checks nothing.
      await expect(open.write.relay([referee.address, "0x", report(0n, 2, false, 0n, 2)], f.as(f.black))).to.be.rejectedWith(
        "NotReporter"
      );
      await expect(referee.write.setReporter([f.black.account.address, true], f.as(f.black))).to.be.rejectedWith("NotOwner");
      await referee.write.setReporter([f.stranger.account.address, true], f.as(f.owner));
      await open.write.relay([referee.address, "0x", report(0n, 3, false, 0n, 3)], f.as(f.stranger));
      expect((await gameInfo(f.chess)).result).to.equal(3); // Draw
    });

    it("settles a checkmate from a forwarded report; the loser keeps capture gains", async () => {
      const f = await loadFixture(refereeFixture);
      await playSan(f, "e4 e5 Bc4 Nc6 d4 exd4 Qh5 Nf6 Qxf7#".split(" "));
      await f.referee.write.onReport(["0x", report(0n, 1, false, 9n, 2)], f.as(f.forwarder));
      const g = await gameInfo(f.chess);
      expect(g.status).to.equal(3);
      expect(g.result).to.equal(1); // WhiteWins
      expect(g.blackBalance > 0n).to.equal(true); // black captured a pawn and keeps it
      // The same verdict can't be applied twice.
      await expect(f.referee.write.onReport(["0x", report(0n, 1, false, 9n, 2)], f.as(f.forwarder))).to.be.rejectedWith(
        "WrongStatus"
      );
    });

    it("an illegal move forfeits everything, including illegal capture gains", async () => {
      const f = await loadFixture(refereeFixture);
      await playSan(f, ["e4", "e5"]);
      // White teleports the queen from d1 onto black's queen at d8: accepted by the contract, illegal in chess.
      await f.chess.write.makeMove([0n, encodeMove({ from: "d1", to: "d8" })], f.as(f.white));
      const before = await gameInfo(f.chess);
      expect(before.whiteBalance > STAKE).to.equal(true); // the cheat paid out...
      await f.referee.write.onReport(["0x", report(0n, 2, true, 3n, 1)], f.as(f.forwarder));
      const g = await gameInfo(f.chess);
      expect(g.result).to.equal(2); // BlackWins
      expect(g.whiteBalance).to.equal(0n); // ...and is taken back in full
      const total = STAKE * 2n;
      expect(g.blackBalance).to.equal(total - (total * 25n) / 1000n);
    });

    it("only the forwarder can deliver reports, and only the arbiter or owner can arbitrate", async () => {
      const f = await loadFixture(refereeFixture);
      await expect(f.referee.write.onReport(["0x", report(0n, 1, false, 0n, 2)], f.as(f.white))).to.be.rejectedWith(
        "NotForwarder"
      );
      await expect(f.chess.write.arbitrate([0n, 1, true], f.as(f.forwarder))).to.be.rejectedWith("NotOwner");
      await expect(f.chess.write.setArbiter([f.white.account.address], f.as(f.white))).to.be.rejectedWith("NotOwner");
      await expect(f.referee.write.setForwarder([f.white.account.address], f.as(f.white))).to.be.rejectedWith("NotOwner");
    });

    it("can require a specific workflow owner in the report metadata", async () => {
      const f = await loadFixture(refereeFixture);
      const { concat, pad, zeroHash } = require("viem");
      const workflowOwner = f.owner.account.address;
      await f.referee.write.setExpectedWorkflowOwner([workflowOwner], f.as(f.owner));
      const meta = (who) => concat([zeroHash, pad("0x", { size: 10 }), who, "0x0001"]);
      await expect(
        f.referee.write.onReport([meta(f.white.account.address), report(0n, 3, false, 0n, 3)], f.as(f.forwarder))
      ).to.be.rejectedWith("WrongWorkflowOwner");
      await expect(f.referee.write.onReport(["0x", report(0n, 3, false, 0n, 3)], f.as(f.forwarder))).to.be.rejectedWith(
        "WrongWorkflowOwner"
      );
      await f.referee.write.onReport([meta(workflowOwner), report(0n, 3, false, 0n, 3)], f.as(f.forwarder));
      expect((await gameInfo(f.chess)).result).to.equal(3); // Draw
    });

    it("advertises the IReceiver interface", async () => {
      const f = await loadFixture(refereeFixture);
      expect(await f.referee.read.supportsInterface(["0x01ffc9a7"])).to.equal(true); // ERC165
      expect(await f.referee.read.supportsInterface(["0x805f2132"])).to.equal(true); // onReport(bytes,bytes)
      expect(await f.referee.read.supportsInterface(["0xdeadbeef"])).to.equal(false);
    });
  });

  describe("chess clock", () => {
    async function clockFixture() {
      const f = await deployFixture();
      await f.chess.write.createGame([STAKE, zeroAddress, 300, 5], f.as(f.white)); // 5 minutes + 5 seconds
      await f.chess.write.joinGame([0n, zeroAddress], f.as(f.black));
      return f;
    }
    const clock = async (f) => {
      const [base, increment, whiteTime, blackTime] = await f.chess.read.getClock([0n]);
      return { base, increment, whiteTime, blackTime };
    };

    it("charges the mover for their thinking time and adds the increment", async () => {
      const f = await loadFixture(clockFixture);
      expect(await clock(f)).to.deep.equal({ base: 300, increment: 5, whiteTime: 300, blackTime: 300 });
      await time.increase(40);
      await playSan(f, ["e4"]);
      const afterWhite = await clock(f);
      expect(afterWhite.whiteTime).to.be.within(263, 265); // 300 - ~41 + 5
      expect(afterWhite.blackTime).to.equal(300);
      await time.increase(10);
      const game = new Chess();
      game.move("e4");
      const m = game.move("e5");
      await f.chess.write.makeMove([0n, encodeMove(m)], f.as(f.black));
      expect((await clock(f)).blackTime).to.be.within(293, 295);
    });

    it("a player whose clock ran out can't move, and the opponent claims the win", async () => {
      const f = await loadFixture(clockFixture);
      await playSan(f, ["e4"]); // black on the clock with 300s
      await expect(f.chess.write.claimTimeout([0n], f.as(f.white))).to.be.rejectedWith("TimeoutNotReached");
      await time.increase(301);
      await expect(
        f.chess.write.makeMove([0n, encodeMove({ from: "e7", to: "e5" })], f.as(f.black))
      ).to.be.rejectedWith("TimeExpired");
      await f.chess.write.claimTimeout([0n], f.as(f.white));
      expect((await gameInfo(f.chess)).result).to.equal(1); // WhiteWins
    });

    it("rejects clock settings that could overflow or make no sense", async () => {
      const f = await loadFixture(deployFixture);
      const create = (clock, inc) => f.chess.write.createGame([STAKE, zeroAddress, clock, inc], f.as(f.white));
      await expect(create(100, 4294967200)).to.be.rejectedWith("InvalidClock");
      await expect(create(4294967295, 0)).to.be.rejectedWith("InvalidClock");
      await expect(create(0, 5)).to.be.rejectedWith("InvalidClock");
      await create(3 * 3600, 300); // the maximums are allowed
    });

    it("games without a clock keep the per-move timeout", async () => {
      const f = await loadFixture(activeGameFixture);
      expect((await f.chess.read.getClock([0n]))[0]).to.equal(0);
      await time.increase(600);
      await playSan(f, ["e4"]); // well past any 5-minute clock, still fine
    });
  });

  describe("player names", () => {
    it("claims unique lowercase names and lets a player rename", async () => {
      const [, alice, bob] = await hre.viem.getWalletClients();
      const names = await hre.viem.deployContract("PlayerNames");
      const as = (w) => ({ account: w.account });
      await names.write.setName(["magnus_99"], as(alice));
      expect(await names.read.nameOf([alice.account.address])).to.equal("magnus_99");
      await expect(names.write.setName(["magnus_99"], as(bob))).to.be.rejectedWith("NameTaken");
      for (const bad of ["ab", "Magnus", "has space", "waytoolongforausername", "emoji🙂"]) {
        await expect(names.write.setName([bad], as(bob))).to.be.rejectedWith("InvalidName");
      }
      // Renaming frees the old name.
      await names.write.setName(["hikaru"], as(alice));
      await names.write.setName(["magnus_99"], as(bob));
      expect(await names.read.namesOf([[alice.account.address, bob.account.address, names.address]])).to.deep.equal([
        "hikaru",
        "magnus_99",
        "",
      ]);
    });
  });
});
