# 05 — DayzePayroll (core)

## Goal
Orgs, encrypted per-token vaults, multi-token streams, lazy accrual and no-leak withdrawals. Approvals are stubbed here: every stream goes straight to `Active`. 06 wires them up. This is the core of the project. Take your time.

## Steps
Do these in order. The sections after **Steps** have the code and details each to-do points to.

### 1. Types and interface
**To do:**
- [ ] Create `src/interfaces/IDayzePayroll.sol` with `Status`, `Org`, `Stream`, the events and the functions (**Data model** and **Interface** below)
- [ ] Import `IFHERC20` from `fhenix-confidential-contracts/interfaces/IFHERC20.sol`. There is no `src/interfaces/IFHERC20.sol`.

### 2. Contract skeleton
**To do:**
- [ ] Create `src/DayzePayroll.sol` with `/sol-style-guide`. Inherit OZ `Ownable`.
- [ ] Constructor takes `IApprovalPolicy`, `IAuditRegistry` and `PERIOD`. Revert on a zero address or `PERIOD == 0`.
- [ ] Add storage: orgs, streams, a next stream id, the payer and payee id lists, `s_supportedTokens`, `s_vaults`

### 3. Orgs and the token allowlist
**To do:**
- [ ] `createOrg`: revert if the caller already has one. Store it. Emit `OrgCreated`.
- [ ] `addToken` and `removeToken`: `onlyOwner`. Emit `TokenAdded` / `TokenRemoved`.

### 4. Fund the vault
**To do:**
- [ ] Revert on a token that isn't allowlisted
- [ ] Pull with `confidentialTransferFrom`. Credit the **returned** amount (**Funding the vault** below).
- [ ] Allow the new vault handle to this contract, the payer and the auditors
- [ ] Emit `VaultFunded` with no amount

### 5. Create a stream
**To do:**
- [ ] Revert on a token that isn't allowlisted, or a caller with no org
- [ ] Store the encrypted `monthly`. Allow it to this contract, payee, payer and auditors.
- [ ] For now, set `Active` and `startTime = block.timestamp` right away (06 replaces this)
- [ ] Push the id to the payer and payee lists. Emit `StreamCreated` and `StreamActivated`.

### 6. Accrual
**To do:**
- [ ] Write `_accrued` in `euint128` (**Accrual** below)
- [ ] For cancelled streams, count time up to `endTime`, not `block.timestamp`

### 7. Withdraw
**To do:**
- [ ] Revert if the caller isn't the payee, or the stream is not `Active` or `Cancelled`
- [ ] Build `pay` with `FHE.select`, so an over-withdraw pays 0 (**Withdraw** below)
- [ ] Update `withdrawn` and the vault. Re-allow both new handles.
- [ ] Emit `Withdrawn`. Skip the transfer if the vault was never funded (**Withdraw** below).
- [ ] Send `pay` with `confidentialTransfer`

### 8. Cancel and views
**To do:**
- [ ] `cancelStream`: payer only. Set `Cancelled` and `endTime`. Emit `StreamCancelled`.
- [ ] Write `orgOf`, `getStream`, `streamsOfPayer`, `streamsOfPayee` and `vaultOf`

### 9. Tests
**To do:**
- [ ] Create `test/utils/PayrollTestBase.sol`: deploy payroll, allowlist the wrappers, create the org, add helpers (**Tests** below)
- [ ] Write the 12 unit tests in `test/unit/DayzePayrollTest.t.sol` (**Tests** below)
- [ ] Write the fuzz test in `test/fuzz/DayzePayrollFuzzTest.t.sol`
- [ ] Run them with `PERIOD = 30 days` and with `PERIOD = 600` (one subclass each)
- [ ] Run the checks in **Checkpoint**, then commit

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
    uint64 endTime; // set on cancel; accrual stops here
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

**Why an allowlist, not any address?** Payroll trusts the wrapper to move funds honestly. A fake "wrapper" could report a pull without moving anything, then drain other payers' vaults on withdraw.

- Only the deployer's wrappers from 02 go in: `addToken(IFHERC20)` / `removeToken(IFHERC20)`, `onlyOwner` (OZ `Ownable`).
- Removing a token blocks new funding and new streams in it. Existing streams can still withdraw.
- New ERC20 = deploy one `ConfidentialToken` for it + `addToken`.
- Stretch goal: a permissionless factory that deploys wrappers payroll trusts.

**Why `monthly`, not `ratePerSecond`?** With 6-decimal units, per-second rates round badly for high-value assets. 1 ETH/month is `1e6 / 2_592_000 ≈ 0.39` units/s, which rounds to **0**. So store the monthly amount and accrue `monthly × elapsed / PERIOD` in `euint128` (below). It's exact, minus at most one unit of rounding down. `IncomeCredential` also compares against `monthly` directly.

**Make `PERIOD` a constructor argument.** The demo needs "a month" to be a few minutes (architecture §9).

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

/// @notice Returns a payer's org
/// @param payer The payer to look up
/// @return The org; `exists` is false if none
function orgOf(address payer) external view returns (Org memory);

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
Events: `TokenAdded(token)`, `TokenRemoved(token)`, `OrgCreated(payer, name)`, `VaultFunded(payer, token)` (**no amount**), `StreamCreated(id, payer, payee, token, monthlyHandle)`, `StreamActivated(id, startTime)`, `Withdrawn(id, withdrawnHandle)`, `StreamCancelled(id)`. Events may carry handles, never plaintext amounts.

## Key CoFHE snippets

### Funding the vault
Payroll holds one pooled balance **per wrapper**. `s_vaults[payer][token]` tracks each payer's share. Never let one token's vault pay another token's stream. The payer first calls `token.setOperator(payroll, until)` in the UI. Then:
```solidity
if (!s_supportedTokens[token]) revert DayzePayroll__UnsupportedToken();
euint64 amt = FHE.asEuint64(amount, proof);
FHE.allowThis(amt);
sharedEuint64 s = FHE.shareEuint64(amt, address(token));
sharedEuint64 movedShared = token.confidentialTransferFrom(msg.sender, address(this), s);
euint64 moved = FHE.receiveEuint64FromCall(movedShared, address(token)); // actual amount (0 if payer was short)
euint64 vault = FHE.add(s_vaults[msg.sender][token], moved);
s_vaults[msg.sender][token] = vault;
FHE.allowThis(vault);
FHE.allow(vault, msg.sender);
I_AUDIT_REGISTRY.allowAuditors(msg.sender, vault); // `using AuditAccess for IAuditRegistry`
```
Credit the **returned** amount, not the requested one. An underfunded payer transfers 0. Don't credit money that never arrived.

Read the return value with `receiveEuint64FromCall(shared, callee)`, not `receiveEuint64Param`. `...Param` is for a value passed **in** as an argument (like `evaluate` in 04). `...FromCall` is for a value **returned** by a call you made. `callee` must be the address you just called.

### Creating a stream
```solidity
if (!s_supportedTokens[token]) revert DayzePayroll__UnsupportedToken();
euint64 monthlyAmt = FHE.asEuint64(monthly, proof);
```
Store `monthlyAmt` on the stream. Allow it to `this`, payee, payer, auditors and `IncomeCredential` (07). In 06 it also goes to the policy.

### Accrual (lazy, no state change)
```solidity
/// @notice Computes the total amount a stream has accrued so far
/// @dev Lazy: no state change. Elapsed time is plaintext; only the salary is encrypted.
///      Done in euint128 so `monthly * elapsed` can't overflow and nothing truncates per second.
/// @param s The stream
/// @return Encrypted `monthly * elapsed / PERIOD`, in the token's units
function _accrued(Stream storage s) internal returns (euint64) {
    uint64 end = s.status == Status.Cancelled ? s.endTime : uint64(block.timestamp);
    uint64 elapsed = end - s.startTime;
    euint128 total = FHE.mul(FHE.asEuint128(s.monthly), FHE.asEuint128(uint256(elapsed)));
    return FHE.asEuint64(FHE.div(total, FHE.asEuint128(uint256(PERIOD))));
}
```
Elapsed time is plaintext. Only the salary is encrypted (architecture §6.2). The result rounds **down** by at most one unit, so payroll never owes more than accrued. The cast back to `euint64` is safe for sane `elapsed / PERIOD`: 1,000,000 units/month × 100 years still fits.

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
emit Withdrawn(id, euint64.unwrap(s.withdrawn));

if (!FHE.isInitialized(vault)) return; // never funded: pay is 0, and the token would revert
FHE.allowThis(pay);
s.token.confidentialTransfer(s.payee, FHE.shareEuint64(pay, address(s.token)));
```
An over-withdrawal becomes a **zero transfer, never a revert**. A revert would tell watchers "the request was more than the balance".

**Why skip on an unfunded vault?** If no payer ever funded this token, payroll has no balance in it. FHERC20 reverts with `FHERC20ZeroBalance` on a sender with no balance, even for a 0 transfer. `pay` is 0 anyway, so skip the call. This leaks nothing: `VaultFunded` already shows who funded which token.

Plaintext checks that may revert: `msg.sender == s.payee`, and `s.status` is `Active` or `Cancelled`. A cancelled stream still pays out what accrued before cancel (see **Cancel**).

### Cancel
Set `Cancelled` and store `endTime`. `_accrued` counts time up to `endTime` for cancelled streams. This freezes accrual. The payee can still withdraw what accrued before cancel. In 05, only `Active` streams can be cancelled (06 adds `Pending`).

## Tests: `test/unit/DayzePayrollTest.t.sol` + `test/fuzz/DayzePayrollFuzzTest.t.sol`
Deploy once with `PERIOD = 30 days` and once with `PERIOD = 600`. The math must hold for both.

**Setup:** put shared setup in `test/utils/PayrollTestBase.sol`, not `DayzeTestBase`. `ApprovalPolicyTest` points the policy at its own harness, so a real payroll there would clash. It has:
- an abstract `_period()`
- `setUp`: deploy policy, registry and payroll; `addToken` cUSDC and cETH; `createOrg`; shield 10,000 USDC; `setOperator(payroll)`
- helpers: `_fund`, `_createStream`, `_withdraw`, `_aliceBalance`

Make the test contract abstract. Add two small subclasses at the bottom of the file, one per period: `DayzePayrollTest30Days` and `DayzePayrollTest600s`. Warp in fractions of `PERIOD`, so the same amounts work for both. For example, 3,000/month accrues exactly 100 per `PERIOD / 30`.

1. `createOrg`. Creating twice reverts.
2. `addToken`/`removeToken` are owner-only. `fundVault` and `createStream` with a non-allowlisted token revert.
3. `fundVault(cusdc, 10,000)` → `expectPlaintext(vaultOf(employer, cusdc), 10000e6)`. Funding more than your cUSDC balance credits 0.
4. `createStream` 3,000 cUSDC/month → stored `monthly == 3000e6`
5. `vm.warp(+1 day)`, withdraw exactly the accrued amount → payee cUSDC goes up, `withdrawn` matches
6. **Low-unit asset:** stream 1 cETH/month (`1e6`), warp half a period → accrued is `5e5`, not 0
7. **Vaults are per token:** fund only cUSDC, stream in cETH → withdraw pays 0. The cUSDC vault is untouched.
8. **Over-withdraw** → `pay == 0`, balances unchanged, **no revert**
9. **Underfunded vault**: fund 100, accrue 200, request 150 → pays 0
10. Non-payee withdraw reverts
11. Cancel, then warp: accrual stays frozen at cancel time
12. ACL: payee can read `monthly`. bob (a random address) can't (`FHE.isAllowed` / mock ACL).
13. Fuzz: `testFuzz_neverOverpays(uint64 monthly, uint32 dt, uint64 req, uint64 funded)` → pays `req` if it fits both accrued and funded, else 0. Bound `dt` to 10 periods so accrual fits in 64 bits.

## ✅ Checkpoint
```bash
forge test --match-contract DayzePayrollTest -vv
```
- [ ] All tests pass, including the fuzz test
- [ ] `grep -n "emit" src/DayzePayroll.sol` shows no plaintext amount in any event
- [ ] Every write to an `e*` storage field is followed by `allowThis`

## Pitfalls
- **Overflow:** for large salaries, `monthly × elapsed` passes 2^64 within months. That's why accrual uses `euint128`. Use elapsed time, not raw `block.timestamp`.
- **Units:** `monthly`, vaults and withdrawals all use the wrapper's 6-decimal units, never the underlying token's (02).
- Don't wrap `available` in a `select` against 0 to "guard" underflow. `withdrawn ≤ accrued` always holds by design. Keep it simple and prove it with the fuzz test.
- **`expectEmit` catches the next call.** Encrypt the input **before** `vm.expectEmit`. Otherwise it matches the `createExternalEuint64` call and fails with `log != expected log`.
- **Unset balances:** `expectPlaintext` on a handle that was never set fails. Check `FHE.isInitialized` first, or treat an unset handle as 0.
- Gas: each FHE op is a Task Manager call. `withdraw` is ~12 ops (`euint128` accrual adds a few). Fine on Base.

## Commit
`feat: add DayzePayroll core — token allowlist, per-token vaults, streams, accrual, withdraw`
