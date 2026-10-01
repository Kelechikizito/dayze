// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {FHERC20} from "fhenix-confidential-contracts/FHERC20/FHERC20.sol";
import {FHERC20ERC20Wrapper} from "fhenix-confidential-contracts/FHERC20/extensions/FHERC20ERC20Wrapper.sol";

/**
 * @title ConfidentialToken
 * @author Kelechi Kizito Ugwu
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
