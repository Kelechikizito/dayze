# 07 — IncomeCredential

## Goal
A worker issues "earns ≥ $X/month" to one verifier, with an expiry. The verifier learns one bit (architecture §6.2, §7.4). This is the feature that differentiates Dayze from the other projects, so make it solid.

## Data model
```solidity
/// @notice A one-bit income proof issued by a payee to a single verifier
struct Credential {
    address payee;
    address payer;
    address verifier;
    uint64 threshold; // plaintext: the verifier asked for it, so it's not secret
    uint64 issuedAt;
    uint64 expiresAt;
    uint64 streamActiveSince;
    bool revoked;
    ebool ok;
}
```
Also expose, for the verifier page: org name (from payroll), `streamActiveSince`, and optionally "months funded". Architecture §8 lists this as the fake-employer mitigation. Months funded needs vault ÷ monthly, which is encrypted, so **skip it in v0.1** or compute another encrypted bit (`vault >= monthly * 3`) and allow it to the verifier too.

## Interface
```solidity
/*//////////////////////////////////////////////////////////////
                       EXTERNAL FUNCTIONS
//////////////////////////////////////////////////////////////*/

/// @notice Issues an "earns >= threshold per month" credential to one verifier
/// @param streamId The caller's active stream
/// @param verifier The only address allowed to read the result bit
/// @param threshold Plaintext monthly amount the verifier asked about
/// @param expiresAt Timestamp after which the credential is no longer valid
/// @return id The new credential's id
function issue(uint256 streamId, address verifier, uint64 threshold, uint64 expiresAt) external returns (uint256 id);

/// @notice Revokes a credential. Payee only.
/// @param id The credential to revoke
function revoke(uint256 id) external;

/*//////////////////////////////////////////////////////////////
                     VIEW & PURE FUNCTIONS
//////////////////////////////////////////////////////////////*/

/// @notice Checks whether a credential is unrevoked and unexpired
/// @param id The credential to check
/// @return True if `!revoked && now < expiresAt`
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
```
Events: `CredentialIssued(id, payee, verifier, threshold, expiresAt)`, `CredentialRevoked(id)`. The threshold is fine to emit; the result bit is not.

## Key CoFHE snippet
`IncomeCredential` must be **allowed on the stream's rate handle** to compute on it. In `DayzePayroll`, when a stream is created, also `FHE.allow(rate, address(credential))` (payroll takes the credential address as a constructor arg or one-shot setter).

```solidity
/// @notice Issues an "earns >= threshold per month" credential to one verifier
/// @dev Expiry ends validity but can't make a verifier forget a bit it already decrypted.
///      The result is as of issuance. It proves what a contract pays, not who the employer is.
/// @param streamId The caller's active stream
/// @param verifier The only address allowed to read the result bit
/// @param threshold Plaintext monthly amount the verifier asked about
/// @param expiresAt Timestamp after which the credential is no longer valid
/// @return id The new credential's id
function issue(uint256 streamId, address verifier, uint64 threshold, uint64 expiresAt) external returns (uint256 id) {
    IDayzePayroll.Stream memory s = payroll.getStream(streamId);
    if (s.payee != msg.sender) revert IncomeCredential__NotPayee();
    if (s.status != IDayzePayroll.Status.Active) revert IncomeCredential__StreamNotActive();
    if (expiresAt <= block.timestamp) revert IncomeCredential__BadExpiry();

    euint64 monthly = FHE.mul(s.ratePerSecond, FHE.asEuint64(PERIOD)); // same PERIOD as payroll
    ebool ok = FHE.gte(monthly, FHE.asEuint64(threshold));
    FHE.allowThis(ok);
    FHE.allow(ok, verifier); // ONLY the verifier, not the payee
    // ...store, emit
}
```
Why not `allowSender`? The payee already knows their salary, and granting them the bit changes nothing. But keeping `ok` verifier-only makes the access list easy to explain on stage.

Note: `rate × PERIOD` can be slightly below the entered monthly salary because of the division remainder in 05. A worker earning exactly $3,000 checked against $3,000 could fail. Either tell users to set thresholds slightly lower, or store the original `monthly` handle on the stream and compare against that (cleaner, and recommended).

## Honest-limits reminders (put these in NatSpec)
- Expiry ends **validity**. It can't make a verifier forget a bit they already decrypted (§8).
- The credential is "as of issuance". A later salary cut doesn't update it; short expiries keep it honest.
- It proves what a contract pays, not who the employer is.

## Tests: `test/unit/IncomeCredentialTest.t.sol`
1. Rate 3,000/mo, threshold 2,500 → `ok == true`; threshold 4,000 → `false`
2. `ok` allowed to the verifier and **not** to bob or the payer
3. Non-payee issue reverts; issuing on a `Pending`/`Cancelled` stream reverts
4. `isValid` true before expiry; `vm.warp(expiresAt)` → false
5. Revoke → `isValid` false; non-payee revoke reverts
6. A stream cancelled after issuance: `isValid` stays true (as-of-issuance). Decide if you want to also check stream status in `isValid`; either is defensible, just document it.
7. Demo timing: with `PERIOD = 600`, issue with a 2-minute expiry and warp past it

## ✅ Checkpoint
```bash
forge test -vv          # full suite green
forge coverage --report summary
```
- [ ] Full suite passes
- [ ] Coverage ≥ 80% lines on `src/` (FHE-heavy code can undercount; eyeball the misses)
- [ ] Run `/solidity-auditor` on `src/` and fix anything real before deploying

## Commit
`feat: add IncomeCredential — per-verifier, expiring, one-bit income proofs`
