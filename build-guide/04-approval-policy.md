# 04 — ApprovalPolicy

## Goal
Per Payer: an **encrypted** monthly threshold and a k-of-n approver set. Computes `needsApproval = FHE.gt(monthly, threshold)` and records approvals (architecture §6.2, §7.1, §7.2).

## Interface
```solidity
/**
 * @title IApprovalPolicy
 * @author Kaykay
 * @notice Per-payer encrypted monthly threshold plus a k-of-n approver set.
 * @dev `evaluate` returns `monthly > threshold` as an encrypted bit. Who approved is public;
 *      the threshold and amounts never are.
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

    /// @notice Emitted when an approver signs off on a pending stream
    /// @param payer The payer that owns the stream
    /// @param streamId The stream being approved
    /// @param approver The approver who signed off
    /// @param count Approvals so far, including this one
    event Approved(address indexed payer, uint256 indexed streamId, address indexed approver, uint8 count);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the caller's encrypted threshold and approver set
    /// @param threshold Encrypted monthly threshold, encrypted in the browser
    /// @param proof Proof that verifies `threshold`
    /// @param approvers Addresses allowed to approve
    /// @param required Approvals needed; must be > 0 and <= approvers.length
    function setPolicy(externalEuint64 threshold, bytes calldata proof, address[] calldata approvers, uint8 required)
        external;

    /// @notice Checks whether a monthly amount needs approval. Only callable by DayzePayroll.
    /// @param payer The payer whose policy applies
    /// @param monthly The monthly amount, shared by payroll
    /// @return needsApproval Encrypted `monthly > threshold`, allowed to the caller
    function evaluate(address payer, sharedEuint64 monthly) external returns (ebool needsApproval);

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
}
```

## Key CoFHE snippets

**Storing the threshold**
```solidity
euint64 t = FHE.asEuint64(threshold, proof);
FHE.allowThis(t);
FHE.allowSender(t); // payer can view their own policy
s_policies[msg.sender].threshold = t;
```

**Evaluating a salary it doesn't own.** Payroll hands the monthly amount over with `FHE.shareEuint64(monthly, address(policy))`, and policy receives it:
```solidity
/// @notice Checks whether a monthly amount needs approval under the payer's policy
/// @dev Must be called directly by payroll: `receiveEuint64Param` only works when the sharer is the caller
/// @param payer The payer whose policy applies
/// @param sharedMonthly The monthly amount, shared by payroll
/// @return r Encrypted `monthly > threshold`; always false if the payer has no policy
function evaluate(address payer, sharedEuint64 sharedMonthly) external onlyPayroll returns (ebool r) {
    euint64 monthly = FHE.receiveEuint64Param(sharedMonthly);
    Policy storage p = s_policies[payer];
    if (!p.exists) {
        r = FHE.asEbool(false);
    } else {
        r = FHE.gt(monthly, p.threshold);
    }
    FHE.allowThis(r);
    FHE.allow(r, msg.sender); // payroll needs it
}
```
`receiveEuint64Param` only works when the sharer is the **direct caller**, which is why this must be `onlyPayroll` and called straight from `DayzePayroll`. Set the payroll address once with a one-shot `setPayroll` (owner-only, then locked) or pass it into the constructor with CREATE address prediction.

**Approvals** are plaintext: who approved is public, the amount isn't. Use `mapping(address payer => mapping(uint256 streamId => mapping(address => bool))) approved` plus a counter. Only the payer's approvers can approve, once each.

## Tests: `test/ApprovalPolicy.t.sol`
Use a tiny `PayrollHarness` that shares a value and calls `evaluate`, so you don't need the real payroll yet.

1. `setPolicy` stores the threshold; the payer can view it (`expectPlaintext`)
2. `evaluate` with monthly 12,000 vs threshold 10,000 → `true`; 8,000 → `false`; exactly 10,000 → `false` (it's `gt`)
3. No policy → always `false`
4. `evaluate` from a non-payroll caller reverts
5. Approve: non-approver reverts, double approve reverts, count increments
6. `required > approvers.length` or `required == 0` reverts in `setPolicy`

## ✅ Checkpoint
```bash
forge test --match-contract ApprovalPolicyTest -vv
```
- [ ] All tests pass
- [ ] The threshold never appears in any event or plaintext storage

## Pitfalls
- Don't emit the threshold, or anything derived from it, in events.
- Re-setting a policy creates a new threshold handle. Re-`allowThis` it.

## Commit
`feat: add ApprovalPolicy with encrypted threshold and k-of-n approvals`
