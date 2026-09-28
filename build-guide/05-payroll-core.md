# 05 — DayzePayroll (core)

## Goal
Orgs, encrypted vaults, streams, lazy accrual and no-leak withdrawals. Approvals are stubbed here (every stream goes straight to `Active`) and wired up in 06. This is the heart of the project, so take your time.

## Data model
```solidity
enum Status { None, AwaitingPolicy, Pending, Active, Cancelled }

struct Org {
    string name;             // shown on credentials
    bool exists;
    euint64 vault;           // payer's encrypted funded balance
}

struct Stream {
    address payer;
    address payee;
    euint64 ratePerSecond;
    euint64 withdrawn;
    uint64 startTime;        // set when it becomes Active
    Status status;
    ebool needsApproval;     // used in 06
}

uint64 public immutable PERIOD;   // 30 days in prod, e.g. 600 (10 min) for the demo
```

**Make `PERIOD` a constructor argument.** The whole demo depends on "a month" being a few minutes (architecture §9). `IncomeCredential` reads the same value.

## Interface
```solidity
function createOrg(string calldata name) external;
function fundVault(externalEuint64 amount, bytes calldata proof) external;  // pulls cUSDC
function createStream(address payee, externalEuint64 monthly, bytes calldata proof) external returns (uint256 id);
function withdraw(uint256 id, externalEuint64 amount, bytes calldata proof) external;
function cancelStream(uint256 id) external;          // payer only
// views
function getStream(uint256 id) external view returns (Stream memory);
function streamsOfPayer(address) external view returns (uint256[] memory);
function streamsOfPayee(address) external view returns (uint256[] memory);
function vaultOf(address payer) external view returns (euint64);
```
Events: `OrgCreated(payer, name)`, `VaultFunded(payer)` (**no amount**), `StreamCreated(id, payer, payee, rateHandle)`, `StreamActivated(id, startTime)`, `Withdrawn(id, withdrawnHandle)`, `StreamCancelled(id)`. Events may carry handles but never plaintext amounts.

## Key CoFHE snippets

### Funding the vault
Payroll holds one pooled cUSDC balance; `Org.vault` is internal per-payer accounting. The payer first calls `cusdc.setOperator(payroll, until)` in the UI. Then:
```solidity
euint64 amt = FHE.asEuint64(amount, proof);
FHE.allowThis(amt);
sharedEuint64 s = FHE.shareEuint64(amt, address(cusdc));
sharedEuint64 movedShared = cusdc.confidentialTransferFrom(msg.sender, address(this), s);
euint64 moved = FHE.receiveEuint64Param(movedShared);   // actual amount (0 if payer was short)
org.vault = FHE.add(org.vault, moved);
FHE.allowThis(org.vault); FHE.allow(org.vault, msg.sender); _allowAuditors(msg.sender, org.vault);
```
Credit the **returned** amount, not the requested one. An underfunded payer transfers 0, and you must not credit phantom money. Check the exact `sharedEuint64` return and receive semantics in `IERC7984.sol` and the FHERC20 tests.

### Monthly → rate
```solidity
euint64 monthlyAmt = FHE.asEuint64(monthly, proof);
euint64 rate = FHE.div(monthlyAmt, FHE.asEuint64(PERIOD));
```
Integer division loses the remainder: $3,000/month over 30 days is 1,157 micro-USDC/s, about 0.03% lost. That's fine for v0.1; mention it if asked. **Keep `monthlyAmt` around in memory**, because 06 sends it to the policy.

Allow `rate` to: `this`, payee, payer, auditors.

### Accrual (lazy, no state change)
```solidity
function _accrued(Stream storage s) internal returns (euint64) {
    uint64 elapsed = uint64(block.timestamp) - s.startTime;
    return FHE.mul(s.ratePerSecond, FHE.asEuint64(elapsed));
}
```
Elapsed time is plaintext; only the rate is encrypted (architecture §6.2).

### Withdraw: the no-leak pattern
```solidity
euint64 req       = FHE.asEuint64(amount, proof);
euint64 available = FHE.sub(_accrued(s), s.withdrawn);          // withdrawn <= accrued always
ebool   okStream  = FHE.lte(req, available);
ebool   okVault   = FHE.lte(req, orgs[s.payer].vault);           // underfunding guard
euint64 pay       = FHE.select(FHE.and(okStream, okVault), req, FHE.asEuint64(0));

s.withdrawn            = FHE.add(s.withdrawn, pay);
orgs[s.payer].vault    = FHE.sub(orgs[s.payer].vault, pay);
// re-allow both new handles: this, payee (withdrawn), payer, auditors

cusdc.confidentialTransfer(s.payee, FHE.shareEuint64(pay, address(cusdc)));
```
An over-withdrawal becomes a **zero transfer, never a revert**. A revert would tell observers "the request exceeded the balance".

Plaintext checks that are fine to revert on: `msg.sender == s.payee`, `s.status == Active`.

### Cancel
Set `Cancelled` and stop accrual by storing `endTime`, then use `min(now, endTime)` in `_accrued`. The payee can still withdraw what accrued before cancellation. Add `endTime` to the struct.

## Tests: `test/DayzePayroll.t.sol`
Deploy with `PERIOD = 30 days`, and in a second contract with `PERIOD = 600`, to check the math holds for both.

1. `createOrg`; creating twice reverts
2. `fundVault` 10,000 → `expectPlaintext(vault, 10000e6)`; funding more than your cUSDC balance credits 0
3. `createStream` 3,000/month → rate = `3000e6 / PERIOD`
4. `vm.warp(+1 day)`, withdraw exactly the accrued amount → payee cUSDC balance up, `withdrawn` matches
5. **Over-withdraw** → `pay == 0`, balances unchanged, **no revert**
6. **Underfunded vault**: fund 100, accrue 200, request 150 → pays 0
7. Non-payee withdraw reverts
8. Cancel, then warp: accrual frozen at cancel time
9. ACL: payee can read `rate`; bob (a random address) can't (`FHE.isAllowed` / mock ACL)
10. Fuzz: `testFuzz_neverOverpays(uint64 monthly, uint32 dt, uint64 req)` → total withdrawn ≤ accrued and ≤ funded

## ✅ Checkpoint
```bash
forge test --match-contract DayzePayrollTest -vv
```
- [ ] All tests pass, including the fuzz test
- [ ] `grep -n "emit" src/DayzePayroll.sol` shows no plaintext amount in any event
- [ ] Every assignment to an `e*` storage field is followed by `allowThis`

## Pitfalls
- **Multiplication overflow:** `rate × elapsed` wraps at 2^64. With 6 decimals, even $1M/month for 10 years is fine, but don't feed plaintext `block.timestamp` in where elapsed belongs.
- Don't compute `available` with `select` against 0 to "protect" underflow. The invariant `withdrawn ≤ accrued` holds by construction, so keep it simple and test it with the fuzz test.
- Gas: each FHE op is a Task Manager call. `withdraw` is ~10 ops, which is fine on Arbitrum.

## Commit
`feat: add DayzePayroll core — orgs, vaults, streams, accrual, withdraw`
