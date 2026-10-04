// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IWETH} from "fhenix-confidential-contracts/interfaces/IWETH.sol";
import {FHERC20} from "fhenix-confidential-contracts/FHERC20/FHERC20.sol";
import {FHERC20NativeWrapper} from "fhenix-confidential-contracts/FHERC20/extensions/FHERC20NativeWrapper.sol";

/**
 * @title ConfidentialNative
 * @author Kelechi Kizito Ugwu
 * @notice Wraps the chain's native currency into a confidential token whose balances and transfers are encrypted.
 * @dev All logic comes from Fhenix's `FHERC20NativeWrapper`, which is abstract, so this contract makes it concrete.
 *      `shieldNative`/`shieldWrappedNative` and `unshield`/`claimUnshielded` are the only points where amounts are plaintext.
 *      Confidential decimals are capped at 6, so 1 ETH (18 decimals) shields to `1e6` units and `rate() == 1e12`.
 */
contract ConfidentialNative is FHERC20NativeWrapper {
    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets up a confidential wrapper around the chain's native currency
    /// @param weth The chain's canonical WETH, used for `shieldWrappedNative` and decimals
    constructor(IWETH weth) FHERC20("Confidential ETH", "cETH", 6, "") FHERC20NativeWrapper(weth) {}
}
