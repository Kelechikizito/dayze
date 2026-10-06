// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title IAuditRegistry
 * @author Kelechi Kizito Ugwu
 * @notice Lets each payer choose which auditors may read their payroll handles.
 * @dev A plain registry: it only answers "who are the auditors?". The contract that owns a
 *      handle must call `FHE.allow` itself, so payroll does the allowing.
 */
interface IAuditRegistry {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a payer adds an auditor
    /// @param payer The payer whose auditor set changed
    /// @param auditor The auditor that was added
    event AuditorAdded(address indexed payer, address indexed auditor);

    /// @notice Emitted when a payer removes an auditor
    /// @param payer The payer whose auditor set changed
    /// @param auditor The auditor that was removed
    event AuditorRemoved(address indexed payer, address indexed auditor);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Adds an auditor to the caller's (payer's) auditor set
    /// @param auditor The address to add
    function addAuditor(address auditor) external;

    /// @notice Removes an auditor from the caller's (payer's) auditor set
    /// @dev Removal only affects future handles; access already granted stays (see §8)
    /// @param auditor The address to remove
    function removeAuditor(address auditor) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the payer's current auditors
    /// @param payer The payer to look up
    /// @return The auditor addresses
    function auditorsOf(address payer) external view returns (address[] memory);

    /// @notice Checks whether an address is one of the payer's auditors
    /// @param payer The payer to look up
    /// @param who The address to check
    /// @return True if `who` is in the payer's auditor set
    function isAuditor(address payer, address who) external view returns (bool);

    /// @notice Returns how many auditors the payer has
    /// @param payer The payer to look up
    /// @return The size of the payer's auditor set
    function auditorCount(address payer) external view returns (uint256);
}
