// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DegenChess
/// @notice Staked chess where every capture moves part of the victim's stake to the capturer.
///         When the game ends the winner takes the loser's balance, except whatever the loser
///         earned through their own captures - so a loser who captured well still gets paid.
///
/// Moves are recorded on-chain (turn enforced), which also lets both clients stay in sync
/// without a backend. The contract tracks the board to account for captures, but does NOT
/// validate full chess legality. A Chainlink CRE workflow replays every game off-chain and settles it
/// through the arbiter: checkmates and rule draws are declared automatically and an illegal move
/// forfeits the game. The owner can arbitrate as a fallback, and a stalled game ends on timeout.
///
/// Game keys: each player may register a second address (a prompt-free session key held in the
/// browser) that can play for them - move, offer/accept draws, claim timeouts - but can never
/// resign, cancel or withdraw. Money actions always need the player's own key.
///
/// Trust layer (fair play): every account has a trust tier, 0 by default. A tier caps the stake an
/// account may put up and sets how long its winnings wait after a game before they can be withdrawn,
/// so an engine user can be caught before the money leaves. An off-chain risk service (the risk
/// operator) promotes accounts as they build a record; the contract only enforces. Two review powers
/// exist and both are bounded: `freeze` pauses an account for at most MAX_FREEZE and cannot be renewed
/// until FREEZE_COOLDOWN has passed, and `penalize` gives a cheater's unwithdrawn winnings from one game
/// to the opponent. Neither can send money to the owner or to anyone outside the game.
contract DegenChess is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open, // created, waiting for an opponent
        Active,
        Finished,
        Cancelled
    }

    enum Result {
        None,
        WhiteWins,
        BlackWins,
        Draw
    }

    struct Game {
        address white; // creator
        address black; // joiner
        address whiteKey; // optional game keys (see contract docs)
        address blackKey;
        uint256 stake; // per player
        uint256 whiteBalance; // stake +/- capture transfers
        uint256 blackBalance;
        uint256 whiteGains; // value won through captures
        uint256 blackGains;
        uint256 board; // 64 squares x 4 bits, square 0 = a1, 63 = h8
        uint64 lastMoveAt;
        // Chess clock, in seconds. clockBase == 0 means no clock: each move just has `moveTimeout`.
        uint32 clockBase;
        uint32 clockIncrement; // added to a player's clock after each of their moves
        uint32 whiteTime; // time left when that player's turn last started
        uint32 blackTime;
        Status status;
        Result result;
        address drawOfferedBy;
        bool whiteWithdrawn;
        bool blackWithdrawn;
        // The side the creator asked for: 0 white, 1 black, 2 random. While the game is open the creator
        // sits in the white slot; the seats are settled when someone joins.
        uint8 creatorSide;
        uint64 endedAt; // when the game finished: payout holds count from here
        uint16[] moves; // from | to << 6 | promotion << 12
    }

    // Piece encoding in a board nibble: low 3 bits = type, bit 3 = black.
    uint8 internal constant PAWN = 1;
    uint8 internal constant KNIGHT = 2;
    uint8 internal constant BISHOP = 3;
    uint8 internal constant ROOK = 4;
    uint8 internal constant QUEEN = 5;
    uint8 internal constant KING = 6;
    uint8 internal constant BLACK = 8;

    /// @dev Sum of piece weights for one side (8 pawns + 2N + 2B + 2R + Q = 8+6+6+10+9).
    ///      Piece values are stake * weight / 39, so one side's pieces are worth exactly its stake.
    uint256 public constant TOTAL_WEIGHT = 39;
    uint256 public constant FEE_PERCENTAGE = 25; // 2.5%
    uint256 public constant FEE_DENOMINATOR = 1000;
    /// @notice Share of each player's half of the fee paid to whoever referred them, in basis points.
    uint256 public constant REFERRAL_SHARE_BPS = 2000; // 20%
    uint32 public constant MAX_CLOCK = 3 hours;
    uint32 public constant MAX_INCREMENT = 5 minutes;
    /// @notice Trust tiers 0..TIER_COUNT-1. New accounts are tier 0.
    uint8 public constant TIER_COUNT = 4;
    /// @notice The longest any tier's winnings can be held after a game.
    uint32 public constant MAX_HOLD = 3 days;
    /// @notice The longest a single freeze can last, and how long after it ends before another may start.
    uint32 public constant MAX_FREEZE = 14 days;
    uint32 public constant FREEZE_COOLDOWN = 7 days;

    IERC20 public immutable paymentToken;
    /// @notice Withdraws fees, sets the arbiter and can arbitrate as a fallback. Handed over in two steps
    ///         (`transferOwnership`, then `acceptOwnership` by the new owner) so the key can be rotated.
    address public owner;
    address public pendingOwner;
    /// @notice Optional second arbiter: the Chainlink CRE referee contract that settles games automatically.
    address public arbiter;
    /// @notice Fees collected at settlement, waiting for the owner to withdraw them.
    uint256 public accruedFees;
    /// @notice A player's record over every finished game: the leaderboard, kept exactly and forever.
    struct PlayerStats {
        uint32 wins;
        uint32 draws;
        uint32 losses;
        int256 net; // payouts minus stakes, after fees
    }

    mapping(address => PlayerStats) public stats;
    /// @dev Everyone who has finished a game, in order of first appearance (see `getPlayers`).
    address[] internal ranked;

    /// @notice Who invited each player (set once, by the player). Earns part of the fee on their games.
    mapping(address => address) public referrerOf;
    /// @notice Referral earnings waiting to be withdrawn.
    mapping(address => uint256) public referralEarnings;
    uint256 public immutable moveTimeout;
    uint256 public immutable initialBoard;

    mapping(uint256 => Game) internal games;
    uint256 public gameCount;

    struct TierPolicy {
        uint256 maxStake; // largest stake an account in this tier may put up (create or join)
        uint32 payoutHold; // seconds after a game ends before this tier's winnings can be withdrawn
    }

    /// @notice Each tier's limits. Unlimited with no hold until the owner sets them.
    TierPolicy[TIER_COUNT] public tierPolicy;
    mapping(address => uint8) public trustTier;
    /// @notice While in the future, the account cannot stake or withdraw (under review).
    mapping(address => uint64) public frozenUntil;
    /// @notice Sets trust tiers and freezes accounts: the off-chain risk service. The owner can too.
    address public riskOperator;
    /// @notice Winnings moved to a player by `penalize` after they had already withdrawn from that game.
    mapping(address => uint256) public credits;
    mapping(uint256 => bool) public penalized;

    event GameCreated(uint256 indexed gameId, address indexed white, uint256 stake);
    event GameCancelled(uint256 indexed gameId);
    event PlayerJoined(uint256 indexed gameId, address indexed black);
    event GameKeySet(uint256 indexed gameId, address indexed player, address key);
    event MoveMade(uint256 indexed gameId, address indexed player, uint16 move, uint8 captured, uint256 value);
    event DrawOffered(uint256 indexed gameId, address indexed by);
    event GameEnded(uint256 indexed gameId, Result result, uint256 whitePayout, uint256 blackPayout, uint256 fee);
    event Withdrawn(uint256 indexed gameId, address indexed player, uint256 amount);
    event ArbiterSet(address indexed arbiter);
    event Arbitrated(uint256 indexed gameId, address indexed by, Result result, bool forfeit);
    event ReferrerSet(address indexed player, address indexed referrer);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Seated(uint256 indexed gameId, address indexed white, address indexed black);
    event ReferralCredited(uint256 indexed gameId, address indexed referrer, uint256 amount);
    event TierPolicySet(uint8 indexed tier, uint256 maxStake, uint32 payoutHold);
    event TrustTierSet(address indexed player, uint8 tier);
    event Frozen(address indexed player, uint64 until);
    event Unfrozen(address indexed player);
    event RiskOperatorSet(address indexed operator);
    event Penalized(uint256 indexed gameId, address indexed cheater, address indexed beneficiary, uint256 amount);
    event CreditWithdrawn(address indexed player, uint256 amount);

    error NotOwner();
    error NotPlayer();
    error NotYourTurn();
    error WrongStatus();
    error InvalidStake();
    error InvalidMove();
    error TimeoutNotReached();
    error TimeExpired();
    error InvalidClock();
    error NoDrawOffer();
    error NothingToWithdraw();
    error GasForwardFailed();
    error ReferrerAlreadySet();
    error InvalidReferrer();
    error InvalidSide();
    error KeyTaken();
    error StakeAboveLimit();
    error AccountFrozen();
    error PayoutHeld();
    error InvalidTier();
    error InvalidHold();
    error FreezeTooLong();
    error FreezeCooldown();
    error AlreadyPenalized();

    constructor(address _paymentToken, uint256 _moveTimeout) {
        paymentToken = IERC20(_paymentToken);
        owner = msg.sender;
        moveTimeout = _moveTimeout;
        initialBoard = _buildInitialBoard();
        for (uint8 t = 0; t < TIER_COUNT; t++) tierPolicy[t].maxStake = type(uint256).max;
    }

    // ------------------------------------------------------------------ lifecycle

    /// @param _gameKey optional session key allowed to play for the creator (address(0) for none).
    ///        Any MON sent is forwarded to it to pay for its moves.
    /// @param _clockSeconds Thinking time per player for the whole game (0 = no clock).
    /// @param _incrementSeconds Added to a player's clock after each move they make.
    function createGame(uint256 _stake, address _gameKey, uint32 _clockSeconds, uint32 _incrementSeconds)
        external
        payable
        nonReentrant
        returns (uint256 gameId)
    {
        return _create(_stake, _gameKey, _clockSeconds, _incrementSeconds, 0);
    }

    /// @notice Create a game and choose your side: 0 white, 1 black, 2 random (decided when someone joins).
    function createGameAs(uint256 _stake, address _gameKey, uint32 _clockSeconds, uint32 _incrementSeconds, uint8 _side)
        external
        payable
        nonReentrant
        returns (uint256 gameId)
    {
        if (_side > 2) revert InvalidSide();
        return _create(_stake, _gameKey, _clockSeconds, _incrementSeconds, _side);
    }

    function _create(uint256 _stake, address _gameKey, uint32 _clockSeconds, uint32 _incrementSeconds, uint8 _side)
        internal
        returns (uint256 gameId)
    {
        // Keeps capture values non-zero and exact-ish; LINK has 18 decimals so this is tiny.
        if (_stake < TOTAL_WEIGHT) revert InvalidStake();
        // Bounded so the uint32 clock arithmetic in makeMove can never overflow and lock a game.
        if (_clockSeconds > MAX_CLOCK || _incrementSeconds > MAX_INCREMENT) revert InvalidClock();
        if (_clockSeconds == 0 && _incrementSeconds != 0) revert InvalidClock();
        _checkCanStake(msg.sender, _stake);
        paymentToken.safeTransferFrom(msg.sender, address(this), _stake);

        gameId = gameCount++;
        Game storage g = games[gameId];
        g.white = msg.sender;
        g.stake = _stake;
        g.whiteBalance = _stake;
        g.clockBase = _clockSeconds;
        g.clockIncrement = _incrementSeconds;
        g.status = Status.Open;
        g.creatorSide = _side;
        emit GameCreated(gameId, msg.sender, _stake);
        _setKey(g, gameId, _gameKey);
    }

    /// @notice Creator can take their stake back while nobody has joined.
    function cancelGame(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (msg.sender != g.white) revert NotPlayer();
        g.status = Status.Cancelled;
        uint256 amount = g.whiteBalance;
        g.whiteBalance = 0;
        g.whiteWithdrawn = true;
        emit GameCancelled(_gameId);
        paymentToken.safeTransfer(g.white, amount);
    }

    function joinGame(uint256 _gameId, address _gameKey) external payable nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (msg.sender == g.white) revert NotPlayer();
        _checkCanStake(msg.sender, g.stake);
        paymentToken.safeTransferFrom(msg.sender, address(this), g.stake);

        g.black = msg.sender;
        g.blackBalance = g.stake;
        g.board = initialBoard;
        g.status = Status.Active;
        g.lastMoveAt = uint64(block.timestamp);
        g.whiteTime = g.clockBase;
        g.blackTime = g.clockBase;
        emit PlayerJoined(_gameId, msg.sender);

        // Seat the players: the creator plays black if they asked to, or on a coin flip for random.
        // (The joiner can predict the flip; it only decides who moves first, never money.)
        bool swap = g.creatorSide == 1
            || (g.creatorSide == 2 && uint256(keccak256(abi.encodePacked(block.prevrandao, _gameId, msg.sender))) & 1 == 1);
        if (swap) {
            (g.white, g.black) = (g.black, g.white);
            (g.whiteKey, g.blackKey) = (g.blackKey, g.whiteKey);
        }
        emit Seated(_gameId, g.white, g.black);
        // Last, because it sends MON to an address the joiner chose: the seats are already final.
        _setKey(g, _gameId, _gameKey);
    }

    /// @return side the side the creator chose: 0 white, 1 black, 2 random.
    function getCreatorSide(uint256 _gameId) external view returns (uint8 side) {
        return games[_gameId].creatorSide;
    }

    /// @notice Replace (or revoke with address(0)) your game key, e.g. after switching devices.
    function setGameKey(uint256 _gameId, address _gameKey) external payable nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Open && g.status != Status.Active) revert WrongStatus();
        if (msg.sender != g.white && msg.sender != g.black) revert NotPlayer();
        _setKey(g, _gameId, _gameKey);
    }

    // ------------------------------------------------------------------ moves

    /// @param _move from (0-63) | to << 6 | promotion piece type << 12 (0 when not promoting)
    function makeMove(uint256 _gameId, uint16 _move) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        bool whiteToMove = g.moves.length % 2 == 0;
        address mover = _playerFor(g, msg.sender);
        if (mover == address(0) || mover != (whiteToMove ? g.white : g.black)) revert NotYourTurn();

        if (g.clockBase != 0) {
            // Charge the mover for the time since the previous move; a fallen flag can't move.
            uint256 elapsed = block.timestamp - g.lastMoveAt;
            uint32 left = whiteToMove ? g.whiteTime : g.blackTime;
            if (elapsed >= left) revert TimeExpired();
            left = uint32(left - elapsed) + g.clockIncrement;
            if (whiteToMove) g.whiteTime = left;
            else g.blackTime = left;
        }

        uint256 from = _move & 63;
        uint256 to = (_move >> 6) & 63;
        uint8 promotion = uint8(_move >> 12);
        if (from == to) revert InvalidMove();

        uint256 board = g.board;
        uint8 piece = _at(board, from);
        uint8 color = whiteToMove ? 0 : BLACK;
        if (piece == 0 || (piece & BLACK) != color) revert InvalidMove();
        uint8 kind = piece & 7;

        uint8 captured = _at(board, to);
        if (captured != 0) {
            if ((captured & BLACK) == color || (captured & 7) == KING) revert InvalidMove();
        }

        if (kind == PAWN) {
            if (captured == 0 && (from % 8) != (to % 8)) {
                // Diagonal pawn move onto an empty square: en passant.
                uint256 epSquare = (from / 8) * 8 + (to % 8);
                captured = _at(board, epSquare);
                if (captured != (PAWN | (BLACK - color))) revert InvalidMove();
                board = _set(board, epSquare, 0);
            }
            bool lastRank = whiteToMove ? to / 8 == 7 : to / 8 == 0;
            if (lastRank) {
                if (promotion < KNIGHT || promotion > QUEEN) revert InvalidMove();
                piece = promotion | color;
            } else if (promotion != 0) {
                revert InvalidMove();
            }
        } else if (promotion != 0) {
            revert InvalidMove();
        }

        if (kind == KING && (from % 8 == 4) && (to / 8 == from / 8) && (to % 8 == 6 || to % 8 == 2)) {
            // Castling: move the rook as well.
            uint256 rank = from / 8;
            (uint256 rookFrom, uint256 rookTo) = to % 8 == 6 ? (rank * 8 + 7, rank * 8 + 5) : (rank * 8, rank * 8 + 3);
            if (_at(board, rookFrom) != (ROOK | color) || captured != 0) revert InvalidMove();
            board = _set(_set(board, rookFrom, 0), rookTo, ROOK | color);
        }

        board = _set(_set(board, from, 0), to, piece);
        g.board = board;
        g.moves.push(_move);
        g.lastMoveAt = uint64(block.timestamp);
        if (g.drawOfferedBy != address(0) && g.drawOfferedBy != mover) {
            g.drawOfferedBy = address(0); // moving declines an outstanding draw offer
        }

        uint256 value;
        if (captured != 0) {
            value = _transferCaptureValue(g, whiteToMove, captured & 7);
        }
        emit MoveMade(_gameId, mover, _move, captured & 7, value);
    }

    // ------------------------------------------------------------------ endings

    function resign(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        if (msg.sender == g.white) _finish(_gameId, Result.BlackWins, false);
        else if (msg.sender == g.black) _finish(_gameId, Result.WhiteWins, false);
        else revert NotPlayer();
    }

    /// @notice The player who is NOT on move wins if their opponent stalls past the timeout.
    function claimTimeout(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        bool whiteToMove = g.moves.length % 2 == 0;
        address waiting = whiteToMove ? g.black : g.white;
        if (_playerFor(g, msg.sender) != waiting) revert NotPlayer();
        uint256 limit = g.clockBase != 0 ? (whiteToMove ? g.whiteTime : g.blackTime) : moveTimeout;
        if (block.timestamp < g.lastMoveAt + limit) revert TimeoutNotReached();
        _finish(_gameId, whiteToMove ? Result.BlackWins : Result.WhiteWins, false);
    }

    function offerDraw(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        address player = _playerFor(g, msg.sender);
        if (player == address(0)) revert NotPlayer();
        g.drawOfferedBy = player;
        emit DrawOffered(_gameId, player);
    }

    function acceptDraw(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        address player = _playerFor(g, msg.sender);
        if (player == address(0)) revert NotPlayer();
        if (g.drawOfferedBy == address(0) || g.drawOfferedBy == player) revert NoDrawOffer();
        _finish(_gameId, Result.Draw, false);
    }

    /// @notice Settles a game from outside it: the referee declaring checkmate or a rule draw, or
    ///         penalising an illegal move submitted by a modified client.
    /// @param _forfeit The loser keeps nothing, not even capture gains. Used for cheating, where the
    ///        "gains" may themselves come from illegal captures.
    function arbitrate(uint256 _gameId, Result _result, bool _forfeit) external nonReentrant {
        if (msg.sender != owner && msg.sender != arbiter) revert NotOwner();
        if (games[_gameId].status != Status.Active || _result == Result.None) revert WrongStatus();
        emit Arbitrated(_gameId, msg.sender, _result, _forfeit);
        _finish(_gameId, _result, _forfeit);
    }

    /// @notice Start handing the contract to a new owner (a fresh key or a multisig). Nothing changes
    ///         until that address calls `acceptOwnership`, so a mistyped address cannot lock it.
    function transferOwnership(address _newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        pendingOwner = _newOwner;
        emit OwnershipTransferStarted(owner, _newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function setArbiter(address _arbiter) external {
        if (msg.sender != owner) revert NotOwner();
        arbiter = _arbiter;
        emit ArbiterSet(_arbiter);
    }

    /// @notice Fees accrue instead of being pushed at settlement, so a failing transfer to the owner
    ///         can never block a game from finishing.
    function withdrawFees() external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        uint256 amount = accruedFees;
        accruedFees = 0;
        paymentToken.safeTransfer(owner, amount);
    }

    /// @notice Record who invited you. Once only, and not yourself.
    function setReferrer(address _referrer) external {
        if (referrerOf[msg.sender] != address(0)) revert ReferrerAlreadySet();
        if (_referrer == address(0) || _referrer == msg.sender) revert InvalidReferrer();
        referrerOf[msg.sender] = _referrer;
        emit ReferrerSet(msg.sender, _referrer);
    }

    function withdrawReferralEarnings() external nonReentrant {
        _checkNotFrozen(msg.sender);
        uint256 amount = referralEarnings[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        referralEarnings[msg.sender] = 0;
        paymentToken.safeTransfer(msg.sender, amount);
    }

    function withdraw(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Finished) revert WrongStatus();
        if (block.timestamp < withdrawableAt(_gameId, msg.sender)) revert PayoutHeld();
        uint256 amount;
        if (msg.sender == g.white && !g.whiteWithdrawn) {
            g.whiteWithdrawn = true;
            amount = g.whiteBalance;
        } else if (msg.sender == g.black && !g.blackWithdrawn) {
            g.blackWithdrawn = true;
            amount = g.blackBalance;
        }
        if (amount == 0) revert NothingToWithdraw();
        emit Withdrawn(_gameId, msg.sender, amount);
        paymentToken.safeTransfer(msg.sender, amount);
    }

    /// @notice Withdraw winnings that `penalize` moved to you after you had already withdrawn.
    function withdrawCredit() external nonReentrant {
        _checkNotFrozen(msg.sender);
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credits[msg.sender] = 0;
        emit CreditWithdrawn(msg.sender, amount);
        paymentToken.safeTransfer(msg.sender, amount);
    }

    // ------------------------------------------------------------------ trust layer

    function setRiskOperator(address _operator) external {
        if (msg.sender != owner) revert NotOwner();
        riskOperator = _operator;
        emit RiskOperatorSet(_operator);
    }

    function setTierPolicy(uint8 _tier, uint256 _maxStake, uint32 _payoutHold) external {
        if (msg.sender != owner) revert NotOwner();
        if (_tier >= TIER_COUNT) revert InvalidTier();
        if (_payoutHold > MAX_HOLD) revert InvalidHold();
        tierPolicy[_tier] = TierPolicy(_maxStake, _payoutHold);
        emit TierPolicySet(_tier, _maxStake, _payoutHold);
    }

    function setTrustTier(address[] calldata _players, uint8 _tier) external {
        _onlyRisk();
        if (_tier >= TIER_COUNT) revert InvalidTier();
        for (uint256 i = 0; i < _players.length; i++) {
            trustTier[_players[i]] = _tier;
            emit TrustTierSet(_players[i], _tier);
        }
    }

    /// @notice Pause an account while its games are reviewed: it cannot stake or withdraw until `_until`.
    ///         At most MAX_FREEZE from now, and not again until FREEZE_COOLDOWN after the last one ended,
    ///         so no account can be held indefinitely.
    function freeze(address _player, uint64 _until) external {
        _onlyRisk();
        if (_until <= block.timestamp || _until > block.timestamp + MAX_FREEZE) revert FreezeTooLong();
        uint64 last = frozenUntil[_player];
        if (last != 0 && block.timestamp < uint256(last) + FREEZE_COOLDOWN) revert FreezeCooldown();
        frozenUntil[_player] = _until;
        emit Frozen(_player, _until);
    }

    /// @notice End a freeze early (the cooldown still counts from now).
    function unfreeze(address _player) external {
        _onlyRisk();
        if (frozenUntil[_player] > block.timestamp) frozenUntil[_player] = uint64(block.timestamp);
        emit Unfrozen(_player);
    }

    /// @notice Fair-play ruling on a finished game: `_cheater` loses it. Their unwithdrawn payout from this
    ///         game goes to their opponent, and both records are corrected. Once per game. The fee and any
    ///         referral credit already taken stay as they were.
    function penalize(uint256 _gameId, address _cheater) external nonReentrant {
        _onlyRisk();
        Game storage g = games[_gameId];
        if (g.status != Status.Finished) revert WrongStatus();
        if (penalized[_gameId]) revert AlreadyPenalized();
        bool cheaterIsWhite = _cheater == g.white;
        if (!cheaterIsWhite && _cheater != g.black) revert NotPlayer();
        if (cheaterIsWhite ? g.whiteWithdrawn : g.blackWithdrawn) revert WrongStatus(); // the money has left
        penalized[_gameId] = true;

        address victim = cheaterIsWhite ? g.black : g.white;
        uint256 amount;
        if (cheaterIsWhite) {
            amount = g.whiteBalance;
            g.whiteBalance = 0;
            g.whiteWithdrawn = true;
        } else {
            amount = g.blackBalance;
            g.blackBalance = 0;
            g.blackWithdrawn = true;
        }
        if (cheaterIsWhite ? g.blackWithdrawn : g.whiteWithdrawn) credits[victim] += amount;
        else if (cheaterIsWhite) g.blackBalance += amount;
        else g.whiteBalance += amount;

        // Correct the records: the cheater lost this game, the opponent won it.
        Result old = g.result;
        Result corrected = cheaterIsWhite ? Result.BlackWins : Result.WhiteWins;
        if (old != corrected) {
            PlayerStats storage c = stats[_cheater];
            PlayerStats storage v = stats[victim];
            if (old == Result.Draw) {
                c.draws--;
                v.draws--;
            } else {
                c.wins--;
                v.losses--;
            }
            c.losses++;
            v.wins++;
            g.result = corrected;
        }
        stats[_cheater].net -= int256(amount);
        stats[victim].net += int256(amount);
        emit Penalized(_gameId, _cheater, victim, amount);
    }

    /// @notice When `_player` can withdraw from this game: after their tier's hold, and after any freeze.
    function withdrawableAt(uint256 _gameId, address _player) public view returns (uint256) {
        uint256 at = uint256(games[_gameId].endedAt) + tierPolicy[trustTier[_player]].payoutHold;
        uint256 frozen = frozenUntil[_player];
        return frozen > at ? frozen : at;
    }

    /// @notice An account's limits, for the app: tier, largest stake, payout hold, frozen until (0 = never).
    function limitsOf(address _player)
        external
        view
        returns (uint8 tier, uint256 maxStake, uint32 payoutHold, uint64 frozen)
    {
        tier = trustTier[_player];
        TierPolicy memory p = tierPolicy[tier];
        return (tier, p.maxStake, p.payoutHold, frozenUntil[_player]);
    }

    // ------------------------------------------------------------------ views

    function getGame(uint256 _gameId)
        external
        view
        returns (
            address white,
            address black,
            uint256 stake,
            uint256 whiteBalance,
            uint256 blackBalance,
            Status status,
            Result result,
            address drawOfferedBy,
            uint64 lastMoveAt,
            uint256 moveCount
        )
    {
        Game storage g = games[_gameId];
        return (
            g.white,
            g.black,
            g.stake,
            g.whiteBalance,
            g.blackBalance,
            g.status,
            g.result,
            g.drawOfferedBy,
            g.lastMoveAt,
            g.moves.length
        );
    }

    function getMoves(uint256 _gameId) external view returns (uint16[] memory) {
        return games[_gameId].moves;
    }

    function getBoard(uint256 _gameId) external view returns (uint256) {
        return games[_gameId].board;
    }

    function getGameKeys(uint256 _gameId) external view returns (address whiteKey, address blackKey) {
        Game storage g = games[_gameId];
        return (g.whiteKey, g.blackKey);
    }

    /// @return base 0 when the game has no clock. whiteTime/blackTime are as of that player's last turn start;
    ///         subtract (now - lastMoveAt) for the side to move.
    function getClock(uint256 _gameId) external view returns (uint32 base, uint32 increment, uint32 whiteTime, uint32 blackTime) {
        Game storage g = games[_gameId];
        return (g.clockBase, g.clockIncrement, g.whiteTime, g.blackTime);
    }

    function getWithdrawn(uint256 _gameId) external view returns (bool white, bool black) {
        Game storage g = games[_gameId];
        return (g.whiteWithdrawn, g.blackWithdrawn);
    }

    function pieceValue(uint256 _gameId, uint8 _pieceType) public view returns (uint256) {
        return (games[_gameId].stake * _weight(_pieceType)) / TOTAL_WEIGHT;
    }

    // ------------------------------------------------------------------ internals

    function _onlyRisk() internal view {
        if (msg.sender != owner && msg.sender != riskOperator) revert NotOwner();
    }

    function _checkNotFrozen(address _player) internal view {
        if (frozenUntil[_player] > block.timestamp) revert AccountFrozen();
    }

    function _checkCanStake(address _player, uint256 _stake) internal view {
        _checkNotFrozen(_player);
        if (_stake > tierPolicy[trustTier[_player]].maxStake) revert StakeAboveLimit();
    }

    /// @dev The player `_sender` acts for: themselves, or the player whose game key it is.
    function _playerFor(Game storage g, address _sender) internal view returns (address) {
        if (_sender == g.white || _sender == g.black) return _sender;
        if (_sender != address(0) && _sender == g.whiteKey) return g.white;
        if (_sender != address(0) && _sender == g.blackKey) return g.black;
        return address(0);
    }

    /// @dev Registers msg.sender's game key and forwards any attached MON to it for gas.
    function _setKey(Game storage g, uint256 _gameId, address _key) internal {
        if (_key == g.white || _key == g.black) _key = address(0); // a player's own address is not a key
        bool isWhite = msg.sender == g.white;
        // A key answers for one player only. Without this, White could register Black's key (White's is
        // looked up first) and Black's own moves would be refused.
        if (_key != address(0) && _key == (isWhite ? g.blackKey : g.whiteKey)) revert KeyTaken();
        if (isWhite) g.whiteKey = _key;
        else g.blackKey = _key;
        emit GameKeySet(_gameId, msg.sender, _key);
        if (msg.value > 0) {
            if (_key == address(0)) revert GasForwardFailed();
            (bool ok,) = _key.call{value: msg.value}("");
            if (!ok) revert GasForwardFailed();
        }
    }

    function _transferCaptureValue(Game storage g, bool whiteCaptured, uint8 kind) internal returns (uint256 value) {
        value = (g.stake * _weight(kind)) / TOTAL_WEIGHT;
        // Promoted pieces can push a side's total value above its stake, so cap at the balance.
        if (whiteCaptured) {
            if (value > g.blackBalance) value = g.blackBalance;
            g.blackBalance -= value;
            g.whiteBalance += value;
            g.whiteGains += value;
        } else {
            if (value > g.whiteBalance) value = g.whiteBalance;
            g.whiteBalance -= value;
            g.blackBalance += value;
            g.blackGains += value;
        }
    }

    function _finish(uint256 _gameId, Result _result, bool _forfeit) internal {
        Game storage g = games[_gameId];
        g.status = Status.Finished;
        g.result = _result;
        g.drawOfferedBy = address(0);
        g.endedAt = uint64(block.timestamp);

        uint256 whiteBal = g.whiteBalance;
        uint256 blackBal = g.blackBalance;
        uint256 total = whiteBal + blackBal;

        // Winner takes everything except what the loser earned through captures.
        if (_result == Result.WhiteWins) {
            uint256 keep = _forfeit ? 0 : (g.blackGains < blackBal ? g.blackGains : blackBal);
            whiteBal += blackBal - keep;
            blackBal = keep;
        } else if (_result == Result.BlackWins) {
            uint256 keep = _forfeit ? 0 : (g.whiteGains < whiteBal ? g.whiteGains : whiteBal);
            blackBal += whiteBal - keep;
            whiteBal = keep;
        }

        // A draw is free: nobody won, so nobody is charged.
        uint256 fee = _result == Result.Draw ? 0 : (total * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        uint256 whitePayout = (whiteBal * (total - fee)) / total;
        uint256 blackPayout = (blackBal * (total - fee)) / total;
        fee = total - whitePayout - blackPayout; // rounding dust goes to the fee, nothing gets stuck

        g.whiteBalance = whitePayout;
        g.blackBalance = blackPayout;
        emit GameEnded(_gameId, _result, whitePayout, blackPayout, fee);
        _record(g.white, _result == Result.Draw ? int8(0) : _result == Result.WhiteWins ? int8(1) : int8(-1), whitePayout, g.stake);
        _record(g.black, _result == Result.Draw ? int8(0) : _result == Result.BlackWins ? int8(1) : int8(-1), blackPayout, g.stake);
        // Whoever invited each player gets part of that player's half of the fee; the owner keeps the rest.
        uint256 credited = _creditReferral(_gameId, g.white, fee) + _creditReferral(_gameId, g.black, fee);
        accruedFees += fee - credited;
    }

    /// @dev Adds one finished game to a player's record. `outcome`: 1 won, 0 drew, -1 lost.
    function _record(address _player, int8 _outcome, uint256 _payout, uint256 _stake) internal {
        PlayerStats storage p = stats[_player];
        if (p.wins + p.draws + p.losses == 0) ranked.push(_player);
        if (_outcome > 0) p.wins++;
        else if (_outcome < 0) p.losses++;
        else p.draws++;
        p.net += int256(_payout) - int256(_stake);
    }

    function playerCount() external view returns (uint256) {
        return ranked.length;
    }

    /// @notice A page of players with their records, for the leaderboard.
    function getPlayers(uint256 _offset, uint256 _limit)
        external
        view
        returns (address[] memory players, PlayerStats[] memory records)
    {
        uint256 end = _offset + _limit > ranked.length ? ranked.length : _offset + _limit;
        uint256 size = end > _offset ? end - _offset : 0;
        players = new address[](size);
        records = new PlayerStats[](size);
        for (uint256 i = 0; i < size; i++) {
            players[i] = ranked[_offset + i];
            records[i] = stats[players[i]];
        }
    }

    function _creditReferral(uint256 _gameId, address _player, uint256 _fee) internal returns (uint256 amount) {
        address referrer = referrerOf[_player];
        if (referrer == address(0)) return 0;
        amount = ((_fee / 2) * REFERRAL_SHARE_BPS) / 10_000;
        if (amount == 0) return 0;
        referralEarnings[referrer] += amount;
        emit ReferralCredited(_gameId, referrer, amount);
    }

    function _weight(uint8 kind) internal pure returns (uint256) {
        if (kind == PAWN) return 1;
        if (kind == KNIGHT || kind == BISHOP) return 3;
        if (kind == ROOK) return 5;
        if (kind == QUEEN) return 9;
        return 0;
    }

    function _at(uint256 board, uint256 square) internal pure returns (uint8) {
        return uint8((board >> (square * 4)) & 0xF);
    }

    function _set(uint256 board, uint256 square, uint8 piece) internal pure returns (uint256) {
        uint256 shift = square * 4;
        return (board & ~(uint256(0xF) << shift)) | (uint256(piece) << shift);
    }

    function _buildInitialBoard() internal pure returns (uint256 board) {
        uint8[8] memory back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
        for (uint256 f = 0; f < 8; f++) {
            board = _set(board, f, back[f]);
            board = _set(board, 8 + f, PAWN);
            board = _set(board, 48 + f, PAWN | BLACK);
            board = _set(board, 56 + f, back[f] | BLACK);
        }
    }
}
