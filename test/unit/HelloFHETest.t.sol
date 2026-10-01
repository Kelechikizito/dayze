// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {CofheTest} from "@cofhe/foundry-plugin/CofheTest.sol";
import {CofheClient} from "@cofhe/foundry-plugin/CofheClient.sol";
import {externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {HelloFHE} from "src/HelloFHE.sol";
import {Test} from "forge-std/Test.sol";

/**
 * @title HelloFHETest
 * @author Kelechi Kizito Ugwu
 * @notice Checks that an encrypted value can be set, doubled and unsealed on CoFHE mocks.
 * @dev `CofheTest` already inherits forge-std `Test`. `ALICE_PK` is a throwaway test-only key.
 */
contract HelloFHETest is Test, CofheTest {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Test-only private key used to sign mock encrypted inputs
    uint256 private constant ALICE_PK = 0xA11CE;

    /// @notice CoFHE client acting as alice
    CofheClient private s_alice;

    /// @notice Contract under test
    HelloFHE private s_hello;

    /*//////////////////////////////////////////////////////////////
                            PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the CoFHE mocks, connects alice and deploys `HelloFHE`
    function setUp() public {
        deployMocks();
        s_alice = createCofheClient();
        s_alice.connect(ALICE_PK);
        s_hello = new HelloFHE();
    }

    /// @notice Setting 21 and doubling it stores an encrypted 42
    function test_setAndDouble() public {
        (externalEuint64 handle, bytes memory proof) = s_alice.createExternalEuint64(21, address(s_hello));
        vm.startPrank(s_alice.account());
        s_hello.set(handle, proof);
        s_hello.double();
        vm.stopPrank();
        expectPlaintext(s_hello.getStored(), uint64(42));
    }
}
