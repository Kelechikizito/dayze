# 03 — AuditRegistry

## Goal
A Payer designates auditor addresses. Every new or updated payroll handle is `FHE.allow`-ed to the Payer's **current** auditors (architecture §6.2, §7.5).

## Design
Keep it a plain registry. **The contract that owns a handle is the one that must call `FHE.allow`**, so `AuditRegistry` can't grant access on `DayzePayroll`'s handles itself. Instead it answers "who are the auditors?" and payroll does the allowing.

```solidity
/**
 * @title IAuditRegistry
 * @author Kaykay
 * @notice Lets each payer choose which auditors may read their payroll handles.
 * @dev A plain registry: it only answers "who are the auditors?". The contract that owns a
 *      handle must call `FHE.allow` itself, so payroll does the allowing.
 */
interface IAuditRegistry {
    // ============================================
    // Events
    // ============================================

    /// @notice Emitted when a payer adds an auditor
    /// @param payer The payer whose auditor set changed
    /// @param auditor The auditor that was added
    event AuditorAdded(address indexed payer, address indexed auditor);

    /// @notice Emitted when a payer removes an auditor
    /// @param payer The payer whose auditor set changed
    /// @param auditor The auditor that was removed
    event AuditorRemoved(address indexed payer, address indexed auditor);

    // ============================================
    // Functions
    // ============================================

    // ---- external ----

    /// @notice Adds an auditor to the caller's (payer's) auditor set
    /// @param auditor The address to add
    function addAuditor(address auditor) external;

    /// @notice Removes an auditor from the caller's (payer's) auditor set
    /// @dev Removal only affects future handles; access already granted stays (see §8)
    /// @param auditor The address to remove
    function removeAuditor(address auditor) external;

    // ---- view & pure ----

    /// @notice Returns the payer's current auditors
    /// @param payer The payer to look up
    /// @return The auditor addresses
    function auditorsOf(address payer) external view returns (address[] memory);

    /// @notice Checks whether an address is one of the payer's auditors
    /// @param payer The payer to look up
    /// @param who The address to check
    /// @return True if `who` is in the payer's auditor set
    function isAuditor(address payer, address who) external view returns (bool);
}
```
Use OZ `EnumerableSet.AddressSet` per payer. Cap the set (e.g. `MAX_AUDITORS = 5`) because payroll loops over it on every handle update.

## The pattern payroll will use (write it now, use it in 05)
```solidity
/// @notice Allows every current auditor of `payer` to read handle `h`
/// @dev Must run in the contract that owns `h`. Call it after every new or updated payroll handle.
/// @param payer The payer whose auditors get access
/// @param h The handle to share
function _allowAuditors(address payer, euint64 h) internal {
    address[] memory auditors = auditRegistry.auditorsOf(payer);
    for (uint256 i; i < auditors.length; ++i) {
        FHE.allow(h, auditors[i]);
    }
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
