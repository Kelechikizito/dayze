// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title IJoinRequests
 * @author Kelechi Kizito Ugwu
 * @notice Lets a worker ask an employer to pay them, so nobody has to send a wallet address by hand.
 * @dev Public by design: it shows that a wallet asked an org for pay, which the stream would show anyway.
 *      It holds no amounts. A request is the start of a relationship; the salary stream is the relationship.
 */
interface IJoinRequests {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a worker asks an employer to pay them
    /// @param employer The employer asked
    /// @param employee The worker asking
    event JoinRequested(address indexed employer, address indexed employee);

    /// @notice Emitted when a worker withdraws their request
    /// @param employer The employer that was asked
    /// @param employee The worker who withdrew
    event JoinRequestCancelled(address indexed employer, address indexed employee);

    /// @notice Emitted when an employer clears a request, after paying them or to decline
    /// @param employer The employer clearing it
    /// @param employee The worker whose request was cleared
    event JoinRequestDismissed(address indexed employer, address indexed employee);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Asks `employer` to start paying the caller
    /// @param employer An address with an org in DayzePayroll
    function requestToJoin(address employer) external;

    /// @notice Withdraws the caller's request to `employer`
    /// @param employer The employer that was asked
    function cancelRequest(address employer) external;

    /// @notice Clears a request to the caller (the employer), after starting a stream or to decline
    /// @param employee The worker whose request to clear
    function dismiss(address employee) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the workers waiting on an employer
    /// @param employer The employer to look up
    /// @return The workers' addresses, oldest first until one is removed
    function pendingFor(address employer) external view returns (address[] memory);

    /// @notice Checks whether a worker has a pending request to an employer
    /// @param employer The employer
    /// @param employee The worker
    /// @return True if the request is pending
    function hasRequested(address employer, address employee) external view returns (bool);
}
