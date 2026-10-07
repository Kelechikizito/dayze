// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title IHumanRegistry
 * @author Kelechi Kizito Ugwu
 * @notice Stores one bit per wallet: "a unique human, verified with World ID, controls this wallet".
 * @dev World ID has no onchain verifier on Arbitrum. A backend checks the proof with World's API,
 *      then signs an EIP-712 attestation that the worker submits here.
 */
interface IHumanRegistry {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a wallet registers as a verified human
    /// @param account The wallet
    event HumanRegistered(address indexed account);

    /// @notice Emitted when the owner sets or rotates the attester key
    /// @param attester The new attester address
    event AttesterUpdated(address indexed attester);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Marks the caller as a verified human
    /// @dev The attestation must name msg.sender, so a stolen signature is useless to anyone else
    /// @param nullifier The World ID nullifier for the "dayze-register" action
    /// @param deadline Timestamp after which the attestation is no longer accepted
    /// @param signature The attester's EIP-712 signature over (msg.sender, nullifier, deadline)
    function register(uint256 nullifier, uint64 deadline, bytes calldata signature) external;

    /// @notice Rotates the attester key. Owner only.
    /// @param attester The new attester address
    function setAttester(address attester) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Checks whether a wallet has a verified World ID
    /// @param account The wallet to check
    /// @return True if the wallet registered with a valid attestation
    function isHuman(address account) external view returns (bool);

    /// @notice Checks whether a World ID nullifier was already used
    /// @param nullifier The nullifier to check
    /// @return True if a wallet registered with it
    function isNullifierUsed(uint256 nullifier) external view returns (bool);

    /// @notice Returns the backend key that signs attestations
    /// @return The attester address
    function attester() external view returns (address);
}
