// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {FHE, euint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IAuditRegistry} from "src/interfaces/IAuditRegistry.sol";
import {AuditAccess} from "src/libraries/AuditAccess.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title AuditHarness
 * @author Kelechi Kizito Ugwu
 * @notice Test-only stand-in for payroll: creates handles and shares them with a payer's auditors.
 */
contract AuditHarness {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The registry the harness reads auditors from
    IAuditRegistry private immutable i_registry;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the registry to read auditors from
    /// @param registry The audit registry
    constructor(IAuditRegistry registry) {
        i_registry = registry;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates an encrypted handle and allows it to `payer`'s current auditors
    /// @param payer The payer whose auditors get access
    /// @param value Plaintext value to encrypt
    /// @return h The new handle
    function createHandle(address payer, uint64 value) external returns (euint64 h) {
        h = FHE.asEuint64(value);
        FHE.allowThis(h);
        AuditAccess.allowAuditors(i_registry, payer, h);
    }
}
