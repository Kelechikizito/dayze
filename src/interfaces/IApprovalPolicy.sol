// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ebool, euint64, externalEuint64, sharedEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title IApprovalPolicy
 * @author Kelechi Kizito Ugwu
 * @notice Per-payer k-of-n approver set plus an encrypted monthly threshold per token.
 * @dev `evaluate` returns `monthly > threshold[token]` as an encrypted bit. Who approved and which
 *      tokens have thresholds are public; the thresholds and amounts never are.
 */
interface IApprovalPolicy {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a payer sets or replaces their policy
    /// @param payer The payer that owns the policy
    /// @param required Number of approvals needed
    /// @param approverCount Number of approvers in the set
    event PolicySet(address indexed payer, uint8 required, uint256 approverCount);

    /// @notice Emitted when a payer sets or replaces their threshold for one token
    /// @param payer The payer that owns the policy
    /// @param token The confidential wrapper the threshold applies to
    event ThresholdSet(address indexed payer, address indexed token);

    /// @notice Emitted when an approver signs off on a pending stream
    /// @param payer The payer that owns the stream
    /// @param streamId The stream being approved
    /// @param approver The approver who signed off
    /// @param count Approvals so far, including this one
    event Approved(address indexed payer, uint256 indexed streamId, address indexed approver, uint8 count);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the caller's approver set
    /// @param approvers Addresses allowed to approve
    /// @param required Approvals needed; must be > 0 and <= approvers.length
    function setPolicy(address[] calldata approvers, uint8 required) external;

    /// @notice Sets the caller's encrypted monthly threshold for one token
    /// @param token The confidential wrapper the threshold applies to
    /// @param threshold Encrypted monthly threshold in the token's 6-decimal units, encrypted in the browser
    /// @param proof Proof that verifies `threshold`
    function setThreshold(address token, externalEuint64 threshold, bytes calldata proof) external;

    /// @notice Checks whether a monthly amount needs approval. Only callable by DayzePayroll.
    /// @param payer The payer whose policy applies
    /// @param token The confidential wrapper the stream pays in
    /// @param monthly The monthly amount, shared by payroll
    /// @return needsApproval Encrypted `monthly > threshold[token]`, allowed to the caller
    function evaluate(address payer, address token, sharedEuint64 monthly) external returns (ebool needsApproval);

    /// @notice Records the caller's approval of a pending stream
    /// @param payer The payer that owns the stream
    /// @param streamId The stream to approve
    function approve(address payer, uint256 streamId) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns how many approvals a stream has
    /// @param payer The payer that owns the stream
    /// @param streamId The stream to look up
    /// @return The approval count
    function approvalCount(address payer, uint256 streamId) external view returns (uint8);

    /// @notice Returns how many approvals the payer's policy requires
    /// @param payer The payer to look up
    /// @return The required approval count
    function required(address payer) external view returns (uint8);

    /// @notice Checks whether the payer has set a policy
    /// @param payer The payer to look up
    /// @return True if a policy exists
    function hasPolicy(address payer) external view returns (bool);

    /// @notice Checks whether the payer has set a threshold for a token
    /// @param payer The payer to look up
    /// @param token The confidential wrapper to look up
    /// @return True if a threshold exists
    function hasThreshold(address payer, address token) external view returns (bool);

    /// @notice Returns the payer's current approvers
    /// @param payer The payer to look up
    /// @return The approver addresses
    function approversOf(address payer) external view returns (address[] memory);

    /// @notice Checks whether an address approves for the payer under the current policy
    /// @param payer The payer to look up
    /// @param who The address to check
    /// @return True if `who` is a current approver
    function isApprover(address payer, address who) external view returns (bool);

    /// @notice Checks whether an approver already approved a stream under the current policy
    /// @param payer The payer that owns the stream
    /// @param streamId The stream to look up
    /// @param who The approver to check
    /// @return True if `who` approved `streamId`
    function hasApproved(address payer, uint256 streamId, address who) external view returns (bool);

    /// @notice Returns the handle to the payer's encrypted threshold for a token
    /// @dev Only the payer (and this contract) can unseal it
    /// @param payer The payer to look up
    /// @param token The confidential wrapper to look up
    /// @return The threshold handle; zero if never set
    function thresholdOf(address payer, address token) external view returns (euint64);

    /// @notice Returns the payroll contract allowed to call `evaluate`
    /// @return The payroll address; zero until set
    function payroll() external view returns (address);
}
