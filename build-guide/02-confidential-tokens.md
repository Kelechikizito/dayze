# 02 — Confidential tokens (any ERC20 + native ETH)

## Goal
Any ERC20 or native ETH goes in. An encrypted balance comes out. Wrap and unwrap are the **only** places amounts are plaintext (architecture §4, §8).

## Steps
Do these in order. The sections after **Steps** have the code and details each to-do points to.

### 1. Read the design
**To do:**
- [ ] Read **Decision** and **Decimals** below
- [ ] Be able to say why payroll only moves wrappers, and why 1 ETH is `1e6` units

### 2. Write `ConfidentialToken`
**To do:**
- [ ] Create `src/ConfidentialToken.sol` with `/sol-style-guide`
- [ ] Inherit `FHERC20ERC20Wrapper`. Pass the underlying ERC20, name and symbol (code below).
- [ ] Run `forge build`. If it asks for `override(...)`, copy the block from `FHERC20NativeWrapper.sol`.

### 3. Write `ConfidentialNative`
**To do:**
- [ ] Create `src/ConfidentialNative.sol`
- [ ] Inherit `FHERC20NativeWrapper`. Take `IWETH` in the constructor (code below).
- [ ] Run `forge build`

### 4. Build the shared test base
**To do:**
- [ ] Create `test/utils/DayzeTestBase.sol` as a `CofheTest`
- [ ] In `setUp`, deploy the mocks, `ERC20_Harness` USDC (6) and ARB (18), and `WETH_Harness`
- [ ] Deploy one `ConfidentialToken` per ERC20, plus `ConfidentialNative`
- [ ] Create CoFHE clients for employer, alice and bob
- [ ] Mint test USDC and ARB to the employer

### 5. Write the token tests
**To do:**
- [ ] Create `test/unit/ConfidentialTokenTest.t.sol`. Inherit `DayzeTestBase`.
- [ ] Write the 7 tests in **Tests** below
- [ ] Run the command in **Checkpoint**

### 6. Clean up and commit
**To do:**
- [ ] Delete `src/HelloFHE.sol` and `test/unit/HelloFHETest.t.sol`
- [ ] Commit

## Decision: wrap every token, never move raw ERC20s
If payroll paid in plain ERC20s, every withdrawal would be a public transfer. Anyone could read each salary. So payroll only moves **confidential wrappers**. `SafeERC20` runs inside the wrappers, at shield/unshield. `fhenix-confidential-contracts` has both wrappers:

| Asset | Wrapper | Shield | Unshield |
|---|---|---|---|
| Any ERC20 (USDC, ARB, WETH, …) | `FHERC20ERC20Wrapper` | `shield(to, amount)` (`safeTransferFrom` inside) | `unshield(from, to, amount)` → offchain decrypt → `claimUnshielded(id, value, proof)` (`safeTransfer` inside) |
| Native ETH | `FHERC20NativeWrapper` | `shieldNative(to)` payable, or `shieldWrappedNative(to, value)` from WETH | same, pays out native ETH |

On Base the native currency is **ETH**. The demo ARB token is an ERC20, so it uses `FHERC20ERC20Wrapper`.

All wrappers share one confidential interface (`IFHERC20`). Payroll codes against it:

| Architecture term | FHERC20 function |
|---|---|
| encrypted transfer | `confidentialTransfer(to, externalEuint64, proof)` for users, `confidentialTransfer(to, sharedEuint64)` for contracts |
| let payroll pull funds | `setOperator(payroll, until)` + `confidentialTransferFrom(...)` |
| encrypted balance | `confidentialBalanceOf(account)` → `euint64` |

### Decimals
`euint64` is too small for 18-decimal amounts, so both wrappers cap precision at **6 decimals**.

- An 18-decimal token gets `rate() == 1e12`. Shielding 1 ETH credits `1e6` confidential units.
- Dust below `1e12` wei stays with the sender (ERC20) or is refunded (native).
- The native wrapper reverts with `AmountTooSmallForConfidentialPrecision` if the whole amount is below `rate()`.
- Tokens with ≤ 6 decimals keep their own decimals.

**All payroll math uses the wrapper's 6-decimal units**, never the underlying token's. The UI converts with `rate()`.

## Contracts

### `src/ConfidentialToken.sol`
One generic wrapper. Deploy once per supported ERC20.
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {FHERC20} from "fhenix-confidential-contracts/FHERC20/FHERC20.sol";
import {FHERC20ERC20Wrapper} from "fhenix-confidential-contracts/FHERC20/extensions/FHERC20ERC20Wrapper.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title ConfidentialToken
 * @author Kaykay
 * @notice Wraps any ERC20 into a confidential token whose balances and transfers are encrypted.
 * @dev All logic comes from Fhenix's `FHERC20ERC20Wrapper`, which uses `SafeERC20` for the underlying.
 *      `shield` and `unshield`/`claimUnshielded` are the only points where amounts are plaintext.
 *      Confidential decimals are `min(underlying decimals, 6)`; the wrapper overrides `decimals()`.
 */
contract ConfidentialToken is FHERC20ERC20Wrapper {
    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets up a confidential wrapper around `underlying`
    /// @param underlying The ERC20 to wrap
    /// @param name Token name, e.g. "Confidential USDC"
    /// @param symbol Token symbol, e.g. "cUSDC"
    constructor(IERC20 underlying, string memory name, string memory symbol)
        FHERC20(name, symbol, 6, "")
        FHERC20ERC20Wrapper(underlying)
    {}
}
```
The `6` passed to `FHERC20` is ignored. The wrapper's `decimals()` wins. Check the diamond compiles without extra `override(...)`. If not, copy the override block from `FHERC20NativeWrapper.sol`.

### `src/ConfidentialNative.sol`
`FHERC20NativeWrapper` is `abstract`, so it needs a concrete contract. Same shape:
```solidity
contract ConfidentialNative is FHERC20NativeWrapper {
    /// @notice Sets up a confidential wrapper around the chain's native currency
    /// @param weth The chain's canonical WETH, used for `shieldWrappedNative` and decimals
    constructor(IWETH weth) FHERC20("Confidential ETH", "cETH", 6, "") FHERC20NativeWrapper(weth) {}
}
```

### Mocks: import them, don't write them
`fhenix-confidential-contracts/test/ERC20_Harness.sol` has both:
- `ERC20_Harness(name, symbol, decimals)`: ERC20 with open `mint`. Deploy it twice in tests: 6-decimal "USDC" and 18-decimal "ARB". This tests both decimal paths. On testnet, deploying your own is easier than finding a faucet.
- `WETH_Harness`: `deposit`, `withdraw`, 18 decimals. Fits `IWETH`. On Base Sepolia, use the real WETH (the `0x4200…0006` predeploy). Look up its address on Basescan. Don't trust a hardcoded one.

OZ's `ERC20Mock` doesn't fit: its decimals are fixed at 18, and OZ has no WETH mock.

### Library linking
The wrappers `delegatecall` an external library, `ERC20ConfidentialLib`. **Forge links it for you** in `forge test` and `forge script`. Nothing to do until deploy (08). With raw `forge create`, pass `--libraries`.

## Tests: `test/unit/ConfidentialTokenTest.t.sol`
Put shared setup in `test/utils/DayzeTestBase.sol`. It is a `CofheTest` that deploys mocks, `ERC20_Harness` as USDC (6) and ARB (18), `WETH_Harness`, one `ConfidentialToken` per ERC20, `ConfidentialNative`, and clients for employer/alice/bob. Every later test inherits it.

1. `shield` 1,000 USDC → `expectPlaintext(cusdc.confidentialBalanceOf(employer), 1000e6)`. USDC balance goes down.
2. `shield` 1.5 ARB (18 decimals) → confidential balance `1.5e6`. `rate() == 1e12`. Dust below `1e12` is never pulled from the sender.
3. `shieldNative{value: 1 ether}` → confidential balance `1e6`. A value below `1e12` wei reverts.
4. Encrypted transfer employer → alice with `createExternalEuint64(amount, address(cusdc))`
5. **Over-transfer doesn't revert**: sending more than the balance sends 0 (no info leak). Check both balances stay the same.
6. Unshield round trip, for one ERC20 wrapper and the native wrapper (alice's ETH goes up):
   ```solidity
   cusdc.unshield(alice, alice, 100e6);           // creates a claim
   // find the claim id (getUserClaims(alice)) and its encrypted amount
   (, uint256 value, bytes memory sig) = alice.decryptForTx_withoutACP(claimHandle);
   cusdc.claimUnshielded(id, uint64(value), sig);
   ```
   Check the return shape of `decryptForTx_withoutACP` in `CofheClient.sol`.
7. Claiming the same id twice reverts. This replay guard comes free. You'll copy it in 06.

## ✅ Checkpoint
```bash
forge test --match-contract ConfidentialTokenTest -vv
```
- [ ] All 7 tests pass
- [ ] You can explain why an over-transfer sends 0 instead of reverting
- [ ] You can explain why 1 ETH is `1e6` confidential units
- [ ] `HelloFHE` deleted

## Pitfalls
- `confidentialBalanceOf` returns a handle. The **holder** can unseal it. Tests read it with `expectPlaintext`, which only works on mocks.
- Units: after shielding, everything onchain is in 6-decimal units (`3000e6` = 3,000 USDC, `1e6` = 1 ETH). Only the UI and shield/unshield use underlying units.
- Fee-on-transfer and rebasing tokens break the 1:1 accounting. Keep them off the payroll allowlist (05).

## Commit
`feat: add ConfidentialToken and ConfidentialNative (FHERC20 wrappers)`
