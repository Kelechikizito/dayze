# 02 — ConfidentialUSDC

## Goal
USDC goes in, an encrypted balance comes out. Wrap and unwrap are the **only** points where amounts become plaintext (architecture §4, §8).

## Decision: reuse Fhenix's FHERC20 wrapper
Architecture §6.2 says to use Fhenix's own standard if it fits, and it does. `fhenix-confidential-contracts` ships `FHERC20ERC20Wrapper`, which gives you:

| Architecture term | FHERC20 function |
|---|---|
| `wrap(amount)` | `shield(to, amount)` (pulls ERC20, credits encrypted balance) |
| `unwrap` (async) | `unshield(from, to, amount)` → off-chain decrypt → `claimUnshielded(id, value, proof)` |
| encrypted transfer | `confidentialTransfer(to, externalEuint64, proof)` for users, `confidentialTransfer(to, sharedEuint64)` for contracts |
| let payroll pull funds | `setOperator(payroll, until)` + `confidentialTransferFrom(...)` |
| encrypted balance | `confidentialBalanceOf(account)` → `euint64` |

That leaves you writing ~20 lines instead of a token.

## Contracts

### `src/MockUSDC.sol`
OZ `ERC20` with 6 decimals and a public `mint(address,uint256)` for demos. Deploying your own is simpler than faucet-hunting real testnet USDC.

### `src/ConfidentialUSDC.sol`
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
 * @title ConfidentialUSDC
 * @author Kaykay
 * @notice Wraps USDC 1:1 into cUSDC, a token whose balances and transfers are encrypted.
 * @dev All logic comes from Fhenix's `FHERC20ERC20Wrapper`. `shield` and `unshield`/`claimUnshielded`
 *      are the only points where amounts are plaintext. Keeps USDC's 6 decimals.
 */
contract ConfidentialUSDC is FHERC20ERC20Wrapper {
    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets up cUSDC as a wrapper around the given USDC token
    /// @param usdc The underlying 6-decimal USDC token
    constructor(IERC20 usdc) FHERC20("Confidential USDC", "cUSDC", 6, "") FHERC20ERC20Wrapper(usdc) {}
}
```
Verified: this compiles as-is with the forge-installed `v0.4.0` and the remappings from 01. No extra `override(...)` is needed.

### Library linking
The wrapper `delegatecall`s an external library, `ERC20ConfidentialLib`. **Forge links and deploys external libraries automatically** in `forge test` and `forge script`, so there's nothing to do until you deploy (checkpoint 08). If you ever deploy with raw `forge create`, pass `--libraries`.

## Tests: `test/ConfidentialUSDC.t.sol`
Put shared setup in `test/utils/DayzeTestBase.sol` (is `CofheTest`: deploy mocks, `MockUSDC`, `ConfidentialUSDC`, clients for employer/alice/bob). Every later test inherits it.

1. `shield` 1,000 USDC → `expectPlaintext(cusdc.confidentialBalanceOf(employer), 1000e6)`, USDC balance decreased
2. Encrypted transfer employer → alice using `createExternalEuint64(amount, address(cusdc))`
3. **Over-transfer doesn't revert**: sending more than the balance transfers 0 (no information leak). Check both balances are unchanged.
4. Unshield round trip:
   ```solidity
   cusdc.unshield(alice, alice, 100e6);           // creates a claim
   // find the claim id (getUserClaims(alice)) and its encrypted amount
   (, uint256 value, bytes memory sig) = alice.decryptForTx_withoutACP(claimHandle);
   cusdc.claimUnshielded(id, uint64(value), sig);
   ```
   Check the exact return shape of `decryptForTx_withoutACP` in `CofheClient.sol`.
5. Claiming the same id twice reverts (the replay protection you get for free, and a pattern you'll copy in 06).

## ✅ Checkpoint
```bash
forge test --match-contract ConfidentialUSDCTest -vv
```
- [ ] All 5 tests pass
- [ ] You can explain why an over-transfer transfers 0 instead of reverting
- [ ] `HelloFHE` deleted

## Pitfalls
- `confidentialBalanceOf` returns a handle. The **holder** can unseal it; your test reads it with `expectPlaintext`, which only works on mocks.
- Decimals: keep everything in 6-decimal base units (`3000e6` = $3,000). `euint64` max is ~1.8e19, which is plenty.

## Commit
`feat: add MockUSDC and ConfidentialUSDC (FHERC20 wrapper)`
