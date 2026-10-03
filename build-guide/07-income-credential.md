# 07 — IncomeCredential

## Goal
A worker issues "earns ≥ X of token T per month" to one verifier, with an expiry. The verifier learns one bit (architecture §6.2, §7.4). This feature sets Dayze apart. Make it solid.

## Data model
```solidity
/// @notice A one-bit income proof issued by a payee to a single verifier
struct Credential {
    address payee;
    address payer;
    address verifier;
    address token; // the stream's confidential wrapper; the threshold is in its units
    uint64 threshold; // plaintext, 6-decimal units: the verifier asked for it, so it's not secret
    uint64 issuedAt;
    uint64 expiresAt;
    uint64 streamActiveSince;
    bool revoked;
    bool payeeIsHuman; // HumanRegistry.isHuman(payee) at issue time (07a)
    ebool ok;
}
```
The constructor takes `IHumanRegistry` next to `payroll`. In `issue`, set `payeeIsHuman = humanRegistry.isHuman(msg.sender)`. Store it at issue time, so the verifier sees what was true when the credential was made.
For the verifier page, also expose: org name (from payroll), `streamActiveSince`, and maybe "months funded". Architecture §8 uses these to fight fake employers. Months funded needs vault ÷ monthly, which is encrypted. So either **skip it in v0.1**, or compute another encrypted bit (`vaultOf(payer, token) >= monthly * 3`) and allow it to the verifier too.

A credential covers **one stream in one token**. "Earns ≥ 3,000 cUSDC" and "earns ≥ 1 cETH" are separate credentials. "≥ $X across all streams" needs prices. Out of scope for v0.1.

## Interface
```solidity
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
Events: `CredentialIssued(id, payee, verifier, token, threshold, expiresAt)`, `CredentialRevoked(id)`. Emitting the threshold is fine. Never emit the result bit.

## Key CoFHE snippet
`IncomeCredential` needs **access to the stream's `monthly` handle** to compute on it. In `DayzePayroll`, on stream creation, also call `FHE.allow(monthly, address(credential))`. Payroll gets the credential address from a constructor arg or a one-shot setter.

```solidity
/// @notice Issues an "earns >= threshold per month" credential to one verifier
/// @dev Expiry ends validity but can't make a verifier forget a bit it already decrypted.
///      The result is as of issuance. It proves what a contract pays, not who the employer is.
/// @param streamId The caller's active stream
/// @param verifier The only address allowed to read the result bit
/// @param threshold Plaintext monthly amount the verifier asked about, in the stream token's 6-decimal units
/// @param expiresAt Timestamp after which the credential is no longer valid
/// @return id The new credential's id
function issue(uint256 streamId, address verifier, uint64 threshold, uint64 expiresAt) external returns (uint256 id) {
    IDayzePayroll.Stream memory s = payroll.getStream(streamId);
    if (s.payee != msg.sender) revert IncomeCredential__NotPayee();
    if (s.status != IDayzePayroll.Status.Active) revert IncomeCredential__StreamNotActive();
    if (expiresAt <= block.timestamp) revert IncomeCredential__BadExpiry();

    ebool ok = FHE.gte(s.monthly, FHE.asEuint64(threshold)); // stored monthly, so no rounding (05)
    FHE.allowThis(ok);
    FHE.allow(ok, verifier); // ONLY the verifier, not the payee
    // ...store (with token = address(s.token)), emit
}
```
Why not `allowSender`? The payee already knows their salary, so the bit tells them nothing. But a verifier-only `ok` makes the access list easy to explain on stage.

05 stores `monthly` directly. So a worker earning exactly 3,000 cUSDC passes a 3,000 check. No per-second rounding. `IncomeCredential` doesn't need `PERIOD`.

## Honest limits (put these in NatSpec)
- Expiry ends **validity**. It can't make a verifier forget a bit they already decrypted (§8).
- The credential is "as of issuance". A later salary cut doesn't change it. Short expiries keep it honest.
- It proves what a contract pays, not who the employer is.

## Tests: `test/unit/IncomeCredentialTest.t.sol`
1. Monthly 3,000 cUSDC, threshold 2,500 → `ok == true`. Threshold 4,000 → `false`. Exactly 3,000 → `true`.
2. Monthly 1 cETH (`1e6`), threshold `5e5` (0.5 ETH) → `true`. The credential stores `token == cETH`.
3. `ok` is allowed to the verifier, **not** to bob or the payer
4. Non-payee issue reverts. Issuing on a `Pending`/`Cancelled` stream reverts.
5. `isValid` true before expiry. `vm.warp(expiresAt)` → false.
6. Revoke → `isValid` false. Non-payee revoke reverts.
7. Stream cancelled after issuance: `isValid` stays true (as of issuance). You may also check stream status in `isValid`. Both choices are fine. Just document it.
8. Demo timing: with `PERIOD = 600`, issue with a 2-minute expiry and warp past it
9. Payee registered in `HumanRegistry` → `payeeIsHuman == true`. Unregistered payee → `false`, and `issue` still works.

## ✅ Checkpoint
```bash
forge test -vv          # full suite green
forge coverage --report summary
```
- [ ] Full suite passes
- [ ] Coverage ≥ 80% lines on `src/` (FHE-heavy code may undercount. Check the misses by eye.)
- [ ] Run `/solidity-auditor` on `src/`. Fix real issues before deploy.

## Commit
`feat: add IncomeCredential — per-verifier, expiring, one-bit income proofs`
