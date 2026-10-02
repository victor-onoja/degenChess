// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReportReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @dev Test stand-in for Chainlink's mock forwarder: relays any report from anyone, checking nothing.
contract OpenForwarder {
    function relay(address receiver, bytes calldata metadata, bytes calldata report) external {
        IReportReceiver(receiver).onReport(metadata, report);
    }
}
