# 06 — Payroll ↔ ApprovalPolicy (async decrypt)

## Goal
Streams above the hidden threshold wait for k approvers. Only the `needsApproval` bit is ever decrypted (architecture §7.2, §8). This is your first real **async decrypt** flow. §8 notes that similar projects skip replay tests. We don't.

## State machine
```
createStream ─► AwaitingPolicy ──resolvePolicy(false)──► Active
                     │
                     └──resolvePolicy(true)──► Pending ──k approvals──► Active
Active / Pending ──cancel──► Cancelled
```
`withdraw` only works in `Active`. `startTime` is set **when it becomes Active**, not at creation. So no salary accrues while waiting for approval.

## Flow

**1. In `createStream`** (replaces the "straight to Active" stub from 05):
```solidity
ebool na = policy.evaluate(msg.sender, address(token), FHE.shareEuint64(monthlyAmt, address(policy)));
FHE.allowThis(na);
FHE.allowPublic(na); // anyone may decrypt this ONE bit
s.needsApproval = na;
s.status = Status.AwaitingPolicy;
emit PolicyCheckRequested(id, ebool.unwrap(na));
```

**2. Off-chain** (employer's browser, checkpoint 10). Decrypting needs no key. Only sending the tx does.
```ts
const { decryptedValue, signature } = await cofhe.decryptForTx(needsApprovalHandle).withoutACP().execute();
```
Check the result field names in `@cofhe/sdk` `core/decrypt/decryptForTxBuilder.ts`. In Foundry: `client.decryptForTx_withoutACP(handle)`.

**3. On-chain `resolvePolicy`**:
```solidity
/// @notice Applies the decrypted `needsApproval` bit to a stream
/// @dev Permissionless: the decrypt signature proves the result. Pending if true, Active if false.
/// @param id The stream to resolve
/// @param needsApproval The decrypted bit
/// @param sig Decrypt signature over `(handle, needsApproval)`
function resolvePolicy(uint256 id, bool needsApproval, bytes calldata sig) external {
    Stream storage s = s_streams[id];
    if (s.status != Status.AwaitingPolicy) revert DayzePayroll__AlreadyResolved(); // replay guard #1
    if (!FHE.verifyDecryptResult(s.needsApproval, needsApproval, sig)) {
        revert DayzePayroll__BadDecryptProof(); // binds to THIS handle
    }
    if (needsApproval) {
        s.status = Status.Pending;
        emit StreamPending(id);
    } else {
        _activate(s, id);
    }
}
```
Anyone can call it. The signature proves the result.

**4. Approvals**: `approve` lives on `ApprovalPolicy` (04). Add `activateApproved(id)` on payroll:
```solidity
/// @notice Activates a pending stream once it has enough approvals
/// @param id The stream to activate
function activateApproved(uint256 id) external {
    Stream storage s = s_streams[id];
    if (s.status != Status.Pending) revert DayzePayroll__NotPending();
    if (policy.approvalCount(s.payer, id) < policy.required(s.payer)) revert DayzePayroll__NotEnoughApprovals();
    _activate(s, id);
}
```
Or let the policy call payroll on the k-th approval. Pick one. The pull model above is easier to test.

## Replay and freshness: what can go wrong
| Attack | Guard |
|---|---|
| Resubmit the same `(id, result, sig)` | Status must be `AwaitingPolicy` |
| Use stream A's signature for stream B | `verifyDecryptResult` takes **B's** stored handle |
| Flip the bool with the same sig | Signature covers `(handle, value)`, so verify fails |
| Payer raises a salary after approval to skip the policy | Any salary change makes a new handle and goes back to `AwaitingPolicy` (or v0.1 just bans edits: cancel and recreate) |
| Approvals reused on a new stream id | Approvals are keyed by `(payer, streamId)`. Ids are never reused. |

## Tests
`test/unit/PayrollApprovalsTest.t.sol`:
1. Salary under threshold → resolve(false) → `Active`. `startTime == block.timestamp` at resolve.
2. Over threshold → resolve(true) → `Pending`. Withdraw reverts. 1 of 2 approvals → activate reverts. 2 of 2 → `Active`.
3. No accrual while `Pending`: warp 1 day before activation. Accrual counts only from activation.

`test/unit/DecryptReplayTest.t.sol` (the suite from §8):
1. Resolve twice → second reverts `DayzePayroll__AlreadyResolved`
2. Stream A's `(value, sig)` on stream B → `DayzePayroll__BadDecryptProof`
3. Correct sig, flipped bool → `DayzePayroll__BadDecryptProof`
4. Garbage sig → reverts
5. Resolve on a cancelled stream → reverts

## ✅ Checkpoint
```bash
forge test --match-contract "PayrollApprovals|DecryptReplay|DayzePayroll" -vv
```
- [ ] All pass. The 05 tests still pass (update them to call `resolvePolicy` through a helper in `DayzeTestBase`).
- [ ] You can say what the one bit leaks: "this salary is above or below a hidden threshold" (§8)

## Pitfalls
- `FHE.allowPublic` is permanent for that handle. Only call it on the bit, never on `monthly`.
- On a live network, decryption takes seconds. The UI needs a "checking policy…" state (checkpoint 10).

## Commit
`feat: gate streams on encrypted approval policy with replay-safe decrypt resolution`
