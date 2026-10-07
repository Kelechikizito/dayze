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
 * @notice Fuzzes `withdraw`: payroll never pays more than accrued or more than funded.
 * @dev Abstract: run by `DayzePayrollFuzzTest30Days` and `DayzePayrollFuzzTest600s` below.
 *      `dt` is capped at 10 periods so `monthly * dt / PERIOD` fits in 64 bits.
 */
abstract contract DayzePayrollFuzzTest is PayrollTestBase {
    /// @notice A withdraw pays `req` if it fits both accrued and funded, else 0
    /// @param monthly Monthly salary
    /// @param dt Seconds since the stream started
    /// @param req Amount requested
    /// @param funded Amount in the vault
    function testFuzz_neverOverpays(uint64 monthly, uint32 dt, uint64 req, uint64 funded) public {
        monthly = uint64(bound(monthly, 1, type(uint64).max / 10));
        dt = uint32(bound(dt, 0, 10 * uint256(_period())));
        funded = uint64(bound(funded, 0, EMPLOYER_USDC));

        _fund(tUsdc, funded);
        uint256 id = _createActiveStream(tUsdc, monthly);
        vm.warp(block.timestamp + dt);
        _withdraw(id, req);

        uint256 accrued = uint256(monthly) * dt / _period();
        uint64 expected = (req <= accrued && req <= funded) ? req : 0;
        uint64 paid = _aliceBalance(tUsdc);

        assertEq(paid, expected);
        assertLe(paid, accrued);
        assertLe(paid, funded);
        expectPlaintext(payroll.getStream(id).withdrawn, paid);
        expectPlaintext(payroll.vaultOf(employer, tUsdc), funded - paid);
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
