// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {FHE, ebool, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title PayrollApprovalsTest
 * @author Kelechi Kizito Ugwu
 * @notice Tests the payroll ↔ ApprovalPolicy flow: policy check, resolve, k-of-n approval, activate.
 * @dev The employer requires 2 of 2 approvers for cUSDC salaries above 5,000/month.
 */
contract PayrollApprovalsTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The employer's hidden cUSDC threshold
    uint64 internal constant THRESHOLD = 5000e6;

    /// @notice A salary under the threshold
    uint64 internal constant LOW = 3000e6;

    /// @notice A salary over the threshold; accrues 200 per `DAY`
    uint64 internal constant HIGH = 6000e6;

    /// @notice 1/30 of the period
    uint64 internal constant DAY = 1 days;

    /// @notice The employer's two approvers
    address internal approver1;
    address internal approver2;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a 2-of-2 policy with a 5,000 cUSDC threshold and funds the vault
    function setUp() public override {
        super.setUp();
        approver1 = makeAddr("approver1");
        approver2 = makeAddr("approver2");

        address[] memory approvers = new address[](2);
        approvers[0] = approver1;
        approvers[1] = approver2;
        vm.prank(employer);
        policy.setPolicy(approvers, 2);

        (externalEuint64 h, bytes memory p) = employerClient.createExternalEuint64(THRESHOLD, address(policy));
        vm.prank(employer);
        policy.setThreshold(address(cusdc), h, p);

        _fund(tUsdc, EMPLOYER_USDC);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc PayrollTestBase
    function _period() internal pure override returns (uint64) {
        return 30 days;
    }

    /// @notice Returns a stream's status
    /// @param id The stream
    /// @return The status
    function _status(uint256 id) internal view returns (IDayzePayroll.Status) {
        return payroll.getStream(id).status;
    }

    /// @notice Both approvers approve stream `id`
    /// @param id The stream
    function _approveBoth(uint256 id) internal {
        vm.prank(approver1);
        policy.approve(employer, id);
        vm.prank(approver2);
        policy.approve(employer, id);
    }

    /// @notice Asserts that alice can't withdraw from stream `id`
    /// @param id The stream
    function _expectWithdrawReverts(uint256 id) internal {
        (externalEuint64 h, bytes memory p) = _encrypt(aliceClient, 1);
        vm.prank(alice);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotWithdrawable.selector);
        payroll.withdraw(id, h, p);
    }

    /*//////////////////////////////////////////////////////////////
                                 TESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. Under the threshold: AwaitingPolicy → resolve(false) → Active, starting at resolve time
    function test_underThreshold_activatesOnResolve() public {
        uint256 id = _createStream(tUsdc, LOW);
        assertEq(uint8(_status(id)), uint8(IDayzePayroll.Status.AwaitingPolicy));
        _expectWithdrawReverts(id);

        vm.warp(block.timestamp + 1 hours); // decryption takes time on a live network
        (bool needsApproval, bytes memory sig) = _decryptPolicyBit(id);
        assertFalse(needsApproval);

        vm.expectEmit(true, false, false, true, address(payroll));
        emit IDayzePayroll.StreamActivated(id, uint64(block.timestamp));
        payroll.resolvePolicy(id, needsApproval, sig);

        assertEq(uint8(_status(id)), uint8(IDayzePayroll.Status.Active));
        assertEq(payroll.getStream(id).startTime, block.timestamp);
    }

    /// @notice 2. Over the threshold: resolve(true) → Pending; needs 2 of 2 approvals to activate
    function test_overThreshold_needsApprovals() public {
        uint256 id = _createStream(tUsdc, HIGH);
        (bool needsApproval, bytes memory sig) = _decryptPolicyBit(id);
        assertTrue(needsApproval);

        vm.expectEmit(true, false, false, false, address(payroll));
        emit IDayzePayroll.StreamPending(id);
        payroll.resolvePolicy(id, needsApproval, sig);
        assertEq(uint8(_status(id)), uint8(IDayzePayroll.Status.Pending));
        _expectWithdrawReverts(id);

        vm.expectRevert(DayzePayroll.DayzePayroll__NotEnoughApprovals.selector);
        payroll.activateApproved(id);

        vm.prank(approver1);
        policy.approve(employer, id);
        vm.expectRevert(DayzePayroll.DayzePayroll__NotEnoughApprovals.selector);
        payroll.activateApproved(id);

        vm.prank(approver2);
        policy.approve(employer, id);
        payroll.activateApproved(id);
        assertEq(uint8(_status(id)), uint8(IDayzePayroll.Status.Active));

        vm.expectRevert(DayzePayroll.DayzePayroll__NotPending.selector);
        payroll.activateApproved(id);
    }

    /// @notice 3. Nothing accrues while Pending; accrual counts from activation
    function test_noAccrualWhilePending() public {
        uint256 id = _createStream(tUsdc, HIGH);
        _resolve(id);

        vm.warp(block.timestamp + DAY);
        _approveBoth(id);
        payroll.activateApproved(id);

        _withdraw(id, 1); // nothing accrued yet
        assertEq(_aliceBalance(tUsdc), 0);

        vm.warp(block.timestamp + DAY);
        _withdraw(id, 200e6 + 1); // more than one day's pay
        assertEq(_aliceBalance(tUsdc), 0);
        _withdraw(id, 200e6);
        assertEq(_aliceBalance(tUsdc), 200e6);
    }

    /// @notice 4. Cancelling a Pending stream blocks activation, and it never accrues
    function test_cancelPending() public {
        uint256 id = _createStream(tUsdc, HIGH);
        _resolve(id);
        _approveBoth(id);

        vm.prank(employer);
        payroll.cancelStream(id);
        IDayzePayroll.Stream memory s = payroll.getStream(id);
        assertEq(uint8(s.status), uint8(IDayzePayroll.Status.Cancelled));
        assertEq(s.endTime, s.startTime);

        vm.expectRevert(DayzePayroll.DayzePayroll__NotPending.selector);
        payroll.activateApproved(id);

        vm.warp(block.timestamp + 10 * DAY);
        _withdraw(id, 1);
        assertEq(_aliceBalance(tUsdc), 0);
    }

    /// @notice 5. Only the policy bit is public; the salary is not
    function test_onlyPolicyBitIsPublic() public {
        uint256 id = _createStream(tUsdc, HIGH);
        IDayzePayroll.Stream memory s = payroll.getStream(id);

        // Anyone can decrypt the bit without a permit
        (, uint256 bit,) = bobClient.decryptForTx_withoutACP(ebool.unwrap(s.needsApproval));
        assertEq(bit, 1);

        // ...but not the salary
        vm.expectRevert();
        bobClient.decryptForTx_withoutACP(euint64.unwrap(s.monthly));

        // The policy only had the salary for the length of the `evaluate` call
        assertFalse(FHE.isAllowed(s.monthly, address(policy)));
    }
}
