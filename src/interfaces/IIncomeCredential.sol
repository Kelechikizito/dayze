// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title IIncomeCredential
 * @author Kelechi Kizito Ugwu
 * @notice One-bit income proofs: "this payee earns >= X of token T per month", readable by one verifier.
 * @dev The threshold is public (the verifier asked for it). The salary and the result bit are not.
 */
interface IIncomeCredential {
    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice A one-bit income proof issued by a payee to a single verifier
    struct Credential {
        address payee;
        address payer;
        address verifier;
        address token; // the stream's confidential wrapper; the threshold is in its units
        uint256 streamId;
        uint64 threshold; // plaintext, 6-decimal units: the verifier asked for it, so it's not secret
        uint64 issuedAt;
        uint64 expiresAt;
        uint64 streamActiveSince;
        bool revoked;
        bool payeeIsHuman; // HumanRegistry.isHuman(payee) at issue time (07a)
        ebool ok; // encrypted `monthly >= threshold`; only the verifier can decrypt it
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a payee issues a credential. Never carries the result bit.
    /// @param id The credential id
    /// @param payee The payee who issued it
    /// @param verifier The only address that can read the result
    /// @param token The stream's confidential wrapper
    /// @param threshold The monthly amount asked about
    /// @param expiresAt When the credential stops being valid
    event CredentialIssued(
        uint256 indexed id,
        address indexed payee,
        address indexed verifier,
        address token,
        uint64 threshold,
        uint64 expiresAt
    );

    /// @notice Emitted when a payee revokes a credential
    /// @param id The credential id
    event CredentialRevoked(uint256 indexed id);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Issues an "earns >= threshold per month" credential to one verifier
    /// @param streamId The caller's active stream
    /// @param verifier The only address allowed to read the result bit
    /// @param threshold Plaintext monthly amount the verifier asked about, in the stream token's 6-decimal units
    /// @param expiresAt Timestamp after which the credential is no longer valid
    /// @return id The new credential's id
    function issue(uint256 streamId, address verifier, uint64 threshold, uint64 expiresAt) external returns (uint256 id);

    /// @notice Revokes a credential. Payee only.
    /// @param id The credential to revoke
    function revoke(uint256 id) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Checks whether a credential is unrevoked, unexpired, and its stream is still Active
    /// @param id The credential to check
    /// @return True if the credential can still be relied on
    function isValid(uint256 id) external view returns (bool);

    /// @notice Returns a credential by id
    /// @param id The credential to look up
    /// @return The credential
    function get(uint256 id) external view returns (Credential memory);

    /// @notice Returns the ids of credentials a payee issued
    /// @param payee The payee to look up
    /// @return The credential ids
    function credentialsOf(address payee) external view returns (uint256[] memory);

    /// @notice Returns the ids of credentials issued to a verifier
    /// @param verifier The verifier to look up
    /// @return The credential ids
    function credentialsFor(address verifier) external view returns (uint256[] memory);
}
