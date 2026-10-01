# 05 — DayzePayroll (core)

## Goal
Orgs, encrypted per-token vaults, multi-token streams, lazy accrual and no-leak withdrawals. Approvals are stubbed here (every stream goes straight to `Active`) and wired up in 06. This is the heart of the project, so take your time.

## Data model
```solidity
/*//////////////////////////////////////////////////////////////
                       TYPE DECLARATIONS
//////////////////////////////////////////////////////////////*/

/// @notice Lifecycle of a stream (AwaitingPolicy and Pending are used from 06)
enum Status {
    None,
    AwaitingPolicy,
    Pending,
    Active,
    Cancelled
}

/// @notice A payer's organisation
struct Org {
    string name; // shown on credentials
    bool exists;
}

/// @notice One salary stream from a payer to a payee, paid in one confidential token
struct Stream {
    address payer;
    address payee;
    IFHERC20 token; // allowlisted wrapper (02); public, the amount isn't
    euint64 monthly; // encrypted monthly salary, in the token's 6-decimal units
    euint64 withdrawn;
    uint64 startTime; // set when it becomes Active
    Status status;
    ebool needsApproval; // used in 06
}

/*//////////////////////////////////////////////////////////////
                        STATE VARIABLES
//////////////////////////////////////////////////////////////*/

/// @notice Length of one pay period in seconds: 30 days in prod, e.g. 600 (10 min) for the demo
uint64 public immutable PERIOD;

/// @notice Confidential wrappers payroll accepts; owner-managed
mapping(IFHERC20 token => bool supported) public s_supportedTokens;

/// @notice Each payer's encrypted funded balance, per token
mapping(address payer => mapping(IFHERC20 token => euint64 balance)) internal s_vaults;
```

**Why an allowlist, not "any address"?** Payroll trusts the wrapper to move funds honestly. A malicious "wrapper" could report a successful pull without moving anything and then drain other payers' vaults on withdraw. Only the deployer's wrappers from 02 go in: `addToken(IFHERC20)` / `removeToken(IFHERC20)`, `onlyOwner` (OZ `Ownable`). Removing a token blocks new funding and new streams in it; existing streams keep withdrawing. Adding a new ERC20 = deploy one `ConfidentialToken` for it + `addToken`. A permissionless factory that deploys wrappers and that payroll trusts is a stretch goal.

**Why `monthly`, not `ratePerSecond`?** With 6-decimal confidential units, per-second rates truncate badly for high-value assets: 1 ETH/month is `1e6 / 2_592_000 ≈ 0.39` units/s, which rounds to **0**. Store the monthly amount and accrue as `monthly × elapsed / PERIOD` in `euint128` instead (below). It's exact up to rounding down to one unit, and `IncomeCredential` compares against `monthly` directly.

**Make `PERIOD` a constructor argument.** The whole demo depends on "a month" being a few minutes (architecture §9).

## Interface
```solidity
/*//////////////////////////////////////////////////////////////
                       EXTERNAL FUNCTIONS
//////////////////////////////////////////////////////////////*/

/// @notice Registers the caller as a payer with a display name
/// @param name Org name shown on credentials
function createOrg(string calldata name) external;

/// @notice Allowlists a confidential wrapper. Owner only.
/// @param token The wrapper to accept
function addToken(IFHERC20 token) external;

/// @notice Removes a wrapper from the allowlist; existing streams keep withdrawing. Owner only.
/// @param token The wrapper to remove
function removeToken(IFHERC20 token) external;

/// @notice Pulls an encrypted amount of `token` from the caller into their vault for that token
/// @dev Caller must first call `token.setOperator(payroll, until)`
/// @param token An allowlisted confidential wrapper
/// @param amount Encrypted amount to fund, in the token's 6-decimal units
/// @param proof Proof that verifies `amount`
function fundVault(IFHERC20 token, externalEuint64 amount, bytes calldata proof) external;

/// @notice Starts an encrypted salary stream from the caller to `payee`, paid in `token`
/// @param payee The worker being paid
/// @param token An allowlisted confidential wrapper
/// @param monthly Encrypted monthly salary, in the token's 6-decimal units
/// @param proof Proof that verifies `monthly`
/// @return id The new stream's id
function createStream(address payee, IFHERC20 token, externalEuint64 monthly, bytes calldata proof)
    external
    returns (uint256 id);

/// @notice Withdraws up to the accrued, unwithdrawn amount; pays 0 instead of reverting on over-withdrawal
/// @param id The stream to withdraw from
/// @param amount Encrypted amount requested
/// @param proof Proof that verifies `amount`
function withdraw(uint256 id, externalEuint64 amount, bytes calldata proof) external;

/// @notice Cancels a stream and freezes accrual. Payer only.
/// @param id The stream to cancel
function cancelStream(uint256 id) external;

/*//////////////////////////////////////////////////////////////
                     VIEW & PURE FUNCTIONS
//////////////////////////////////////////////////////////////*/

/// @notice Returns a stream by id
/// @param id The stream to look up
/// @return The stream
function getStream(uint256 id) external view returns (Stream memory);

/// @notice Returns the ids of all streams a payer created
/// @param payer The payer to look up
/// @return The stream ids
function streamsOfPayer(address payer) external view returns (uint256[] memory);

/// @notice Returns the ids of all streams paying a payee
/// @param payee The payee to look up
/// @return The stream ids
function streamsOfPayee(address payee) external view returns (uint256[] memory);

/// @notice Returns the handle to a payer's encrypted vault balance for one token
/// @param payer The payer to look up
/// @param token The wrapper to look up
/// @return The vault handle
function vaultOf(address payer, IFHERC20 token) external view returns (euint64);
```
Events: `TokenAdded(token)`, `TokenRemoved(token)`, `OrgCreated(payer, name)`, `VaultFunded(payer, token)` (**no amount**), `StreamCreated(id, payer, payee, token, monthlyHandle)`, `StreamActivated(id, startTime)`, `Withdrawn(id, withdrawnHandle)`, `StreamCancelled(id)`. Events may carry handles but never plaintext amounts.

## Key CoFHE snippets

### Funding the vault
Payroll holds one pooled balance **per wrapper**; `s_vaults[payer][token]` is internal per-payer accounting. Never let one token's vault pay out another token's stream. The payer first calls `token.setOperator(payroll, until)` in the UI. Then:
```solidity
if (!s_supportedTokens[token]) revert DayzePayroll__UnsupportedToken();
euint64 amt = FHE.asEuint64(amount, proof);
FHE.allowThis(amt);
sharedEuint64 s = FHE.shareEuint64(amt, address(token));
sharedEuint64 movedShared = token.confidentialTransferFrom(msg.sender, address(this), s);
euint64 moved = FHE.receiveEuint64Param(movedShared); // actual amount (0 if payer was short)
euint64 vault = FHE.add(s_vaults[msg.sender][token], moved);
s_vaults[msg.sender][token] = vault;
FHE.allowThis(vault);
FHE.allow(vault, msg.sender);
_allowAuditors(msg.sender, vault);
```
Credit the **returned** amount, not the requested one. An underfunded payer transfers 0, and you must not credit phantom money. Check the exact `sharedEuint64` return and receive semantics in `IERC7984.sol` and the FHERC20 tests.

### Creating a stream
```solidity
if (!s_supportedTokens[token]) revert DayzePayroll__UnsupportedToken();
euint64 monthlyAmt = FHE.asEuint64(monthly, proof);
```
Store `monthlyAmt` on the stream and allow it to: `this`, payee, payer, auditors, and `IncomeCredential` (07). 06 also sends it to the policy.

### Accrual (lazy, no state change)
```solidity
/// @notice Computes the total amount a stream has accrued so far
/// @dev Lazy: no state change. Elapsed time is plaintext; only the salary is encrypted.
///      Done in euint128 so `monthly * elapsed` can't overflow and nothing truncates per second.
/// @param s The stream
/// @return Encrypted `monthly * elapsed / PERIOD`, in the token's units
function _accrued(Stream storage s) internal returns (euint64) {
    uint64 elapsed = uint64(block.timestamp) - s.startTime;
    euint128 total = FHE.mul(FHE.asEuint128(s.monthly), FHE.asEuint128(elapsed));
    return FHE.asEuint64(FHE.div(total, FHE.asEuint128(PERIOD)));
}
```
Elapsed time is plaintext; only the salary is encrypted (architecture §6.2). The result rounds **down** by at most one unit, so payroll never owes more than it accrued. The cast back to `euint64` is safe while `elapsed / PERIOD` stays reasonable: 1,000,000 units/month × 100 years still fits.

### Withdraw: the no-leak pattern
```solidity
euint64 req = FHE.asEuint64(amount, proof);
euint64 available = FHE.sub(_accrued(s), s.withdrawn); // withdrawn <= accrued always
ebool okStream = FHE.lte(req, available);
euint64 vault = s_vaults[s.payer][s.token];
ebool okVault = FHE.lte(req, vault); // underfunding guard, same token only
euint64 pay = FHE.select(FHE.and(okStream, okVault), req, FHE.asEuint64(0));

s.withdrawn = FHE.add(s.withdrawn, pay);
s_vaults[s.payer][s.token] = FHE.sub(vault, pay);
// re-allow both new handles: this, payee (withdrawn), payer, auditors

s.token.confidentialTransfer(s.payee, FHE.shareEuint64(pay, address(s.token)));
```
An over-withdrawal becomes a **zero transfer, never a revert**. A revert would tell observers "the request exceeded the balance".

Plaintext checks that are fine to revert on: `msg.sender == s.payee`, `s.status == Active`.

### Cancel
Set `Cancelled` and stop accrual by storing `endTime`, then use `min(now, endTime)` in `_accrued`. The payee can still withdraw what accrued before cancellation. Add `endTime` to the struct.

## Tests: `test/unit/DayzePayrollTest.t.sol` + `test/fuzz/DayzePayrollFuzzTest.t.sol`
Deploy with `PERIOD = 30 days`, and in a second contract with `PERIOD = 600`, to check the math holds for both.

1. `createOrg`; creating twice reverts
2. `addToken`/`removeToken` are owner-only; `fundVault` and `createStream` with a non-allowlisted token revert
3. `fundVault(cusdc, 10,000)` → `expectPlaintext(vaultOf(employer, cusdc), 10000e6)`; funding more than your cUSDC balance credits 0
4. `createStream` 3,000 cUSDC/month → stored `monthly == 3000e6`
5. `vm.warp(+1 day)`, withdraw exactly the accrued amount → payee cUSDC balance up, `withdrawn` matches
6. **Low-unit asset:** stream 1 cETH/month (`1e6`), warp half a period → accrued is `5e5`, not 0
7. **Vaults are per token:** fund only cUSDC, stream in cETH → withdraw pays 0, and the cUSDC vault is untouched
8. **Over-withdraw** → `pay == 0`, balances unchanged, **no revert**
9. **Underfunded vault**: fund 100, accrue 200, request 150 → pays 0
10. Non-payee withdraw reverts
11. Cancel, then warp: accrual frozen at cancel time
12. ACL: payee can read `monthly`; bob (a random address) can't (`FHE.isAllowed` / mock ACL)
13. Fuzz: `testFuzz_neverOverpays(uint64 monthly, uint32 dt, uint64 req)` → total withdrawn ≤ accrued and ≤ funded

## ✅ Checkpoint
```bash
forge test --match-contract DayzePayrollTest -vv
```
- [ ] All tests pass, including the fuzz test
- [ ] `grep -n "emit" src/DayzePayroll.sol` shows no plaintext amount in any event
- [ ] Every assignment to an `e*` storage field is followed by `allowThis`

## Pitfalls
- **Multiplication overflow:** `monthly × elapsed` would wrap at 2^64 within months for large salaries, which is why accrual runs in `euint128`. Don't feed plaintext `block.timestamp` in where elapsed belongs.
- **Units:** `monthly`, vaults and withdrawals are all in the wrapper's 6-decimal units, never the underlying token's (02).
- Don't compute `available` with `select` against 0 to "protect" underflow. The invariant `withdrawn ≤ accrued` holds by construction, so keep it simple and test it with the fuzz test.
- Gas: each FHE op is a Task Manager call. `withdraw` is ~12 ops (the `euint128` accrual adds a few), which is fine on Arbitrum.

## Commit
`feat: add DayzePayroll core — token allowlist, per-token vaults, streams, accrual, withdraw`
