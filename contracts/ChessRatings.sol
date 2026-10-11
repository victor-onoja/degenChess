// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver} from "./ChessReferee.sol";

/// @title ChessRatings
/// @notice A player's chess.com rating, brought on-chain by a Chainlink CRE workflow.
///
/// A player asks to link a chess.com username. The workflow fetches that account's public profile
/// and ratings from chess.com, checks the player controls it (a short code derived from their
/// address must appear in the profile), and reports back through the Chainlink forwarder. Opponents
/// then see a rating that the player could not have typed in themselves.
///
/// This contract holds no money and is not consulted by the game contract: a rating is information
/// for choosing an opponent, not a rule.
contract ChessRatings is IReceiver {
    struct Rating {
        string handle; // chess.com username, lower case
        uint16 rapid; // 0 = unrated in that time control
        uint16 blitz;
        uint16 bullet;
        uint64 updatedAt;
    }

    /// @dev Outcomes the workflow can report.
    uint8 public constant VERIFIED = 1;
    uint8 public constant CODE_MISSING = 2; // the profile does not show this player's code
    uint8 public constant NO_ACCOUNT = 3; // chess.com has no such username
    /// @dev Set here, not by the workflow: another player already holds that username.
    uint8 public constant HANDLE_TAKEN = 4;

    address public owner;
    address public pendingOwner;
    /// @notice The Chainlink forwarder allowed to deliver reports (the mock forwarder during simulation).
    address public forwarder;
    /// @notice If set, only reports from workflows owned by this address are accepted.
    address public expectedWorkflowOwner;
    /// @notice Accounts allowed to originate a report while `expectedWorkflowOwner` is unset
    ///         (see ChessReferee for why `tx.origin` is checked behind the mock forwarder).
    mapping(address => bool) public reporters;

    mapping(address => Rating) internal ratings;
    /// @notice The username a player has asked to link and is waiting to have checked.
    mapping(address => string) public pending;
    /// @notice Why a player's last request did not go through (0 when it did, or none was made).
    mapping(address => uint8) public lastFailure;
    /// @notice Which player holds a chess.com username: one account, one player.
    mapping(bytes32 => address) public holderOf;

    event LinkRequested(address indexed player, string handle);
    event Linked(address indexed player, string handle, uint16 rapid, uint16 blitz, uint16 bullet);
    event LinkFailed(address indexed player, string handle, uint8 reason);
    event Unlinked(address indexed player, string handle);
    event ForwarderSet(address indexed forwarder);
    event ExpectedWorkflowOwnerSet(address indexed workflowOwner);
    event ReporterSet(address indexed reporter, bool allowed);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error NotForwarder();
    error WrongWorkflowOwner();
    error NotReporter();
    error InvalidHandle();

    constructor(address _forwarder) {
        forwarder = _forwarder;
        owner = msg.sender;
    }

    /// @notice Ask for a chess.com username to be checked and linked. Asking again replaces the request
    ///         (and is how a rating is refreshed).
    /// @param _handle the username in lower case: 3 to 25 of a-z, 0-9, "_" and "-".
    function requestLink(string calldata _handle) external {
        bytes calldata h = bytes(_handle);
        if (h.length < 3 || h.length > 25) revert InvalidHandle();
        for (uint256 i = 0; i < h.length; i++) {
            bytes1 c = h[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f || c == 0x2d;
            if (!ok) revert InvalidHandle();
        }
        pending[msg.sender] = _handle;
        lastFailure[msg.sender] = 0;
        emit LinkRequested(msg.sender, _handle);
    }

    /// @notice Remove your rating and free the username.
    function unlink() external {
        Rating storage r = ratings[msg.sender];
        if (bytes(r.handle).length != 0) {
            delete holderOf[keccak256(bytes(r.handle))];
            emit Unlinked(msg.sender, r.handle);
        }
        delete ratings[msg.sender];
        delete pending[msg.sender];
        lastFailure[msg.sender] = 0;
    }

    /// @param report abi.encode(address player, string handle, uint16 rapid, uint16 blitz, uint16 bullet, uint8 outcome)
    /// @dev Never reverts on what the report says, only on who delivered it: a stale or unlucky
    ///      report is recorded as a failure the player can see, not a stuck transaction.
    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        if (expectedWorkflowOwner != address(0)) {
            if (metadata.length < 62 || address(bytes20(metadata[42:62])) != expectedWorkflowOwner) {
                revert WrongWorkflowOwner();
            }
        } else if (!reporters[tx.origin]) {
            revert NotReporter();
        }
        (address player, string memory handle, uint16 rapid, uint16 blitz, uint16 bullet, uint8 outcome) =
            abi.decode(report, (address, string, uint16, uint16, uint16, uint8));
        bytes32 key = keccak256(bytes(handle));
        // Only the request the player currently has open: an old report for a replaced request is ignored.
        if (key != keccak256(bytes(pending[player]))) return;

        if (outcome == VERIFIED && holderOf[key] != address(0) && holderOf[key] != player) outcome = HANDLE_TAKEN;
        if (outcome != VERIFIED) {
            lastFailure[player] = outcome;
            emit LinkFailed(player, handle, outcome);
            return;
        }
        bytes memory old = bytes(ratings[player].handle);
        if (old.length != 0) delete holderOf[keccak256(old)];
        holderOf[key] = player;
        ratings[player] = Rating(handle, rapid, blitz, bullet, uint64(block.timestamp));
        delete pending[player];
        lastFailure[player] = 0;
        emit Linked(player, handle, rapid, blitz, bullet);
    }

    function ratingOf(address _player) external view returns (Rating memory) {
        return ratings[_player];
    }

    /// @notice Ratings for several players at once (an empty handle means none linked).
    function getRatings(address[] calldata _players) external view returns (Rating[] memory list) {
        list = new Rating[](_players.length);
        for (uint256 i = 0; i < _players.length; i++) list[i] = ratings[_players[i]];
    }

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

    function setForwarder(address _forwarder) external {
        if (msg.sender != owner) revert NotOwner();
        forwarder = _forwarder;
        emit ForwarderSet(_forwarder);
    }

    function setExpectedWorkflowOwner(address _workflowOwner) external {
        if (msg.sender != owner) revert NotOwner();
        expectedWorkflowOwner = _workflowOwner;
        emit ExpectedWorkflowOwnerSet(_workflowOwner);
    }

    function setReporter(address _reporter, bool _allowed) external {
        if (msg.sender != owner) revert NotOwner();
        reporters[_reporter] = _allowed;
        emit ReporterSet(_reporter, _allowed);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == 0x01ffc9a7;
    }
}
