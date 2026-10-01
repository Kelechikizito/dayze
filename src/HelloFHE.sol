// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {FHE, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title HelloFHE
 * @author Kelechi Kizito Ugwu
 * @notice Throwaway smoke test that stores an encrypted number and can double it.
 * @dev Proves the CoFHE pipeline and ACL work under Forge mocks. Every FHE operation
 *      returns a new handle, so every new handle needs fresh `allowThis` and `allowSender` calls.
 */
contract HelloFHE {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Handle to the encrypted stored value
    euint64 private s_stored;

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Stores an encrypted value supplied by the caller
    /// @param value Encrypted input handle, bound to this contract
    /// @param proof Proof that verifies `value`
    function set(externalEuint64 value, bytes calldata proof) external {
        s_stored = FHE.asEuint64(value, proof);
        FHE.allowThis(s_stored); // contract can reuse it in later txs
        FHE.allowSender(s_stored); // caller can unseal it
    }

    /// @notice Doubles the stored encrypted value
    function double() external {
        s_stored = FHE.add(s_stored, s_stored);
        FHE.allowThis(s_stored); // EVERY new handle needs fresh allows
        FHE.allowSender(s_stored);
    }

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the handle to the encrypted stored value
    /// @return The `euint64` handle; only allowed addresses can unseal it
    function getStored() external view returns (euint64) {
        return s_stored;
    }
}
