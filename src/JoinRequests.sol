// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";
import {IJoinRequests} from "src/interfaces/IJoinRequests.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title JoinRequests
 * @author Kelechi Kizito Ugwu
 * @notice A worker asks an employer to pay them; the employer sees the request in their console.
 * @dev Standalone: it reads DayzePayroll to check the employer has an org, and nothing else, so it can be
 *      added to a live deployment without redeploying payroll. Each employer's pending list is capped so a
 *      flood of requests can't grow it without bound; the employer can dismiss to make room.
 */
contract JoinRequests is IJoinRequests {
    using EnumerableSet for EnumerableSet.AddressSet;

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when the payroll address is zero
    error JoinRequests__ZeroAddress();

    /// @notice Thrown when the address asked has no org in DayzePayroll
    error JoinRequests__NotAnEmployer();

    /// @notice Thrown when a wallet asks itself
    error JoinRequests__SelfRequest();

    /// @notice Thrown when the request is already pending
    error JoinRequests__AlreadyRequested();

    /// @notice Thrown when there's no such pending request
    error JoinRequests__NoRequest();

    /// @notice Thrown when an employer already has `MAX_PENDING` requests waiting
    error JoinRequests__TooManyRequests();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Most requests one employer can have waiting
    uint256 public constant MAX_PENDING = 200;

    /// @notice Payroll, read to check the employer has an org
    IDayzePayroll public immutable I_PAYROLL;

    /// @notice Workers waiting on each employer
    mapping(address employer => EnumerableSet.AddressSet employees) private s_pending;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the payroll contract whose orgs can be asked
    /// @param payroll DayzePayroll
    constructor(address payroll) {
        if (payroll == address(0)) revert JoinRequests__ZeroAddress();
        I_PAYROLL = IDayzePayroll(payroll);
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IJoinRequests
    function requestToJoin(address employer) external {
        if (employer == msg.sender) revert JoinRequests__SelfRequest();
        if (!I_PAYROLL.orgOf(employer).exists) revert JoinRequests__NotAnEmployer();
        EnumerableSet.AddressSet storage pending = s_pending[employer];
        if (pending.length() >= MAX_PENDING) revert JoinRequests__TooManyRequests();
        if (!pending.add(msg.sender)) revert JoinRequests__AlreadyRequested();
        emit JoinRequested(employer, msg.sender);
    }

    /// @inheritdoc IJoinRequests
    function cancelRequest(address employer) external {
        if (!s_pending[employer].remove(msg.sender)) revert JoinRequests__NoRequest();
        emit JoinRequestCancelled(employer, msg.sender);
    }

    /// @inheritdoc IJoinRequests
    function dismiss(address employee) external {
        if (!s_pending[msg.sender].remove(employee)) revert JoinRequests__NoRequest();
        emit JoinRequestDismissed(msg.sender, employee);
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IJoinRequests
    function pendingFor(address employer) external view returns (address[] memory) {
        return s_pending[employer].values();
    }

    /// @inheritdoc IJoinRequests
    function hasRequested(address employer, address employee) external view returns (bool) {
        return s_pending[employer].contains(employee);
    }
}
