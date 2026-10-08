// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IAuditRegistry} from "src/interfaces/IAuditRegistry.sol";

/**
 * @title AuditRegistry
 * @author Kelechi Kizito Ugwu
 * @notice Each payer keeps a small set of auditors who may read their payroll handles.
 * @dev Only answers "who are the auditors?". Payroll owns the handles, so payroll calls `FHE.allow`.
 *      Removing an auditor only stops access to handles created afterwards.
 */
contract AuditRegistry is IAuditRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when the auditor is the zero address
    error AuditRegistry__ZeroAddress();

    /// @notice Thrown when the auditor is already in the payer's set
    error AuditRegistry__AlreadyAuditor();

    /// @notice Thrown when the auditor is not in the payer's set
    error AuditRegistry__NotAuditor();

    /// @notice Thrown when the payer already has `MAX_AUDITORS` auditors
    error AuditRegistry__TooManyAuditors();

    /// @notice Thrown when a payer tries to add themselves as an auditor
    error AuditRegistry__SelfAuditor();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Most auditors a payer can have. Payroll loops over the set on every handle update.
    uint256 public constant MAX_AUDITORS = 5;

    /// @notice Each payer's auditor set
    mapping(address payer => EnumerableSet.AddressSet auditors) private s_auditors;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys an empty registry. Every payer manages their own set, so there is no owner.
    constructor() {}

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAuditRegistry
    function addAuditor(address auditor) external {
        _addAuditor(msg.sender, auditor);
    }

    /// @inheritdoc IAuditRegistry
    function removeAuditor(address auditor) external {
        _removeAuditor(msg.sender, auditor);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Adds `auditor` to `payer`'s set
    /// @param payer The payer whose set changes
    /// @param auditor The address to add
    function _addAuditor(address payer, address auditor) internal {
        if (auditor == address(0)) revert AuditRegistry__ZeroAddress();
        if (payer == address(0)) revert AuditRegistry__ZeroAddress();
        if (auditor == payer) revert AuditRegistry__SelfAuditor();
        EnumerableSet.AddressSet storage auditors = s_auditors[payer];
        if (auditors.length() >= MAX_AUDITORS) revert AuditRegistry__TooManyAuditors();
        if (!auditors.add(auditor)) revert AuditRegistry__AlreadyAuditor();
        emit AuditorAdded(payer, auditor);
    }

    /// @notice Removes `auditor` from `payer`'s set
    /// @param payer The payer whose set changes
    /// @param auditor The address to remove
    function _removeAuditor(address payer, address auditor) internal {
        if (payer == address(0)) revert AuditRegistry__ZeroAddress();
        if (auditor == address(0)) revert AuditRegistry__ZeroAddress();
        if (!s_auditors[payer].remove(auditor)) revert AuditRegistry__NotAuditor();
        emit AuditorRemoved(payer, auditor);
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAuditRegistry
    function auditorsOf(address payer) external view returns (address[] memory) {
        return s_auditors[payer].values();
    }

    /// @inheritdoc IAuditRegistry
    function isAuditor(address payer, address who) external view returns (bool) {
        return s_auditors[payer].contains(who);
    }

    /// @inheritdoc IAuditRegistry
    function auditorCount(address payer) external view returns (uint256) {
        return s_auditors[payer].length();
    }
}
