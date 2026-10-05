// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGameCounter {
    function gameCount() external view returns (uint256);
}

/// @title Tournaments
/// @notice A register of round-robin leagues played as ordinary staked chess games. It holds no
///         money and settles nothing: it only records who is in a tournament, the stake and clock
///         its games use, and the first game id that counts. Standings are read from the games
///         themselves, so nobody (not even the host) can award a result.
contract Tournaments {
    struct Tournament {
        address host;
        string name;
        uint256 stake; // per player, per game
        uint32 clockBase;
        uint32 clockIncrement;
        uint64 createdAt;
        uint256 firstGameId; // set when it starts: games before this never count
        bool started;
        address[] players;
    }

    uint256 public constant MAX_PLAYERS = 16;

    IGameCounter public immutable chess;
    Tournament[] internal tournaments;
    mapping(uint256 => mapping(address => bool)) public joined;

    event Created(uint256 indexed id, address indexed host, string name);
    event Joined(uint256 indexed id, address indexed player);
    event Started(uint256 indexed id, uint256 firstGameId);

    error InvalidName();
    error InvalidStake();
    error UnknownTournament();
    error AlreadyStarted();
    error AlreadyJoined();
    error Full();
    error NotHost();
    error NotEnoughPlayers();

    constructor(address _chess) {
        chess = IGameCounter(_chess);
    }

    /// @notice Open a tournament. The creator is its host and its first player.
    function create(string calldata _name, uint256 _stake, uint32 _clockBase, uint32 _clockIncrement)
        external
        returns (uint256 id)
    {
        uint256 length = bytes(_name).length;
        if (length < 3 || length > 40) revert InvalidName();
        if (_stake == 0) revert InvalidStake();
        id = tournaments.length;
        Tournament storage t = tournaments.push();
        t.host = msg.sender;
        t.name = _name;
        t.stake = _stake;
        t.clockBase = _clockBase;
        t.clockIncrement = _clockIncrement;
        t.createdAt = uint64(block.timestamp);
        emit Created(id, msg.sender, _name);
        _join(id, t);
    }

    function join(uint256 _id) external {
        if (_id >= tournaments.length) revert UnknownTournament();
        _join(_id, tournaments[_id]);
    }

    /// @notice Close entries and begin. Only games created from now on count.
    function start(uint256 _id) external {
        if (_id >= tournaments.length) revert UnknownTournament();
        Tournament storage t = tournaments[_id];
        if (msg.sender != t.host) revert NotHost();
        if (t.started) revert AlreadyStarted();
        if (t.players.length < 2) revert NotEnoughPlayers();
        t.started = true;
        t.firstGameId = chess.gameCount();
        emit Started(_id, t.firstGameId);
    }

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
        if (_id >= tournaments.length) revert UnknownTournament();
        Tournament storage t = tournaments[_id];
        return (t.host, t.name, t.stake, t.clockBase, t.clockIncrement, t.createdAt, t.firstGameId, t.started, t.players);
    }

    function _join(uint256 _id, Tournament storage t) internal {
        if (t.started) revert AlreadyStarted();
        if (joined[_id][msg.sender]) revert AlreadyJoined();
        if (t.players.length >= MAX_PLAYERS) revert Full();
        joined[_id][msg.sender] = true;
        t.players.push(msg.sender);
        emit Joined(_id, msg.sender);
    }
}
