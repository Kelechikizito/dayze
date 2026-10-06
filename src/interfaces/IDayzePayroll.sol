// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

interface IDayzePayroll {
    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers the caller as a payer with a display name
    /// @param name Org name shown on credentials
    function createOrg(string calldata name) external;

    /// @notice Allowlists a confidential wrapper. Owner only.
    /// @param token The wrapper to accept
    function addToken(IFHERC20 token) external;

    /// @notice Removes a wrapper from the allowlist; existing streams keep withdrawing. Owner only.
    /// @param token The wrapper to remove
    function removeToken(IFHERC20 token) external;

    /// @notice Pulls an encrypted amount of `token` from the caller into their vault for that token
    /// @dev Caller must first call `token.setOperator(payroll, until)`
    /// @param token An allowlisted confidential wrapper
    /// @param amount Encrypted amount to fund, in the token's 6-decimal units
    /// @param proof Proof that verifies `amount`
    function fundVault(IFHERC20 token, externalEuint64 amount, bytes calldata proof) external;

    /// @notice Starts an encrypted salary stream from the caller to `payee`, paid in `token`
    /// @param payee The worker being paid
    /// @param token An allowlisted confidential wrapper
    /// @param monthly Encrypted monthly salary, in the token's 6-decimal units
    /// @param proof Proof that verifies `monthly`
    /// @return id The new stream's id
    function createStream(address payee, IFHERC20 token, externalEuint64 monthly, bytes calldata proof)
        external
        returns (uint256 id);

    /// @notice Withdraws up to the accrued, unwithdrawn amount; pays 0 instead of reverting on over-withdrawal
    /// @param id The stream to withdraw from
    /// @param amount Encrypted amount requested
    /// @param proof Proof that verifies `amount`
    function withdraw(uint256 id, externalEuint64 amount, bytes calldata proof) external;

    /// @notice Cancels a stream and freezes accrual. Payer only.
    /// @param id The stream to cancel
    function cancelStream(uint256 id) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns a stream by id
    /// @param id The stream to look up
    /// @return The stream
    function getStream(uint256 id) external view returns (Stream memory);

    /// @notice Returns the ids of all streams a payer created
    /// @param payer The payer to look up
    /// @return The stream ids
    function streamsOfPayer(address payer) external view returns (uint256[] memory);

    /// @notice Returns the ids of all streams paying a payee
    /// @param payee The payee to look up
    /// @return The stream ids
    function streamsOfPayee(address payee) external view returns (uint256[] memory);

    /// @notice Returns the handle to a payer's encrypted vault balance for one token
    /// @param payer The payer to look up
    /// @param token The wrapper to look up
    /// @return The vault handle
    function vaultOf(address payer, IFHERC20 token) external view returns (euint64);
}
