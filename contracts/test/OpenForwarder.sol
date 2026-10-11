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

    /// @dev The same entry point as Chainlink's forwarder: a raw report is a 109-byte header (whose
    ///      last 64 bytes are the workflow metadata) followed by the workflow's payload.
    function report(address receiver, bytes calldata rawReport, bytes calldata, bytes[] calldata) external {
        IReportReceiver(receiver).onReport(rawReport[45:109], rawReport[109:]);
    }
}
