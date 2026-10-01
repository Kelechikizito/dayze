# 03 — AuditRegistry

## Goal
A Payer picks auditor addresses. Every new or updated payroll handle is `FHE.allow`-ed to the Payer's **current** auditors (architecture §6.2, §7.5).

## Design
Keep it a plain registry. **Only the contract that owns a handle can call `FHE.allow` on it.** So `AuditRegistry` can't grant access to `DayzePayroll`'s handles. It just answers "who are the auditors?". Payroll does the allowing.

```solidity
/**
 * @title IAuditRegistry
 * @author Kaykay
 * @notice Lets each payer choose which auditors may read their payroll handles.
 * @dev A plain registry: it only answers "who are the auditors?". The contract that owns a
 *      handle must call `FHE.allow` itself, so payroll does the allowing.
 */
interface IAuditRegistry {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a payer adds an auditor
    /// @param payer The payer whose auditor set changed
    /// @param auditor The auditor that was added
    event AuditorAdded(address indexed payer, address indexed auditor);

    /// @notice Emitted when a payer removes an auditor
    /// @param payer The payer whose auditor set changed
    /// @param auditor The auditor that was removed
    event AuditorRemoved(address indexed payer, address indexed auditor);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Adds an auditor to the caller's (payer's) auditor set
    /// @param auditor The address to add
    function addAuditor(address auditor) external;

    /// @notice Removes an auditor from the caller's (payer's) auditor set
    /// @dev Removal only affects future handles; access already granted stays (see §8)
    /// @param auditor The address to remove
    function removeAuditor(address auditor) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

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
Use one OZ `EnumerableSet.AddressSet` per payer. Cap it (e.g. `MAX_AUDITORS = 5`). Payroll loops over it on every handle update.

## The pattern payroll uses (write now, use in 05)
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
Put it in `src/libraries/AuditAccess.sol` as an `internal` library function. The registry is the first argument (`AuditAccess.allowAuditors(registry, payer, h)`). Internal library functions are inlined, so `FHE.allow` still runs in the owning contract. `DayzePayroll` and `IncomeCredential` can both use it. Put the interface in `src/interfaces/IAuditRegistry.sol`.

## Tests: `test/unit/AuditRegistryTest.t.sol`
1. Add, list and remove auditors. Events emitted.
2. Only the payer controls their set (bob can't add to employer's set)
3. Cap enforced
4. **Sticky access (document it, don't fix it):** a small harness in `test/mocks/AuditHarness.sol` creates handle H and allows auditors. Then remove the auditor and create handle H2. Assert with `FHE.isAllowed` (or the mock ACL) that the auditor still has H but not H2. This is the known risk in §8. The test shows you understand it.

## ✅ Checkpoint
```bash
forge test --match-contract AuditRegistryTest -vv
```
- [ ] All tests pass
- [ ] `_allowAuditors` helper exists and is ready to import

## Pitfalls
- `FHE.allow` reverts on a handle your contract doesn't own. Keep allow calls in the owning contract.

## Commit
`feat: add AuditRegistry with capped per-payer auditor sets`
