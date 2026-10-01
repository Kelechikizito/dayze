# 04 — ApprovalPolicy

## Goal
Per Payer: a k-of-n approver set, plus an **encrypted** monthly threshold **per token**. Computes `needsApproval = FHE.gt(monthly, threshold[token])` and records approvals (architecture §6.2, §7.1, §7.2).

Thresholds are per token because streams can pay in any allowlisted wrapper (02), and "10,000" means very different things in cUSDC and cETH. Comparing across tokens would need a price oracle, which is out of scope for v0.1.

## Interface
```solidity
/**
 * @title IApprovalPolicy
 * @author Kaykay
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
}
```

## Key CoFHE snippets

**Storing the threshold**
```solidity
euint64 t = FHE.asEuint64(threshold, proof);
FHE.allowThis(t);
FHE.allowSender(t); // payer can view their own policy
s_thresholds[msg.sender][token] = t; // mapping(address payer => mapping(address token => euint64))
s_hasThreshold[msg.sender][token] = true;
```

**Evaluating a salary it doesn't own.** Payroll hands the monthly amount over with `FHE.shareEuint64(monthly, address(policy))`, and policy receives it:
```solidity
/// @notice Checks whether a monthly amount needs approval under the payer's policy
/// @dev Must be called directly by payroll: `receiveEuint64Param` only works when the sharer is the caller
/// @param payer The payer whose policy applies
/// @param token The confidential wrapper the stream pays in
/// @param sharedMonthly The monthly amount, shared by payroll
/// @return r Encrypted `monthly > threshold[token]`; false with no policy, true with a policy but no threshold for `token`
function evaluate(address payer, address token, sharedEuint64 sharedMonthly) external onlyPayroll returns (ebool r) {
    euint64 monthly = FHE.receiveEuint64Param(sharedMonthly);
    if (!s_policies[payer].exists) {
        r = FHE.asEbool(false);
    } else if (!s_hasThreshold[payer][token]) {
        r = FHE.asEbool(true); // fail closed: a token without a threshold always needs approval
    } else {
        r = FHE.gt(monthly, s_thresholds[payer][token]);
    }
    FHE.allowThis(r);
    FHE.allow(r, msg.sender); // payroll needs it
}
```
**Fail closed on missing thresholds.** If a payer with a policy streams in a token they never set a threshold for, require approval. Otherwise a payer could dodge their own policy just by paying in a different token.

`receiveEuint64Param` only works when the sharer is the **direct caller**, which is why this must be `onlyPayroll` and called straight from `DayzePayroll`. Set the payroll address once with a one-shot `setPayroll` (owner-only, then locked) or pass it into the constructor with CREATE address prediction.

**Approvals** are plaintext: who approved is public, the amount isn't. Use `mapping(address payer => mapping(uint256 streamId => mapping(address => bool))) approved` plus a counter. Only the payer's approvers can approve, once each.

## Tests: `test/unit/ApprovalPolicyTest.t.sol`
The interface goes in `src/interfaces/IApprovalPolicy.sol`. Use a tiny `PayrollHarness` (in `test/mocks/PayrollHarness.sol`) that shares a value and calls `evaluate`, so you don't need the real payroll yet.

1. `setThreshold(cusdc, …)` stores the threshold; the payer can view it (`expectPlaintext`)
2. `evaluate` with monthly 12,000 vs threshold 10,000 → `true`; 8,000 → `false`; exactly 10,000 → `false` (it's `gt`)
3. No policy → always `false`
4. Policy set, threshold only for cUSDC → `evaluate` for cETH returns `true` (fail closed)
5. Thresholds are independent: 1 cETH vs a cETH threshold of 2 → `false`, even though the cUSDC threshold is 10,000
6. `evaluate` from a non-payroll caller reverts
7. Approve: non-approver reverts, double approve reverts, count increments
8. `required > approvers.length` or `required == 0` reverts in `setPolicy`

## ✅ Checkpoint
```bash
forge test --match-contract ApprovalPolicyTest -vv
```
- [ ] All tests pass
- [ ] The threshold never appears in any event or plaintext storage

## Pitfalls
- Don't emit the threshold, or anything derived from it, in events.
- Re-setting a threshold creates a new handle. Re-`allowThis` it.
- `ThresholdSet` reveals *which* tokens a payer has thresholds for, never the values. That's fine.

## Commit
`feat: add ApprovalPolicy with per-token encrypted thresholds and k-of-n approvals`
