// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IWETH} from "fhenix-confidential-contracts/interfaces/IWETH.sol";
import {FHERC20} from "fhenix-confidential-contracts/FHERC20/FHERC20.sol";
import {FHERC20NativeWrapper} from "fhenix-confidential-contracts/FHERC20/extensions/FHERC20NativeWrapper.sol";

contract ConfidentialNative is FHERC20NativeWrapper {
    /// @notice Sets up a confidential wrapper around the chain's native currency
    /// @param weth The chain's canonical WETH, used for `shieldWrappedNative` and decimals
    constructor(IWETH weth) FHERC20("Confidential ETH", "cETH", 6, "") FHERC20NativeWrapper(weth) {}
}
