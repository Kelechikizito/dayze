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
 *      `DAY` is 1/30 of a period: a fully funded 3,000/month stream streams exactly 100 per `DAY`.
 */
abstract contract DayzePayrollTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice A monthly salary of 3,000 cUSDC
    uint64 internal constant MONTHLY = 3000e6;

    /// @notice What `MONTHLY` streams in one `DAY`
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
        uint256 id = _createFundedStream(tUsdc, MONTHLY);
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

    /// @notice 5. Withdrawing exactly what streamed pays it out; the vault already paid at payroll time
    function test_withdraw_streamed() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createFundedStream(tUsdc, MONTHLY);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - MONTHLY);

        vm.warp(block.timestamp + _day());
        _withdraw(id, DAILY);

        assertEq(_aliceBalance(tUsdc), DAILY);
        expectPlaintext(payroll.getStream(id).withdrawn, DAILY);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - MONTHLY);
    }

    /// @notice 6. A 1 cETH/month stream streams 0.5 cETH in half a period, not 0
    function test_withdraw_lowUnitAsset() public {
        _shieldEth(1e6);
        _fund(tEth, 1e6);
        uint256 id = _createFundedStream(tEth, 1e6);

        vm.warp(block.timestamp + _period() / 2);
        _withdraw(id, 5e5 + 1); // one unit more than streamed
        assertEq(_aliceBalance(tEth), 0);

        _withdraw(id, 5e5);
        assertEq(_aliceBalance(tEth), 5e5);
    }

    /// @notice 7. Vaults are per token: payroll can't run for cETH from the cUSDC vault
    function test_runPayroll_vaultsArePerToken() public {
        _fund(tUsdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 id = _createActiveStream(tEth, 1e6);

        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, 1e6);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__VaultNotFunded.selector);
        payroll.runPayroll(tEth, h, p, ids);

        vm.warp(block.timestamp + _period() / 2);
        _withdraw(id, 5e5);
        assertEq(_aliceBalance(tEth), 0);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC);
    }

    /// @notice 8. Asking for more than streamed pays 0 and doesn't revert
    function test_withdraw_overWithdrawPaysZero() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createFundedStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + _day());
        _withdraw(id, DAILY + 1);

        assertEq(_aliceBalance(tUsdc), 0);
        expectPlaintext(payroll.getStream(id).withdrawn, uint64(0));
    }

    /// @notice 9. The budget is capped at the vault: fund 100, budget 6,000 → 100 set aside, streamed by period end
    function test_runPayroll_budgetCappedAtVault() public {
        _fund(tUsdc, 100e6);
        _warpToPeriodStart();
        uint256 id = _createActiveStream(tUsdc, 2 * MONTHLY);
        _runPayroll(tUsdc, 2 * MONTHLY, id);

        expectPlaintext(payroll.getStream(id).allocated, uint64(100e6));
        expectPlaintext(payroll.vaultOf(employer, tUsdc), uint64(0));

        vm.warp(block.timestamp + _period());
        _withdraw(id, 100e6 + 1);
        assertEq(_aliceBalance(tUsdc), 0);
        _withdraw(id, 100e6);
        assertEq(_aliceBalance(tUsdc), 100e6);
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

    /// @notice 11. Cancel keeps what streamed for the payee and returns the rest of the allocation to the vault
    function test_cancel_refundsUnstreamed() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createFundedStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + _day());
        vm.expectEmit(true, false, false, false, address(payroll));
        emit IDayzePayroll.StreamCancelled(id);
        vm.prank(employer);
        payroll.cancelStream(id);

        IDayzePayroll.Stream memory s = payroll.getStream(id);
        assertEq(uint8(s.status), uint8(IDayzePayroll.Status.Cancelled));
        assertEq(s.endTime, block.timestamp);
        expectPlaintext(s.banked, DAILY);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - DAILY);

        vm.warp(block.timestamp + 10 * _day());
        _withdraw(id, DAILY + 1); // more than streamed before the cancel
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
        uint256 id = _createFundedStream(tUsdc, MONTHLY);
        euint64 monthly = payroll.getStream(id).monthly;
        euint64 allocated = payroll.getStream(id).allocated;
        assertTrue(FHE.isAllowed(allocated, alice));
        assertTrue(FHE.isAllowed(allocated, employer));
        assertTrue(FHE.isAllowed(allocated, auditor));
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

    /*//////////////////////////////////////////////////////////////
                                PAYROLL
    //////////////////////////////////////////////////////////////*/

    /// @notice 13. A short budget is shared in order: 4,000 for two 3,000 salaries → 3,000 and 1,000
    function test_runPayroll_sharesBudgetInOrder() public {
        _fund(tUsdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256[] memory ids = new uint256[](2);
        ids[0] = _createActiveStream(tUsdc, MONTHLY);
        ids[1] = _createActiveStream(tUsdc, MONTHLY);

        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, 4000e6);
        vm.expectEmit(true, true, false, true, address(payroll));
        emit IDayzePayroll.PayrollRun(employer, tUsdc, uint64(block.timestamp + _period()), 2);
        vm.prank(employer);
        payroll.runPayroll(tUsdc, h, p, ids);

        expectPlaintext(payroll.getStream(ids[0]).allocated, MONTHLY);
        expectPlaintext(payroll.getStream(ids[1]).allocated, uint64(1000e6));
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - 4000e6);
    }

    /// @notice 14. Pay stops at what was set aside: two periods later, only one salary has streamed
    function test_streaming_stopsAtAllocation() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createFundedStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + 2 * _period());
        _withdraw(id, MONTHLY + 1);
        assertEq(_aliceBalance(tUsdc), 0);
        _withdraw(id, MONTHLY);
        assertEq(_aliceBalance(tUsdc), MONTHLY);
    }

    /// @notice 15. Next period: the last allocation is banked and stays withdrawable alongside the new one
    function test_runPayroll_nextPeriodBanksUnclaimed() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createFundedStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + _period()); // next period starts
        _runPayroll(tUsdc, MONTHLY, id);
        expectPlaintext(payroll.getStream(id).banked, MONTHLY);
        expectPlaintext(payroll.getStream(id).allocated, MONTHLY);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - 2 * MONTHLY);

        vm.warp(block.timestamp + 15 * _day());
        _withdraw(id, MONTHLY + 15 * DAILY);
        assertEq(_aliceBalance(tUsdc), MONTHLY + 15 * DAILY);
    }

    /// @notice 16. Funded mid-period: the salary is pro rata for the time left, streamed by the period's end
    function test_runPayroll_midPeriodIsProRata() public {
        _fund(tUsdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        vm.warp(block.timestamp + 15 * _day());
        uint256 id = _createActiveStream(tUsdc, MONTHLY);
        _runPayroll(tUsdc, MONTHLY, id);

        expectPlaintext(payroll.getStream(id).allocated, 15 * DAILY);

        vm.warp(block.timestamp + 5 * _day());
        _withdraw(id, 5 * DAILY);
        assertEq(_aliceBalance(tUsdc), 5 * DAILY);
    }

    /// @notice 17. Unused budget stays in the vault
    function test_runPayroll_unusedBudgetStaysInVault() public {
        _fund(tUsdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 id = _createActiveStream(tUsdc, MONTHLY);
        _runPayroll(tUsdc, 5000e6, id);

        expectPlaintext(payroll.getStream(id).allocated, MONTHLY);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - MONTHLY);
    }

    /// @notice 18. Funding a stream twice in one period reverts; a stream started later can still be funded
    function test_runPayroll_revertsWhenAlreadyFunded() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 first = _createFundedStream(tUsdc, MONTHLY);

        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, MONTHLY);
        uint256[] memory ids = new uint256[](1);
        ids[0] = first;
        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__AlreadyFunded.selector);
        payroll.runPayroll(tUsdc, h, p, ids);

        uint256 second = _createActiveStream(tUsdc, MONTHLY);
        _runPayroll(tUsdc, MONTHLY, second);
        expectPlaintext(payroll.getStream(second).allocated, MONTHLY);
    }

    /// @notice 19. Only the payer's own Active streams in the given token can be funded
    function test_runPayroll_reverts() public {
        _fund(tUsdc, EMPLOYER_USDC);
        _shieldEth(1e6);
        _fund(tEth, 1e6);
        _warpToPeriodStart();
        uint256 active = _createActiveStream(tUsdc, MONTHLY);
        uint256 awaiting = _createStream(tUsdc, MONTHLY);
        uint256[] memory ids = new uint256[](1);
        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, MONTHLY);

        ids[0] = awaiting;
        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotActive.selector);
        payroll.runPayroll(tUsdc, h, p, ids);

        ids[0] = active;
        vm.prank(employer);
        vm.expectRevert(DayzePayroll.DayzePayroll__WrongToken.selector);
        payroll.runPayroll(tEth, h, p, ids);

        (externalEuint64 hb, bytes memory pb) = _encrypt(bobClient, MONTHLY);
        vm.prank(bob);
        vm.expectRevert(DayzePayroll.DayzePayroll__NoOrg.selector);
        payroll.runPayroll(tUsdc, hb, pb, ids);

        vm.prank(bob);
        payroll.createOrg("Bob Ltd");
        _mintAndShield(usdc, cusdc, bob, 100e6);
        vm.startPrank(bob);
        cusdc.setOperator(address(payroll), type(uint48).max);
        vm.stopPrank();
        (externalEuint64 hf, bytes memory pf) = _encrypt(bobClient, 100e6);
        vm.prank(bob);
        payroll.fundVault(tUsdc, hf, pf);
        (hb, pb) = _encrypt(bobClient, MONTHLY);
        vm.prank(bob);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotPayer.selector);
        payroll.runPayroll(tUsdc, hb, pb, ids);
    }

    /// @notice 20. Cancelling after the period ended banks the whole allocation and refunds nothing
    function test_cancel_afterPeriodBanksAll() public {
        _fund(tUsdc, EMPLOYER_USDC);
        uint256 id = _createFundedStream(tUsdc, MONTHLY);

        vm.warp(block.timestamp + _period() + _day());
        vm.prank(employer);
        payroll.cancelStream(id);

        expectPlaintext(payroll.getStream(id).banked, MONTHLY);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), EMPLOYER_USDC - MONTHLY);
        _withdraw(id, MONTHLY);
        assertEq(_aliceBalance(tUsdc), MONTHLY);
    }

    /// @notice 21. `periodEnd` rounds up to the next multiple of `PERIOD`
    function test_periodEnd() public view {
        uint64 p = _period();
        assertEq(payroll.periodEnd(0), p);
        assertEq(payroll.periodEnd(p - 1), p);
        assertEq(payroll.periodEnd(p), 2 * p);
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
