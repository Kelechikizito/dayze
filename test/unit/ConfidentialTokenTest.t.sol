// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ERC20ConfidentialLib} from "fhenix-confidential-contracts/ERC20Confidential/ERC20ConfidentialLib.sol";
import {FHERC20WrapperClaims} from "fhenix-confidential-contracts/FHERC20/utils/FHERC20WrapperClaims.sol";
import {FHERC20NativeWrapperCore} from
    "fhenix-confidential-contracts/FHERC20/extensions/FHERC20NativeWrapperCore.sol";
import {CofheClient} from "@cofhe/foundry-plugin/CofheClient.sol";
import {DayzeTestBase} from "../utils/DayzeTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title ConfidentialTokenTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `ConfidentialToken` and `ConfidentialNative` on CoFHE mocks.
 * @dev Covers shield, decimals and dust, encrypted transfer, silent over-transfer,
 *      the unshield/claim round trip, and the claim replay guard.
 */
contract ConfidentialTokenTest is DayzeTestBase {
    /*//////////////////////////////////////////////////////////////
                           SHIELD AND DECIMALS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. Shielding 1,000 USDC credits 1000e6 and pulls the USDC
    function test_shieldUsdc() public {
        _mintAndShield(usdc, cusdc, employer, 1000e6);

        expectPlaintext(cusdc.confidentialBalanceOf(employer), 1000e6);
        assertEq(usdc.balanceOf(employer), 0);
        assertEq(usdc.balanceOf(address(cusdc)), 1000e6);
        assertEq(cusdc.decimals(), 6);
        assertEq(cusdc.rate(), 1);
    }

    /// @notice 2. Shielding 1.5 ARB (18 decimals) credits 1.5e6 and leaves dust with the sender
    function test_shieldArbScalesDecimalsAndSkipsDust() public {
        uint256 dust = 123;
        _mintAndShield(arb, carb, employer, 1.5e18 + dust);

        assertEq(carb.rate(), 1e12);
        assertEq(carb.decimals(), 6);
        expectPlaintext(carb.confidentialBalanceOf(employer), 1.5e6);
        assertEq(arb.balanceOf(employer), dust); // dust never pulled
        assertEq(arb.balanceOf(address(carb)), 1.5e18);
    }

    /// @notice 3. Shielding 1 ETH credits 1e6; dust is refunded; below `rate()` reverts
    function test_shieldNative() public {
        uint256 dust = 5;
        vm.deal(employer, 1 ether + dust);

        vm.prank(employer);
        ceth.shieldNative{value: 1 ether + dust}(employer);

        expectPlaintext(ceth.confidentialBalanceOf(employer), 1e6);
        assertEq(employer.balance, dust); // dust refunded
        assertEq(address(ceth).balance, 1 ether);
    }

    /// @notice 3b. A value below `rate()` (1e12 wei) can't be represented and reverts
    function test_shieldNativeBelowRateReverts() public {
        vm.deal(employer, 1e12 - 1);

        vm.prank(employer);
        vm.expectRevert(FHERC20NativeWrapperCore.AmountTooSmallForConfidentialPrecision.selector);
        ceth.shieldNative{value: 1e12 - 1}(employer);
    }

    /*//////////////////////////////////////////////////////////////
                          ENCRYPTED TRANSFERS
    //////////////////////////////////////////////////////////////*/

    /// @notice 4. Encrypted transfer moves the amount from employer to alice
    function test_confidentialTransfer() public {
        _mintAndShield(usdc, cusdc, employer, 1000e6);

        _sendEncrypted(employerClient, employer, alice, 300e6);

        expectPlaintext(cusdc.confidentialBalanceOf(employer), 700e6);
        expectPlaintext(cusdc.confidentialBalanceOf(alice), 300e6);
    }

    /// @notice 5. Sending more than the balance doesn't revert; it sends 0
    /// @dev A revert would leak "balance < amount" to anyone watching. Sending 0 leaks nothing.
    function test_overTransferSendsZero() public {
        _mintAndShield(usdc, cusdc, employer, 1000e6);

        _sendEncrypted(employerClient, employer, alice, 2000e6);

        expectPlaintext(cusdc.confidentialBalanceOf(employer), 1000e6);
        expectPlaintext(cusdc.confidentialBalanceOf(alice), 0);
    }

    /*//////////////////////////////////////////////////////////////
                           UNSHIELD AND CLAIM
    //////////////////////////////////////////////////////////////*/

    /// @notice 6. ERC20 round trip: unshield 100 USDC, decrypt, claim, receive USDC
    function test_unshieldAndClaimUsdc() public {
        _mintAndShield(usdc, cusdc, alice, 1000e6);

        vm.prank(alice);
        cusdc.unshield(alice, alice, 100e6);
        expectPlaintext(cusdc.confidentialBalanceOf(alice), 900e6);

        (bytes32 id, uint64 value, bytes memory proof) = _decryptLatestClaim(cusdc.getUserClaims(alice));
        assertEq(value, 100e6);

        vm.prank(alice);
        cusdc.claimUnshielded(id, value, proof);

        assertEq(usdc.balanceOf(alice), 100e6);
        assertTrue(cusdc.getClaim(id).claimed);
    }

    /// @notice 6b. Native round trip: unshield 0.4 cETH, decrypt, claim, receive 0.4 ETH
    function test_unshieldAndClaimNative() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        ceth.shieldNative{value: 1 ether}(alice);
        assertEq(alice.balance, 0);

        vm.prank(alice);
        ceth.unshield(alice, alice, 0.4e6);

        (bytes32 id, uint64 value, bytes memory proof) = _decryptLatestClaim(ceth.getUserClaims(alice));

        vm.prank(alice);
        ceth.claimUnshielded(id, value, proof);

        assertEq(alice.balance, 0.4 ether);
        expectPlaintext(ceth.confidentialBalanceOf(alice), 0.6e6);
    }

    /// @notice 7. Claiming the same id twice reverts
    function test_claimTwiceReverts() public {
        _mintAndShield(usdc, cusdc, alice, 1000e6);

        vm.prank(alice);
        cusdc.unshield(alice, alice, 100e6);
        (bytes32 id, uint64 value, bytes memory proof) = _decryptLatestClaim(cusdc.getUserClaims(alice));

        vm.prank(alice);
        cusdc.claimUnshielded(id, value, proof);

        vm.prank(alice);
        vm.expectRevert(FHERC20WrapperClaims.AlreadyClaimed.selector);
        cusdc.claimUnshielded(id, value, proof);

        assertEq(usdc.balanceOf(alice), 100e6); // paid once
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Encrypts `amount` as `fromClient` and sends it on cUSDC from `from` to `to`
    /// @param fromClient Client that signs the encrypted input
    /// @param from Sender address (must match `fromClient`)
    /// @param to Receiver address
    /// @param amount Plaintext amount, in 6-decimal units
    function _sendEncrypted(CofheClient fromClient, address from, address to, uint64 amount) internal {
        // Encrypt before the prank: this is an external call and would use up the prank.
        (externalEuint64 encAmount, bytes memory proof) = fromClient.createExternalEuint64(amount, address(cusdc));

        vm.prank(from);
        cusdc.confidentialTransfer(to, encAmount, proof);
    }

    /// @notice Decrypts the newest claim in `claims` the way the offchain service would
    /// @dev `unshield` calls `allowPublic` on the burned handle, so anyone can decrypt it
    /// @param claims The user's claims, from `getUserClaims`
    /// @return id The claim id to pass to `claimUnshielded`
    /// @return value The decrypted amount
    /// @return proof The threshold network's signature over the result
    function _decryptLatestClaim(ERC20ConfidentialLib.Claim[] memory claims)
        internal
        view
        returns (bytes32 id, uint64 value, bytes memory proof)
    {
        ERC20ConfidentialLib.Claim memory claim = claims[claims.length - 1];
        (, uint256 decrypted, bytes memory sig) = aliceClient.decryptForTx_withoutACP(claim.ctHash);
        return (claim.id, uint64(decrypted), sig);
    }
}
