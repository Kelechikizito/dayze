// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IWETH} from "fhenix-confidential-contracts/interfaces/IWETH.sol";
import {CofheTest} from "@cofhe/foundry-plugin/CofheTest.sol";
import {CofheClient} from "@cofhe/foundry-plugin/CofheClient.sol";
import {ConfidentialToken} from "../../src/ConfidentialToken.sol";
import {ConfidentialNative} from "../../src/ConfidentialNative.sol";
import {ERC20_Harness, WETH_Harness} from "fhenix-confidential-contracts/test/ERC20_Harness.sol";

/**
 * @title DayzeTestBase
 * @author Kelechi Kizito Ugwu
 * @notice Shared setup for every Dayze test: CoFHE mocks, tokens, wrappers and actors.
 * @dev Each actor is a `CofheClient` (signs encrypted inputs, decrypts) plus a cached address.
 *      Use the cached address in `vm.prank` calls. Calling `client.account()` inside a pranked
 *      call's arguments would use up the prank on the `account()` call itself.
 *      The private keys are test-only. Never put a real key here.
 */
abstract contract DayzeTestBase is CofheTest {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Test-only private keys for the actors
    uint256 internal constant EMPLOYER_PKEY = 0xE1;
    uint256 internal constant ALICE_PKEY = 0xA11CE;
    uint256 internal constant BOB_PKEY = 0xB0B;

    /// @notice Underlying tokens: 6-decimal USDC, 18-decimal ARB, and WETH
    ERC20_Harness internal usdc;
    ERC20_Harness internal arb;
    WETH_Harness internal weth;

    /// @notice Confidential wrappers around USDC, ARB and native ETH
    ConfidentialToken internal cusdc;
    ConfidentialToken internal carb;
    ConfidentialNative internal ceth;

    /// @notice CoFHE clients for each actor
    CofheClient internal employerClient;
    CofheClient internal aliceClient;
    CofheClient internal bobClient;

    /// @notice Cached actor addresses
    address internal employer;
    address internal alice;
    address internal bob;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the CoFHE mocks, tokens and wrappers, and connects the actors
    function setUp() public virtual {
        deployMocks();

        (employerClient, employer) = _createActor(EMPLOYER_PKEY, "employer");
        (aliceClient, alice) = _createActor(ALICE_PKEY, "alice");
        (bobClient, bob) = _createActor(BOB_PKEY, "bob");

        usdc = new ERC20_Harness("USD Coin", "USDC", 6);
        arb = new ERC20_Harness("Arbitrum", "ARB", 18);
        weth = new WETH_Harness();

        cusdc = new ConfidentialToken(IERC20(address(usdc)), "Confidential USDC", "cUSDC");
        carb = new ConfidentialToken(IERC20(address(arb)), "Confidential ARB", "cARB");
        ceth = new ConfidentialNative(IWETH(address(weth)));

        vm.label(address(usdc), "USDC");
        vm.label(address(arb), "ARB");
        vm.label(address(weth), "WETH");
        vm.label(address(cusdc), "cUSDC");
        vm.label(address(carb), "cARB");
        vm.label(address(ceth), "cETH");
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Mints `amount` of `token` to `from`, approves `wrapper`, and shields it to `from`
    /// @param token Underlying ERC20
    /// @param wrapper Confidential wrapper around `token`
    /// @param from Actor who receives the confidential balance
    /// @param amount Amount in the underlying token's decimals
    function _mintAndShield(ERC20_Harness token, ConfidentialToken wrapper, address from, uint256 amount) internal {
        token.mint(from, amount);
        vm.startPrank(from);
        token.approve(address(wrapper), amount);
        wrapper.shield(from, amount);
        vm.stopPrank();
    }

    /// @notice Creates a connected CoFHE client for `pkey` and labels its address
    /// @param pkey Test-only private key
    /// @param label Name shown in traces
    /// @return client The connected client
    /// @return account The client's address
    function _createActor(uint256 pkey, string memory label) internal returns (CofheClient client, address account) {
        client = createCofheClient();
        client.connect(pkey);
        account = client.account();
        vm.label(account, label);
    }
}
