# 03 — AuditRegistry

## Goal
A Payer designates auditor addresses. Every new or updated payroll handle is `FHE.allow`-ed to the Payer's **current** auditors (architecture §6.2, §7.5).

## Design
Keep it a plain registry. **The contract that owns a handle is the one that must call `FHE.allow`**, so `AuditRegistry` can't grant access on `DayzePayroll`'s handles itself. Instead it answers "who are the auditors?" and payroll does the allowing.

```solidity
interface IAuditRegistry {
    event AuditorAdded(address indexed payer, address indexed auditor);
    event AuditorRemoved(address indexed payer, address indexed auditor);

    function addAuditor(address auditor) external;      // msg.sender = payer
    function removeAuditor(address auditor) external;
    function auditorsOf(address payer) external view returns (address[] memory);
    function isAuditor(address payer, address who) external view returns (bool);
}
```
Use OZ `EnumerableSet.AddressSet` per payer. Cap the set (e.g. `MAX_AUDITORS = 5`) because payroll loops over it on every handle update.

## The pattern payroll will use (write it now, use it in 05)
```solidity
function _allowAuditors(address payer, euint64 h) internal {
    address[] memory a = auditRegistry.auditorsOf(payer);
    for (uint256 i; i < a.length; ++i) FHE.allow(h, a[i]);
}
```
Put it in an abstract contract or library so `DayzePayroll` and `IncomeCredential` can share it.

## Tests: `test/AuditRegistry.t.sol`
1. Add, list and remove auditors; events emitted
2. Only the payer controls their own set (bob can't add to employer's set)
3. Cap enforced
4. **Sticky access (document it, don't fix it):** a tiny harness contract creates handle H, allows auditors, then the auditor is removed and a new handle H2 is created. Assert the auditor is still allowed on H and not on H2 with `FHE.isAllowed` (or the mock ACL). This is the residual risk in §8. The test proves you understand it.

## ✅ Checkpoint
```bash
forge test --match-contract AuditRegistryTest -vv
```
- [ ] All tests pass
- [ ] `_allowAuditors` helper exists and is ready to import

## Pitfalls
- `FHE.allow` on a handle your contract doesn't own reverts. Keep the allow calls in the owning contract.

## Commit
`feat: add AuditRegistry with capped per-payer auditor sets`
