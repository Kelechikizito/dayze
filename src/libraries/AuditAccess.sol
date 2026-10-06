// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {FHE, euint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IAuditRegistry} from "src/interfaces/IAuditRegistry.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title AuditAccess
 * @author Kelechi Kizito Ugwu
 * @notice Shares a payroll handle with every current auditor of a payer.
 * @dev Internal, so it is inlined: `FHE.allow` runs in the calling contract, which must own the handle.
 */
library AuditAccess {
    /// @notice Allows every current auditor of `payer` to read handle `h`
    /// @dev Call it after every new or updated payroll handle
    /// @param registry The registry that lists the payer's auditors
    /// @param payer The payer whose auditors get access
    /// @param h The handle to share
    function allowAuditors(IAuditRegistry registry, address payer, euint64 h) internal {
        address[] memory auditors = registry.auditorsOf(payer);
        for (uint256 i; i < auditors.length; ++i) {
            FHE.allow(h, auditors[i]);
        }
    }
}
