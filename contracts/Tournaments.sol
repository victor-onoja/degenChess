// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IChess {
    function gameCount() external view returns (uint256);
    function paymentToken() external view returns (address);
    /// @dev status 3 = Finished; result 1 = white wins, 2 = black wins, 3 = draw (DegenChess enums).
    function getGame(uint256 gameId)
        external
        view
        returns (
            address white,
            address black,
            uint256 stake,
            uint256 whiteBalance,
            uint256 blackBalance,
            uint8 status,
            uint8 result,
            address drawOfferedBy,
            uint64 lastMoveAt,
            uint256 moveCount
        );
}

/// @title Tournaments
/// @notice Round-robin leagues played as ordinary staked chess games: everyone plays everyone once.
///
/// The host chooses how it runs. With no entry fee it is only a register (players, stake, clock, the
/// first game id that counts) and holds no money. With an entry fee, every player pays it into a pot
/// when joining; finished games are recorded here by reading the game contract, and when every
/// pairing is recorded, or the deadline passes, the pot is paid out by points: all to the winner, or
/// 50/30/20 to the top three. Ties share the places they span. Nobody, not even the host, can award a
/// result or take a cut.
contract Tournaments is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Tournament {
        address host;
        string name;
        uint256 stake; // per player, per game
        uint32 clockBase;
        uint32 clockIncrement;
        uint64 createdAt;
        uint256 firstGameId; // set when it starts: games before this never count
        bool started;
        // Prize pool (all zero when entryFee is zero).
        uint256 entryFee;
        uint8 prizeMode; // 0 = winner takes all, 1 = top three 50/30/20
        uint32 duration; // seconds from the start to the deadline
        uint64 deadline;
        uint256 pot;
        bool settled;
        bool cancelled;
        uint16 recorded; // pairings with a recorded result
        address[] players;
    }

    uint256 public constant MAX_PLAYERS = 16;
    uint32 public constant MIN_DURATION = 1 hours;
    uint32 public constant MAX_DURATION = 30 days;
    uint8 internal constant FINISHED = 3;

    IChess public immutable chess;
    IERC20 public immutable token;
    Tournament[] internal tournaments;
    mapping(uint256 => mapping(address => bool)) public joined;
    /// @notice Points from recorded games: 2 for a win, 1 for a draw (shown halved).
    mapping(uint256 => mapping(address => uint16)) public points;
    mapping(uint256 => mapping(bytes32 => bool)) public pairRecorded;
    mapping(uint256 => mapping(address => uint256)) public prizeOf;

    event Created(uint256 indexed id, address indexed host, string name);
    event Joined(uint256 indexed id, address indexed player);
    event Left(uint256 indexed id, address indexed player);
    event Started(uint256 indexed id, uint256 firstGameId, uint64 deadline);
    event Cancelled(uint256 indexed id);
    event GameRecorded(uint256 indexed id, uint256 indexed gameId, address white, address black, uint8 result);
    event PrizePaid(uint256 indexed id, address indexed player, uint256 amount);

    error InvalidName();
    error InvalidStake();
    error InvalidPrize();
    error UnknownTournament();
    error AlreadyStarted();
    error NotStarted();
    error AlreadyJoined();
    error NotJoined();
    error Full();
    error NotHost();
    error HostCannotLeave();
    error NotEnoughPlayers();
    error Closed();
    error NoPrizePool();
    error TooEarly();
    error GameDoesNotCount();

    constructor(address _chess) {
        chess = IChess(_chess);
        token = IERC20(IChess(_chess).paymentToken());
    }

    /// @notice Open a tournament. The creator is its host and its first player.
    /// @param _entryFee 0 for no prize pool. Otherwise each player pays this when joining.
    /// @param _prizeMode 0 = winner takes all, 1 = top three split 50/30/20 (ignored without a pool).
    /// @param _duration seconds from the start until the pot can be paid on the results so far.
    function create(
        string calldata _name,
        uint256 _stake,
        uint32 _clockBase,
        uint32 _clockIncrement,
        uint256 _entryFee,
        uint8 _prizeMode,
        uint32 _duration
    ) external nonReentrant returns (uint256 id) {
        uint256 length = bytes(_name).length;
        if (length < 3 || length > 40) revert InvalidName();
        if (_stake == 0) revert InvalidStake();
        if (_prizeMode > 1) revert InvalidPrize();
        if (_entryFee > 0 && (_duration < MIN_DURATION || _duration > MAX_DURATION)) revert InvalidPrize();
        id = tournaments.length;
        Tournament storage t = tournaments.push();
        t.host = msg.sender;
        t.name = _name;
        t.stake = _stake;
        t.clockBase = _clockBase;
        t.clockIncrement = _clockIncrement;
        t.createdAt = uint64(block.timestamp);
        t.entryFee = _entryFee;
        t.prizeMode = _prizeMode;
        t.duration = _entryFee > 0 ? _duration : 0;
        emit Created(id, msg.sender, _name);
        _join(id, t);
    }

    function join(uint256 _id) external nonReentrant {
        _join(_id, _get(_id));
    }

    /// @notice Step out before it starts and get the entry fee back.
    function leave(uint256 _id) external nonReentrant {
        Tournament storage t = _get(_id);
        if (t.started) revert AlreadyStarted();
        if (t.cancelled) revert Closed();
        if (!joined[_id][msg.sender]) revert NotJoined();
        if (msg.sender == t.host) revert HostCannotLeave();
        joined[_id][msg.sender] = false;
        uint256 n = t.players.length;
        for (uint256 i = 0; i < n; i++) {
            if (t.players[i] == msg.sender) {
                t.players[i] = t.players[n - 1];
                t.players.pop();
                break;
            }
        }
        emit Left(_id, msg.sender);
        if (t.entryFee > 0) {
            t.pot -= t.entryFee;
            token.safeTransfer(msg.sender, t.entryFee);
        }
    }

    /// @notice The host calls it off before it starts; every entry fee goes back.
    function cancel(uint256 _id) external nonReentrant {
        Tournament storage t = _get(_id);
        if (msg.sender != t.host) revert NotHost();
        if (t.started) revert AlreadyStarted();
        if (t.cancelled) revert Closed();
        t.cancelled = true;
        t.pot = 0;
        emit Cancelled(_id);
        if (t.entryFee > 0) {
            for (uint256 i = 0; i < t.players.length; i++) token.safeTransfer(t.players[i], t.entryFee);
        }
    }

    /// @notice Close entries and begin. Only games created from now on count.
    function start(uint256 _id) external {
        Tournament storage t = _get(_id);
        if (msg.sender != t.host) revert NotHost();
        if (t.started) revert AlreadyStarted();
        if (t.cancelled) revert Closed();
        if (t.players.length < 2) revert NotEnoughPlayers();
        t.started = true;
        t.firstGameId = chess.gameCount();
        t.deadline = t.entryFee > 0 ? uint64(block.timestamp) + t.duration : 0;
        emit Started(_id, t.firstGameId, t.deadline);
    }

    /// @notice Record a finished game between two of the players. Anyone can call it: the result is
    ///         read from the game contract. The first game a pair plays is the one that counts.
    function record(uint256 _id, uint256 _gameId) external {
        if (!_record(_id, _get(_id), _gameId)) revert GameDoesNotCount();
    }

    /// @notice Pay out the pot. Records any of `_gameIds` not yet recorded first, then requires that
    ///         every pairing has a result or the deadline has passed.
    function settle(uint256 _id, uint256[] calldata _gameIds) external nonReentrant {
        Tournament storage t = _get(_id);
        if (t.entryFee == 0) revert NoPrizePool();
        if (!t.started) revert NotStarted();
        if (t.settled) revert Closed();
        for (uint256 i = 0; i < _gameIds.length; i++) _record(_id, t, _gameIds[i]);
        uint256 n = t.players.length;
        if (t.recorded < (n * (n - 1)) / 2 && block.timestamp < t.deadline) revert TooEarly();
        t.settled = true;
        _payOut(_id, t);
    }

    // ------------------------------------------------------------------ views

    function count() external view returns (uint256) {
        return tournaments.length;
    }

    function get(uint256 _id)
        external
        view
        returns (
            address host,
            string memory name,
            uint256 stake,
            uint32 clockBase,
            uint32 clockIncrement,
            uint64 createdAt,
            uint256 firstGameId,
            bool started,
            address[] memory players
        )
    {
        Tournament storage t = _get(_id);
        return (t.host, t.name, t.stake, t.clockBase, t.clockIncrement, t.createdAt, t.firstGameId, t.started, t.players);
    }

    /// @notice The prize side of a tournament, with each player's recorded points and prize
    ///         (in the order of `get().players`).
    function getPrize(uint256 _id)
        external
        view
        returns (
            uint256 entryFee,
            uint8 prizeMode,
            uint64 deadline,
            uint256 pot,
            bool settled,
            bool cancelled,
            uint16 recorded,
            uint16[] memory playerPoints,
            uint256[] memory prizes
        )
    {
        Tournament storage t = _get(_id);
        uint256 n = t.players.length;
        playerPoints = new uint16[](n);
        prizes = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            playerPoints[i] = points[_id][t.players[i]];
            prizes[i] = prizeOf[_id][t.players[i]];
        }
        return (t.entryFee, t.prizeMode, t.deadline, t.pot, t.settled, t.cancelled, t.recorded, playerPoints, prizes);
    }

    // ------------------------------------------------------------------ internals

    function _get(uint256 _id) internal view returns (Tournament storage) {
        if (_id >= tournaments.length) revert UnknownTournament();
        return tournaments[_id];
    }

    function _join(uint256 _id, Tournament storage t) internal {
        if (t.started) revert AlreadyStarted();
        if (t.cancelled) revert Closed();
        if (joined[_id][msg.sender]) revert AlreadyJoined();
        if (t.players.length >= MAX_PLAYERS) revert Full();
        joined[_id][msg.sender] = true;
        t.players.push(msg.sender);
        emit Joined(_id, msg.sender);
        if (t.entryFee > 0) {
            t.pot += t.entryFee;
            token.safeTransferFrom(msg.sender, address(this), t.entryFee);
        }
    }

    /// @dev Counts a game if it is a finished game between two different players of this tournament,
    ///      at its stake, created after it started, and their pairing has no result yet.
    function _record(uint256 _id, Tournament storage t, uint256 _gameId) internal returns (bool) {
        if (!t.started || t.settled || _gameId < t.firstGameId) return false;
        (address white, address black, uint256 stake,,, uint8 status, uint8 result,,,) = chess.getGame(_gameId);
        if (status != FINISHED || stake != t.stake || white == black) return false;
        if (!joined[_id][white] || !joined[_id][black]) return false;
        bytes32 pair = white < black ? keccak256(abi.encodePacked(white, black)) : keccak256(abi.encodePacked(black, white));
        if (pairRecorded[_id][pair]) return false;
        pairRecorded[_id][pair] = true;
        t.recorded++;
        if (result == 1) points[_id][white] += 2;
        else if (result == 2) points[_id][black] += 2;
        else {
            points[_id][white] += 1;
            points[_id][black] += 1;
        }
        emit GameRecorded(_id, _gameId, white, black, result);
        return true;
    }

    /// @dev Ranks the players by points and pays the pot by place. Players level on points share the
    ///      places they span; with fewer players than paid places the spare share goes to first.
    function _payOut(uint256 _id, Tournament storage t) internal {
        uint256 n = t.players.length;
        address[] memory order = new address[](n);
        uint256[] memory score = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            order[i] = t.players[i];
            score[i] = points[_id][order[i]];
        }
        // Insertion sort, highest first: at most 16 players.
        for (uint256 i = 1; i < n; i++) {
            (address who, uint256 s) = (order[i], score[i]);
            uint256 j = i;
            while (j > 0 && score[j - 1] < s) {
                (order[j], score[j]) = (order[j - 1], score[j - 1]);
                j--;
            }
            (order[j], score[j]) = (who, s);
        }

        uint256[] memory share = new uint256[](n); // basis points of the pot, by place
        if (t.prizeMode == 0) {
            share[0] = 10_000;
        } else {
            uint16[3] memory table = [uint16(5000), 3000, 2000];
            for (uint256 i = 0; i < 3; i++) {
                if (i < n) share[i] = table[i];
                else share[0] += table[i];
            }
        }

        uint256 pot = t.pot;
        uint256 paid = 0;
        t.pot = 0;
        for (uint256 i = 0; i < n;) {
            uint256 j = i;
            uint256 groupShare = 0;
            while (j < n && score[j] == score[i]) {
                groupShare += share[j];
                j++;
            }
            uint256 each = (pot * groupShare) / 10_000 / (j - i);
            for (uint256 k = i; k < j && each > 0; k++) {
                prizeOf[_id][order[k]] = each;
                paid += each;
                emit PrizePaid(_id, order[k], each);
                token.safeTransfer(order[k], each);
            }
            i = j;
        }
        // Rounding dust goes to the top-ranked player, so the contract keeps nothing.
        if (pot > paid) {
            prizeOf[_id][order[0]] += pot - paid;
            token.safeTransfer(order[0], pot - paid);
        }
    }
}
