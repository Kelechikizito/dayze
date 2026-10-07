// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ebool, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IFHERC20} from "fhenix-confidential-contracts/interfaces/IFHERC20.sol";

/**
 * @title IDayzePayroll
 * @author Kelechi Kizito Ugwu
 * @notice Encrypted salary streams paid from per-payer, per-token confidential vaults.
 * @dev Salaries, vaults and withdrawals are encrypted. Who pays whom, in which token, is public.
 */
interface IDayzePayroll {
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
        uint64 endTime; // set on cancel; accrual stops here
        Status status;
        ebool needsApproval; // used in 06
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when the owner allowlists a wrapper
    /// @param token The wrapper added
    event TokenAdded(IFHERC20 indexed token);

    /// @notice Emitted when the owner removes a wrapper from the allowlist
    /// @param token The wrapper removed
    event TokenRemoved(IFHERC20 indexed token);

    /// @notice Emitted when a payer registers an org
    /// @param payer The payer
    /// @param name The org name
    event OrgCreated(address indexed payer, string name);

    /// @notice Emitted when a payer funds a vault. Carries no amount.
    /// @param payer The payer
    /// @param token The wrapper funded
    event VaultFunded(address indexed payer, IFHERC20 indexed token);

    /// @notice Emitted when a stream is created
    /// @param id The stream id
    /// @param payer The payer
    /// @param payee The payee
    /// @param token The wrapper the stream pays in
    /// @param monthlyHandle Handle to the encrypted monthly salary
    event StreamCreated(
        uint256 indexed id, address indexed payer, address indexed payee, IFHERC20 token, bytes32 monthlyHandle
    );

    /// @notice Emitted when a stream starts accruing
    /// @param id The stream id
    /// @param startTime When accrual starts
    event StreamActivated(uint256 indexed id, uint64 startTime);

    /// @notice Emitted on every withdraw, even one that pays 0
    /// @param id The stream id
    /// @param withdrawnHandle Handle to the new encrypted total withdrawn
    event Withdrawn(uint256 indexed id, bytes32 withdrawnHandle);

    /// @notice Emitted when a payer cancels a stream
    /// @param id The stream id
    event StreamCancelled(uint256 indexed id);

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

    /// @notice Returns a payer's org
    /// @param payer The payer to look up
    /// @return The org; `exists` is false if none
    function orgOf(address payer) external view returns (Org memory);

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
