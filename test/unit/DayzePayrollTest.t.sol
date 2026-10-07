// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title DayzePayrollTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `DayzePayroll` core on CoFHE mocks.
 * @dev Abstract: run by `DayzePayrollTest30Days` and `DayzePayrollTest600s` at the bottom of this file.
 *      Time is warped in fractions of `PERIOD`, so the same amounts hold for both periods.
 *      `DAY` is 1/30 of a period: 3,000/month accrues exactly 100 per `DAY`.
 */
abstract contract DayzePayrollTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice A monthly salary of 3,000 cUSDC
    uint64 internal constant MONTHLY = 3000e6;

    /// @notice What `MONTHLY` accrues in one `DAY`
    uint64 internal constant DAILY = 100e6;

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1/30 of the pay period
    /// @return Seconds in one "day"
    function _day() internal pure returns (uint64) {
        return _period() / 30;
    }

    /*//////////////////////////////////////////////////////////////
                                  ORGS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. `createOrg` stores the org; creating twice reverts
    function test_createOrg() public {
        vm.expectEmit(true, false, false, true, address(payroll));
        emit IDayzePayroll.OrgCreated(bob, "Bob Ltd");
        vm.prank(bob);
        payroll.createOrg("Bob Ltd");

        IDayzePayroll.Org memory org = payroll.orgOf(bob);
        assertEq(org.name, "Bob Ltd");
        assertTrue(org.exists);

        vm.prank(bob);
        vm.expectRevert(DayzePayroll.DayzePayroll__OrgExists.selector);
        payroll.createOrg("Again");
    }

    /// @notice 1b. `createStream` without an org reverts
    function test_createStream_revertsWithoutOrg() public {
        (externalEuint64 h, bytes memory p) = _encrypt(bobClient, MONTHLY);
        vm.prank(bob);
        vm.expectRevert(DayzePayroll.DayzePayroll__NoOrg.selector);
        payroll.createStream(alice, tUsdc, h, p);
    }

    /*//////////////////////////////////////////////////////////////
                            TOKEN ALLOWLIST
    //////////////////////////////////////////////////////////////*/

    /// @notice 2. `addToken` and `removeToken` are owner-only
    function test_tokenAllowlist_ownerOnly() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        payroll.addToken(tArb);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        payroll.removeToken(tUsdc);

        vm.expectEmit(true, false, false, false, address(payroll));
        emit IDayzePayroll.TokenAdded(tArb);
        payroll.addToken(tArb);
        assertTrue(payroll.s_supportedTokens(tArb));

        vm.expectRevert(DayzePayroll.DayzePayroll__TokenAlreadySupported.selector);
        payroll.addToken(tArb);

        vm.expectEmit(true, false, false, false, address(payroll));
        emit IDayzePayroll.TokenRemoved(tArb);
        payroll.removeToken(tArb);
        assertFalse(payroll.s_supportedTokens(tArb));
    }

    /// @notice 2b. `fundVault` and `createStream` with a token that isn't allowlisted revert
    function test_unsupportedToken_reverts() public {
        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, 1);

        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__UnsupportedToken.selector);
        payroll.fundVault(tArb, h, p);

        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__UnsupportedToken.selector);
        payroll.createStream(alice, tArb, h, p);
    }

    /// @notice 2c. Removing a token blocks new streams, but existing streams still withdraw
    function test_removeToken_existingStreamsStillWithdraw() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createActiveStream(tUsdc, MONTHLY);
        payroll.removeToken(tUsdc);

        vm.warp(block.timestamp + _day());
        _withdraw(id, DAILY);
        assertEq(_aliceBalance(tUsdc), DAILY);

        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, MONTHLY);
        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__UnsupportedToken.selector);
        payroll.createStream(alice, tUsdc, h, p);
    }

    /*//////////////////////////////////////////////////////////////
                                 VAULTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 3. Funding credits the vault; funding past your balance credits 0
    function test_fundVault() public {
        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, EMPLOYER_USDC);
        vm.expectEmit(true, true, false, true, address(payroll));
        emit IDayzePayroll.VaultFunded(employer, tUsdc);
        vm.prank(employer);
        payroll.fundVault(tUsdc, h, p);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC);
        expectPlaintext(cusdc.confidentialBalanceOf(address(payroll)), EMPLOYER_USDC);

        _fund(tUsdc, 1); // employer's cUSDC is now 0
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC);
    }

    /*//////////////////////////////////////////////////////////////
                                STREAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice 4. `createStream` stores the encrypted monthly salary; with no policy it resolves to Active
    function test_createStream() public {
        uint256 id = _createActiveStream(tUsdc, MONTHLY);

        IDayzePayroll.Stream memory s = payroll.getStream(id);
        expectPlaintext(s.monthly, MONTHLY);
        expectPlaintext(s.withdrawn, uint64(0));
        assertEq(s.payer, employer);
        assertEq(s.payee, alice);
        assertEq(address(s.token), address(tUsdc));
        assertEq(uint8(s.status), uint8(IDayzePayroll.Status.Active));
        assertEq(s.startTime, block.timestamp);

        assertEq(payroll.streamsOfPayer(employer).length, 1);
        assertEq(payroll.streamsOfPayer(employer)[0], id);
        assertEq(payroll.streamsOfPayee(alice)[0], id);
    }

    /// @notice 5. Withdrawing exactly the accrued amount pays it out
    function test_withdraw_accrued() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createActiveStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + _day());
        _withdraw(id, DAILY);

        assertEq(_aliceBalance(tUsdc), DAILY);
        expectPlaintext(payroll.getStream(id).withdrawn, DAILY);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - DAILY);
    }

    /// @notice 6. A 1 cETH/month stream accrues 0.5 cETH in half a period, not 0
    function test_withdraw_lowUnitAsset() public {
        _shieldEth(1e6);
        _fund(tEth, 1e6);
        uint256 id = _createActiveStream(tEth, 1e6);

        vm.warp(block.timestamp + _period() / 2);
        _withdraw(id, 5e5 + 1); // one unit more than accrued
        assertEq(_aliceBalance(tEth), 0);

        _withdraw(id, 5e5);
        assertEq(_aliceBalance(tEth), 5e5);
    }

    /// @notice 7. Vaults are per token: a cETH stream can't spend the cUSDC vault
    function test_withdraw_vaultsArePerToken() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createActiveStream(tEth, 1e6);

        vm.warp(block.timestamp + _period() / 2);
        _withdraw(id, 5e5);

        assertEq(_aliceBalance(tEth), 0);
        assertEq(_aliceBalance(tUsdc), 0);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC);
        expectPlaintext(payroll.getStream(id).withdrawn, uint64(0));
    }

    /// @notice 8. Asking for more than accrued pays 0 and doesn't revert
    function test_withdraw_overWithdrawPaysZero() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createActiveStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + _day());
        _withdraw(id, DAILY + 1);

        assertEq(_aliceBalance(tUsdc), 0);
        expectPlaintext(payroll.getStream(id).withdrawn, uint64(0));
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC);
    }

    /// @notice 9. Underfunded vault: fund 100, accrue 200, ask 150 → pays 0
    function test_withdraw_underfundedVaultPaysZero() public {
        _fund(tUsdc, 100e6);
        uint256 id = _createActiveStream(tUsdc, 2 * MONTHLY);

        vm.warp(block.timestamp + _day()); // accrued 200
        _withdraw(id, 150e6);
        assertEq(_aliceBalance(tUsdc), 0);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), uint64(100e6));

        _withdraw(id, 100e6); // fits both
        assertEq(_aliceBalance(tUsdc), 100e6);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), uint64(0));
    }

    /// @notice 10. Only the payee can withdraw
    function test_withdraw_revertsForNonPayee() public {
        uint256 id = _createActiveStream(tUsdc, MONTHLY);
        (externalEuint64 h, bytes memory p) = _encrypt(bobClient, 1);

        vm.prank(bob);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotPayee.selector);
        payroll.withdraw(id, h, p);
    }

    /// @notice 10b. Withdrawing from a stream that doesn't exist reverts
    function test_withdraw_revertsOnUnknownStream() public {
        (externalEuint64 h, bytes memory p) = _encrypt(aliceClient, 1);

        vm.prank(alice);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotPayee.selector);
        payroll.withdraw(42, h, p);
    }

    /*//////////////////////////////////////////////////////////////
                                 CANCEL
    //////////////////////////////////////////////////////////////*/

    /// @notice 11. Cancel freezes accrual; what accrued before stays withdrawable
    function test_cancel_freezesAccrual() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createActiveStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + _day());
        vm.expectEmit(true, false, false, false, address(payroll));
        emit IDayzePayroll.StreamCancelled(id);
        vm.prank(employer);
        payroll.cancelStream(id);

        IDayzePayroll.Stream memory s = payroll.getStream(id);
        assertEq(uint8(s.status), uint8(IDayzePayroll.Status.Cancelled));
        assertEq(s.endTime, block.timestamp);

        vm.warp(block.timestamp + 10 * _day());
        _withdraw(id, DAILY + 1); // more than accrued at cancel
        assertEq(_aliceBalance(tUsdc), 0);

        _withdraw(id, DAILY);
        assertEq(_aliceBalance(tUsdc), DAILY);
    }

    /// @notice 11b. Only the payer can cancel, and only once
    function test_cancel_reverts() public {
        uint256 id = _createActiveStream(tUsdc, MONTHLY);

        vm.prank(bob);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotPayer.selector);
        payroll.cancelStream(id);

        vm.prank(employer);
        payroll.cancelStream(id);

        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotCancellable.selector);
        payroll.cancelStream(id);
    }

    /*//////////////////////////////////////////////////////////////
                                  ACL
    //////////////////////////////////////////////////////////////*/

    /// @notice 12. Payee, payer and auditors can read the salary; bob can't
    function test_acl() public {
        vm.prank(employer);
        registry.addAuditor(bob);
        address auditor = bob;

        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createActiveStream(tUsdc, MONTHLY);
        euint64 monthly = payroll.getStream(id).monthly;
        assertTrue(FHE.isAllowed(monthly, alice));
        assertTrue(FHE.isAllowed(monthly, employer));
        assertTrue(FHE.isAllowed(monthly, auditor));
        assertTrue(FHE.isAllowed(payroll.vaultOf(employer, tUsdc), auditor));
        assertFalse(FHE.isAllowed(payroll.vaultOf(employer, tUsdc), alice));

        vm.prank(employer);
        registry.removeAuditor(bob);
        uint256 id2 = _createActiveStream(tUsdc, MONTHLY);
        assertFalse(FHE.isAllowed(payroll.getStream(id2).monthly, bob));

        vm.warp(block.timestamp + _day());
        _withdraw(id, DAILY);
        euint64 withdrawn = payroll.getStream(id).withdrawn;
        assertTrue(FHE.isAllowed(withdrawn, alice));
        assertTrue(FHE.isAllowed(withdrawn, employer));
        assertFalse(FHE.isAllowed(withdrawn, bob));
    }
}

/// @notice Runs `DayzePayrollTest` with a 30-day period
contract DayzePayrollTest30Days is DayzePayrollTest {
    function _period() internal pure override returns (uint64) {
        return 30 days;
    }
}

/// @notice Runs `DayzePayrollTest` with the 600s demo period
contract DayzePayrollTest600s is DayzePayrollTest {
    function _period() internal pure override returns (uint64) {
        return 600;
    }
}
