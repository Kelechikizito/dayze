# 02 — Confidential tokens (any ERC20 + native ETH)

## Goal
Any ERC20 or the chain's native currency goes in, and an encrypted balance comes out. Wrapping and unwrapping are the **only** points where amounts become plaintext (architecture §4, §8).

## Decision: wrap every token, don't move raw ERC20s
Payroll could hold plain ERC20s and pay out with `SafeERC20.safeTransfer`, but then every withdrawal is a public transfer with a readable amount. That gives away each salary. So payroll only ever moves **confidential wrappers**, and `SafeERC20` runs inside the wrappers, at the shield/unshield boundary. `fhenix-confidential-contracts` ships both wrappers you need:

| Asset | Wrapper | Shield | Unshield |
|---|---|---|---|
| Any ERC20 (USDC, ARB, WETH, …) | `FHERC20ERC20Wrapper` | `shield(to, amount)` (`safeTransferFrom` inside) | `unshield(from, to, amount)` → offchain decrypt → `claimUnshielded(id, value, proof)` (`safeTransfer` inside) |
| Native ETH | `FHERC20NativeWrapper` | `shieldNative(to)` payable, or `shieldWrappedNative(to, value)` from WETH | same, pays out native ETH |

Note: on Arbitrum the native currency is **ETH**. ARB is an ERC20, so it goes through `FHERC20ERC20Wrapper` like any other token.

Every wrapper has the same confidential surface, which is what payroll codes against (`IFHERC20`):

| Architecture term | FHERC20 function |
|---|---|
| encrypted transfer | `confidentialTransfer(to, externalEuint64, proof)` for users, `confidentialTransfer(to, sharedEuint64)` for contracts |
| let payroll pull funds | `setOperator(payroll, until)` + `confidentialTransferFrom(...)` |
| encrypted balance | `confidentialBalanceOf(account)` → `euint64` |

### Decimals
`euint64` can't hold 18-decimal amounts for long, so both wrappers cap confidential precision at **6 decimals**. An 18-decimal token gets `rate() == 1e12`: shielding 1 ETH credits `1e6` confidential units, and any dust below `1e12` wei is left with (ERC20) or refunded to (native) the sender. The native wrapper reverts with `AmountTooSmallForConfidentialPrecision` if the whole amount is below `rate()`. Tokens with ≤ 6 decimals keep their own. **All payroll math is in the wrapper's 6-decimal units**, never in the underlying token's units. The UI converts with `rate()`.

## Contracts

### `src/ConfidentialToken.sol`
One generic wrapper, deployed once per supported ERC20.
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
The `6` passed to `FHERC20` is ignored at runtime because the wrapper's `decimals()` wins. Check that the diamond compiles without extra `override(...)`; if it doesn't, copy the disambiguation block from `FHERC20NativeWrapper.sol`.

### `src/ConfidentialNative.sol`
`FHERC20NativeWrapper` is `abstract`, so you need a concrete host. Same shape as above:
```solidity
contract ConfidentialNative is FHERC20NativeWrapper {
    /// @notice Sets up a confidential wrapper around the chain's native currency
    /// @param weth The chain's canonical WETH, used for `shieldWrappedNative` and decimals
    constructor(IWETH weth) FHERC20("Confidential ETH", "cETH", 6, "") FHERC20NativeWrapper(weth) {}
}
```

### Mocks (`test/mocks/`)
- `MockERC20.sol`: OZ `ERC20` with configurable decimals and a public `mint(address,uint256)`. Deploy it twice in tests, as a 6-decimal "USDC" and an 18-decimal "ARB", so both decimal paths get exercised. Deploying your own on testnet is also simpler than faucet-hunting.
- `MockWETH.sol`: minimal WETH (`deposit`, `withdraw`, 18 decimals) satisfying `IWETH`. On Arbitrum Sepolia, use the canonical WETH instead (look its address up on Arbiscan, don't trust a hardcoded one).

### Library linking
The wrappers `delegatecall` an external library, `ERC20ConfidentialLib`. **Forge links and deploys external libraries automatically** in `forge test` and `forge script`, so there's nothing to do until you deploy (checkpoint 08). If you ever deploy with raw `forge create`, pass `--libraries`.

## Tests: `test/unit/ConfidentialTokenTest.t.sol`
Put shared setup in `test/utils/DayzeTestBase.sol` (is `CofheTest`: deploy mocks, `MockERC20` as USDC (6) and ARB (18), `MockWETH`, one `ConfidentialToken` per ERC20, `ConfidentialNative`, clients for employer/alice/bob). Every later test inherits it.

1. `shield` 1,000 USDC → `expectPlaintext(cusdc.confidentialBalanceOf(employer), 1000e6)`, USDC balance decreased
2. `shield` 1.5 ARB (18 decimals) → confidential balance `1.5e6`; `rate() == 1e12`; dust below `1e12` is never pulled from the sender
3. `shieldNative{value: 1 ether}` → confidential balance `1e6`; a value below `1e12` wei reverts
4. Encrypted transfer employer → alice using `createExternalEuint64(amount, address(cusdc))`
5. **Over-transfer doesn't revert**: sending more than the balance transfers 0 (no information leak). Check both balances are unchanged.
6. Unshield round trip, for one ERC20 wrapper and for the native wrapper (alice's ETH balance goes up):
   ```solidity
   cusdc.unshield(alice, alice, 100e6);           // creates a claim
   // find the claim id (getUserClaims(alice)) and its encrypted amount
   (, uint256 value, bytes memory sig) = alice.decryptForTx_withoutACP(claimHandle);
   cusdc.claimUnshielded(id, uint64(value), sig);
   ```
   Check the exact return shape of `decryptForTx_withoutACP` in `CofheClient.sol`.
7. Claiming the same id twice reverts (the replay protection you get for free, and a pattern you'll copy in 06).

## ✅ Checkpoint
```bash
forge test --match-contract ConfidentialTokenTest -vv
```
- [ ] All 7 tests pass
- [ ] You can explain why an over-transfer transfers 0 instead of reverting
- [ ] You can explain why 1 ETH is `1e6` confidential units
- [ ] `HelloFHE` deleted

## Pitfalls
- `confidentialBalanceOf` returns a handle. The **holder** can unseal it; your test reads it with `expectPlaintext`, which only works on mocks.
- Units: everything onchain after shielding is in 6-decimal confidential units (`3000e6` = 3,000 USDC, `1e6` = 1 ETH). Only the UI and the shield/unshield calls deal with underlying units.
- Fee-on-transfer and rebasing tokens break the wrapper's 1:1 accounting. Don't add them to the payroll allowlist (05).

## Commit
`feat: add ConfidentialToken and ConfidentialNative (FHERC20 wrappers)`
