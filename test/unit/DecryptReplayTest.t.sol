// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title DecryptReplayTest
 * @author Kelechi Kizito Ugwu
 * @notice Replay and forgery tests for `resolvePolicy` (architecture §8).
 * @dev A 1-of-1 policy with a threshold makes `evaluate` run `FHE.gt`, so each stream gets its own bit handle.
 */
contract DecryptReplayTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a 1-of-1 policy with a 5,000 cUSDC threshold
    function setUp() public override {
        super.setUp();

        address[] memory approvers = new address[](1);
        approvers[0] = bob;
        vm.prank(employer);
        policy.setPolicy(approvers, 1);

        (externalEuint64 h, bytes memory p) = employerClient.createExternalEuint64(5000e6, address(policy));
        vm.prank(employer);
        policy.setThreshold(address(cusdc), h, p);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc PayrollTestBase
    function _period() internal pure override returns (uint64) {
        return 30 days;
    }

    /*//////////////////////////////////////////////////////////////
                                 TESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. Resolving twice reverts
    function test_resolveTwice_reverts() public {
        uint256 id = _createStream(tUsdc, 3000e6);
        (bool needsApproval, bytes memory sig) = _decryptPolicyBit(id);
        payroll.resolvePolicy(id, needsApproval, sig);

        vm.expectRevert(DayzePayroll.DayzePayroll__AlreadyResolved.selector);
        payroll.resolvePolicy(id, needsApproval, sig);
    }

    /// @notice 2. Stream A's result and signature don't resolve stream B, even with the same value
    function test_crossStreamSignature_reverts() public {
        uint256 a = _createStream(tUsdc, 3000e6);
        uint256 b = _createStream(tUsdc, 4000e6); // also under the threshold: same value, different handle
        (bool needsApproval, bytes memory sigA) = _decryptPolicyBit(a);

        vm.expectRevert(DayzePayroll.DayzePayroll__BadDecryptProof.selector);
        payroll.resolvePolicy(b, needsApproval, sigA);
    }

    /// @notice 3. The right signature with the bool flipped reverts
    function test_flippedResult_reverts() public {
        uint256 id = _createStream(tUsdc, 6000e6); // over the threshold: true
        (bool needsApproval, bytes memory sig) = _decryptPolicyBit(id);
        assertTrue(needsApproval);

        vm.expectRevert(DayzePayroll.DayzePayroll__BadDecryptProof.selector);
        payroll.resolvePolicy(id, false, sig); // would skip approvals
    }

    /// @notice 4. A garbage signature reverts
    function test_garbageSignature_reverts() public {
        uint256 id = _createStream(tUsdc, 3000e6);

        vm.expectRevert(DayzePayroll.DayzePayroll__BadDecryptProof.selector);
        payroll.resolvePolicy(id, false, hex"deadbeef");

        vm.expectRevert(DayzePayroll.DayzePayroll__BadDecryptProof.selector);
        payroll.resolvePolicy(id, false, new bytes(65));
    }

    /// @notice 5. Resolving a cancelled stream reverts
    function test_resolveCancelled_reverts() public {
        uint256 id = _createStream(tUsdc, 3000e6);
        (bool needsApproval, bytes memory sig) = _decryptPolicyBit(id);

        vm.prank(employer);
        payroll.cancelStream(id);

        vm.expectRevert(DayzePayroll.DayzePayroll__AlreadyResolved.selector);
        payroll.resolvePolicy(id, needsApproval, sig);
    }
}
