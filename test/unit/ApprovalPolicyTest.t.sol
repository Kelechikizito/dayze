// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, ebool, euint64, externalEuint64, sharedEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {IApprovalPolicy} from "src/interfaces/IApprovalPolicy.sol";
import {PayrollHarness} from "../mocks/PayrollHarness.sol";
import {DayzeTestBase} from "../utils/DayzeTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title ApprovalPolicyTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `ApprovalPolicy` on CoFHE mocks.
 * @dev `PayrollHarness` stands in for payroll, so `evaluate` can be tested before `DayzePayroll` exists.
 *      Amounts are in 6-decimal units: 10_000e6 is 10,000 cUSDC, 1e6 is 1 cETH.
 */
contract ApprovalPolicyTest is DayzeTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    ApprovalPolicy internal policy;

    /// @notice Stand-in for payroll, the only caller allowed to use `evaluate`
    PayrollHarness internal harness;

    /// @notice A stream id used in approval tests
    uint256 internal constant STREAM_ID = 1;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the shared base, the policy and the harness, and wires the harness as payroll
    function setUp() public override {
        super.setUp();
        policy = new ApprovalPolicy();
        harness = new PayrollHarness(policy);
        policy.setPayroll(address(harness));
        vm.label(address(policy), "ApprovalPolicy");
        vm.label(address(harness), "PayrollHarness");
    }

    /*//////////////////////////////////////////////////////////////
                               THRESHOLDS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. `setThreshold` stores the encrypted value; only the payer can read it
    function test_setThreshold() public {
        (externalEuint64 handle, bytes memory proof) = employerClient.createExternalEuint64(10_000e6, address(policy));
        vm.expectEmit(true, true, false, false, address(policy));
        emit IApprovalPolicy.ThresholdSet(employer, address(cusdc));
        vm.prank(employer);
        policy.setThreshold(address(cusdc), handle, proof);

        assertTrue(policy.hasThreshold(employer, address(cusdc)));
        assertFalse(policy.hasThreshold(employer, address(ceth)));

        euint64 threshold = policy.thresholdOf(employer, address(cusdc));
        expectPlaintext(threshold, uint64(10_000e6));
        assertTrue(FHE.isAllowed(threshold, employer));
        assertFalse(FHE.isAllowed(threshold, bob));
    }

    /// @notice 1b. A threshold for the zero token reverts
    function test_setThreshold_revertsOnZeroToken() public {
        (externalEuint64 handle, bytes memory proof) = employerClient.createExternalEuint64(1, address(policy));
        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__ZeroAddress.selector);
        policy.setThreshold(address(0), handle, proof);
    }

    /*//////////////////////////////////////////////////////////////
                                EVALUATE
    //////////////////////////////////////////////////////////////*/

    /// @notice 2. Above the threshold needs approval; below or equal doesn't (it's `gt`)
    function test_evaluate_comparesAgainstThreshold() public {
        _setTwoOfTwoPolicy();
        _setThreshold(address(cusdc), 10_000e6);

        expectPlaintext(_evaluate(address(cusdc), 12_000e6), true);
        expectPlaintext(_evaluate(address(cusdc), 8_000e6), false);
        expectPlaintext(_evaluate(address(cusdc), 10_000e6), false);
    }

    /// @notice 3. With no policy, nothing needs approval, even with a threshold set
    function test_evaluate_noPolicyIsFalse() public {
        _setThreshold(address(cusdc), 10_000e6);

        expectPlaintext(_evaluate(address(cusdc), 50_000e6), false);
    }

    /// @notice 4. With a policy but no threshold for the token, approval is needed (fail closed)
    function test_evaluate_missingThresholdFailsClosed() public {
        _setTwoOfTwoPolicy();
        _setThreshold(address(cusdc), 10_000e6);

        expectPlaintext(_evaluate(address(ceth), 1), true);
    }

    /// @notice 5. Thresholds are per token: 1 cETH is under a 2 cETH threshold, whatever cUSDC's is
    function test_evaluate_thresholdsArePerToken() public {
        _setTwoOfTwoPolicy();
        _setThreshold(address(cusdc), 10_000e6);
        _setThreshold(address(ceth), 2e6);

        expectPlaintext(_evaluate(address(ceth), 1e6), false);
        expectPlaintext(_evaluate(address(ceth), 3e6), true);
    }

    /// @notice 5b. The result is allowed to payroll, so payroll can use it in later transactions
    function test_evaluate_resultAllowedToPayroll() public {
        _setTwoOfTwoPolicy();
        _setThreshold(address(cusdc), 10_000e6);

        ebool result = _evaluate(address(cusdc), 12_000e6);
        assertTrue(FHE.isAllowed(result, address(harness)));
        assertFalse(FHE.isAllowed(result, bob));
    }

    /// @notice 6. Only payroll can call `evaluate`
    function test_evaluate_revertsForNonPayroll() public {
        vm.prank(bob);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__NotPayroll.selector);
        policy.evaluate(employer, address(cusdc), sharedEuint64.wrap(bytes32(0)));
    }

    /*//////////////////////////////////////////////////////////////
                               SET PAYROLL
    //////////////////////////////////////////////////////////////*/

    /// @notice 6b. Payroll is set once, by the owner, and never to zero
    function test_setPayroll_ownerOnlyAndOnce() public {
        ApprovalPolicy fresh = new ApprovalPolicy();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        fresh.setPayroll(address(harness));

        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__ZeroAddress.selector);
        fresh.setPayroll(address(0));

        fresh.setPayroll(address(harness));
        assertEq(fresh.payroll(), address(harness));

        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__PayrollAlreadySet.selector);
        fresh.setPayroll(bob);
    }

    /*//////////////////////////////////////////////////////////////
                                APPROVALS
    //////////////////////////////////////////////////////////////*/

    /// @notice 7. Approvers approve once each; the count goes up; others can't approve
    function test_approve() public {
        _setTwoOfTwoPolicy();

        vm.prank(bob);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__NotApprover.selector);
        policy.approve(employer, STREAM_ID);

        vm.expectEmit(true, true, true, true, address(policy));
        emit IApprovalPolicy.Approved(employer, STREAM_ID, alice, 1);
        vm.prank(alice);
        policy.approve(employer, STREAM_ID);
        assertEq(policy.approvalCount(employer, STREAM_ID), 1);
        assertTrue(policy.hasApproved(employer, STREAM_ID, alice));

        vm.prank(alice);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__AlreadyApproved.selector);
        policy.approve(employer, STREAM_ID);

        vm.prank(employer);
        policy.approve(employer, STREAM_ID);
        assertEq(policy.approvalCount(employer, STREAM_ID), 2);
        assertEq(policy.approvalCount(employer, STREAM_ID + 1), 0);
    }

    /// @notice 7b. A new policy drops old approvers and their approvals
    function test_newPolicyResetsApprovals() public {
        _setTwoOfTwoPolicy();
        vm.prank(alice);
        policy.approve(employer, STREAM_ID);

        address[] memory approvers = new address[](2);
        approvers[0] = employer;
        approvers[1] = bob;
        vm.prank(employer);
        policy.setPolicy(approvers, 2);

        assertEq(policy.approvalCount(employer, STREAM_ID), 0);
        assertFalse(policy.isApprover(employer, alice));
        assertTrue(policy.isApprover(employer, bob));

        vm.prank(alice);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__NotApprover.selector);
        policy.approve(employer, STREAM_ID);
    }

    /*//////////////////////////////////////////////////////////////
                               SET POLICY
    //////////////////////////////////////////////////////////////*/

    /// @notice 8a. A valid policy is stored and readable
    function test_setPolicy() public {
        vm.expectEmit(true, false, false, true, address(policy));
        emit IApprovalPolicy.PolicySet(employer, 2, 2);
        _setTwoOfTwoPolicy();

        assertTrue(policy.hasPolicy(employer));
        assertFalse(policy.hasPolicy(bob));
        assertEq(policy.required(employer), 2);
        address[] memory approvers = policy.approversOf(employer);
        assertEq(approvers.length, 2);
        assertEq(approvers[0], employer);
        assertEq(approvers[1], alice);
    }

    /// @notice 8b. `required` must be at least 1 and at most the number of approvers
    function test_setPolicy_revertsOnBadRequired() public {
        address[] memory approvers = new address[](2);
        approvers[0] = employer;
        approvers[1] = alice;

        vm.startPrank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__InvalidRequired.selector);
        policy.setPolicy(approvers, 0);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__InvalidRequired.selector);
        policy.setPolicy(approvers, 3);
        vm.stopPrank();
    }

    /// @notice 8c. Zero and duplicate approvers revert
    function test_setPolicy_revertsOnBadApprovers() public {
        address[] memory approvers = new address[](2);

        approvers[0] = alice;
        approvers[1] = address(0);
        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__ZeroAddress.selector);
        policy.setPolicy(approvers, 1);

        approvers[1] = alice;
        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__DuplicateApprover.selector);
        policy.setPolicy(approvers, 1);
    }

    /// @notice 8d. More than `MAX_APPROVERS` reverts
    function test_setPolicy_revertsOnTooManyApprovers() public {
        address[] memory approvers = new address[](policy.MAX_APPROVERS() + 1);
        for (uint256 i; i < approvers.length; ++i) {
            approvers[i] = address(uint160(i + 1));
        }

        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__TooManyApprovers.selector);
        policy.setPolicy(approvers, 1);
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Gives the employer a 2-of-2 policy: employer and alice
    function _setTwoOfTwoPolicy() internal {
        address[] memory approvers = new address[](2);
        approvers[0] = employer;
        approvers[1] = alice;
        vm.prank(employer);
        policy.setPolicy(approvers, 2);
    }

    /// @notice Encrypts `value` as the employer and sets it as the threshold for `token`
    /// @param token The confidential wrapper
    /// @param value Threshold in 6-decimal units
    function _setThreshold(address token, uint64 value) internal {
        (externalEuint64 handle, bytes memory proof) = employerClient.createExternalEuint64(value, address(policy));
        vm.prank(employer);
        policy.setThreshold(token, handle, proof);
    }

    /// @notice Asks the policy, through the harness, whether the employer's salary needs approval
    /// @param token The confidential wrapper the salary is paid in
    /// @param monthly Monthly salary in 6-decimal units
    /// @return The encrypted answer
    function _evaluate(address token, uint64 monthly) internal returns (ebool) {
        return harness.evaluate(employer, token, monthly);
    }
}
