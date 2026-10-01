// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice Chainlink CRE consumer interface: the KeystoneForwarder delivers workflow reports here.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

interface IDegenChess {
    /// @param result 1 = white wins, 2 = black wins, 3 = draw (DegenChess.Result)
    function arbitrate(uint256 gameId, uint8 result, bool forfeit) external;
}

/// @title ChessReferee
/// @notice Receives verdicts from the DegenChess referee workflow (Chainlink CRE) and settles games.
///
/// The workflow fires on every MoveMade event, replays the whole game with a chess engine and, when
/// the game is over or a move was illegal, sends a signed report through the Chainlink forwarder.
/// This contract is registered as DegenChess's arbiter and turns that report into `arbitrate`.
contract ChessReferee is IReceiver {
    /// @dev Why a verdict was reached. Informational; mirrored in the workflow.
    uint8 public constant REASON_ILLEGAL_MOVE = 1;
    uint8 public constant REASON_CHECKMATE = 2;
    uint8 public constant REASON_STALEMATE = 3;
    uint8 public constant REASON_INSUFFICIENT_MATERIAL = 4;
    uint8 public constant REASON_THREEFOLD_REPETITION = 5;
    uint8 public constant REASON_FIFTY_MOVES = 6;

    IDegenChess public immutable chess;
    address public owner;
    /// @notice The Chainlink forwarder allowed to deliver reports (the mock forwarder during simulation).
    address public forwarder;
    /// @notice If set, only reports from workflows owned by this address are accepted. Leave unset
    ///         for simulation, where the mock forwarder does not supply workflow metadata.
    address public expectedWorkflowOwner;

    event Verdict(uint256 indexed gameId, uint8 result, bool forfeit, uint256 ply, uint8 reason);
    event ForwarderSet(address indexed forwarder);
    event ExpectedWorkflowOwnerSet(address indexed workflowOwner);

    error NotOwner();
    error NotForwarder();
    error WrongWorkflowOwner();

    constructor(address _chess, address _forwarder) {
        chess = IDegenChess(_chess);
        forwarder = _forwarder;
        owner = msg.sender;
    }

    /// @param report abi.encode(uint256 gameId, uint8 result, bool forfeit, uint256 ply, uint8 reason)
    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        if (expectedWorkflowOwner != address(0)) {
            // metadata = abi.encodePacked(bytes32 workflowId, bytes10 workflowName, address workflowOwner[, bytes2 reportId])
            if (metadata.length < 62 || address(bytes20(metadata[42:62])) != expectedWorkflowOwner) {
                revert WrongWorkflowOwner();
            }
        }
        (uint256 gameId, uint8 result, bool forfeit, uint256 ply, uint8 reason) =
            abi.decode(report, (uint256, uint8, bool, uint256, uint8));
        // Reverts unless the game is still active, so a verdict can never be applied twice.
        chess.arbitrate(gameId, result, forfeit);
        emit Verdict(gameId, result, forfeit, ply, reason);
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

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
