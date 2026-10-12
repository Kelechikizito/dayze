// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title DayzePayrollFuzzTest
 * @author Kelechi Kizito Ugwu
 * @notice Fuzzes payroll runs and `withdraw`: a payee is never paid more than streamed, and a stream
 *         never streams more than its salary, the budget or the vault.
 * @dev Abstract: run by `DayzePayrollFuzzTest30Days` and `DayzePayrollFuzzTest600s` below.
 *      The stream is funded at the start of a period, so its allocation is min(salary, budget, vault).
 */
abstract contract DayzePayrollFuzzTest is PayrollTestBase {
    /// @notice A withdraw pays `req` if it fits what streamed, else 0. Streaming stops at the allocation.
    /// @param monthly Monthly salary
    /// @param budget Payroll budget for the period
    /// @param funded Amount in the vault
    /// @param dt Seconds since payroll ran, up to two periods
    /// @param req Amount requested
    function testFuzz_neverOverpays(uint64 monthly, uint64 budget, uint64 funded, uint32 dt, uint64 req) public {
        monthly = uint64(bound(monthly, 1, type(uint64).max));
        funded = uint64(bound(funded, 1, EMPLOYER_USDC));
        dt = uint32(bound(dt, 0, 2 * uint256(_period())));

        _fund(tUsdc, funded);
        uint256 id = _createFundedStreamWithBudget(monthly, budget);
        vm.warp(block.timestamp + dt);
        _withdraw(id, req);

        uint256 allocation = _min(_min(monthly, budget), funded);
        uint256 elapsed = dt < _period() ? dt : _period();
        uint256 streamed = allocation * elapsed / _period();
        uint64 expected = req <= streamed ? req : 0;
        uint64 paid = _aliceBalance(tUsdc);

        assertEq(paid, expected);
        assertLe(paid, allocation);
        expectPlaintext(payroll.getStream(id).allocated, uint64(allocation));
        expectPlaintext(payroll.getStream(id).withdrawn, paid);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), uint64(funded - allocation));
    }

    /// @notice Creates an Active stream at a period start and runs payroll for it with `budget`
    /// @param monthly Monthly salary
    /// @param budget Payroll budget
    /// @return id The stream id
    function _createFundedStreamWithBudget(uint64 monthly, uint64 budget) internal returns (uint256 id) {
        _warpToPeriodStart();
        id = _createActiveStream(tUsdc, monthly);
        _runPayroll(tUsdc, budget, id);
    }

    /// @notice The smaller of two numbers
    /// @param a First number
    /// @param b Second number
    /// @return The minimum
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

/// @notice Runs `DayzePayrollFuzzTest` with a 30-day period
contract DayzePayrollFuzzTest30Days is DayzePayrollFuzzTest {
    function _period() internal pure override returns (uint64) {
        return 30 days;
    }
}

/// @notice Runs `DayzePayrollFuzzTest` with the 600s demo period
contract DayzePayrollFuzzTest600s is DayzePayrollFuzzTest {
    function _period() internal pure override returns (uint64) {
        return 600;
    }
}
