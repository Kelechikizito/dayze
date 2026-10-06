// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IApprovalPolicy} from "src/interfaces/IApprovalPolicy.sol";
import {IAuditRegistry} from "src/interfaces/IAuditRegistry.sol";
import {IFHERC20} from "src/interfaces/IFHERC20.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";

contract DayzePayroll is Ownable, IDayzePayroll {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/
    error DayzePayroll__ZeroAddress();

    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Lifecycle of a stream (AwaitingPolicy and Pending are used from 06)
    enum Status {
        None,
        AwaitingPolicy,
        Pending,
        Active,
        Cancelled
    }

    /// @notice A payer's organisation
    struct Org {
        string name; // shown on credentials
        bool exists;
    }

    /// @notice One salary stream from a payer to a payee, paid in one confidential token
    struct Stream {
        address payer;
        address payee;
        IFHERC20 token; // allowlisted wrapper (02); public, the amount isn't
        euint64 monthly; // encrypted monthly salary, in the token's 6-decimal units
        euint64 withdrawn;
        uint64 startTime; // set when it becomes Active
        Status status;
        ebool needsApproval; // used in 06
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    IApprovalPolicy public immutable I_APPROVAL_POLICY;
    IAuditRegistry public immutable I_AUDIT_REGISTRY;
    /// @notice Length of one pay period in seconds: 30 days in prod, e.g. 600 (10 min) for the demo
    uint64 public immutable PERIOD;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    /// @notice Makes the deployer the owner, who sets payroll once
    constructor(address approvalPolicy, address auditRegistry, uint64 period) Ownable(msg.sender) {
        if (approvalPolicy == address(0)) revert DayzePayroll__ZeroAddress();
        if (auditRegistry == address(0)) revert DayzePayroll__ZeroAddress();
        I_APPROVAL_POLICY = IApprovalPolicy(approvalPolicy);
        I_AUDIT_REGISTRY = IAuditRegistry(auditRegistry);
        PERIOD = period;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/
}
