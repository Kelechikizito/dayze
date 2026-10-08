// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Test} from "forge-std/Test.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {AuditRegistry} from "src/AuditRegistry.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {JoinRequests} from "src/JoinRequests.sol";
import {IJoinRequests} from "src/interfaces/IJoinRequests.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title JoinRequestsTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `JoinRequests`. No FHE: payroll's constructor and `createOrg` are plaintext.
 */
contract JoinRequestsTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    JoinRequests internal requests;

    /// @notice Payroll it reads orgs from
    DayzePayroll internal payroll;

    /// @notice Actors
    address internal employer = makeAddr("employer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys payroll and the requests contract, and gives the employer an org
    function setUp() public {
        payroll = new DayzePayroll(address(new ApprovalPolicy()), address(new AuditRegistry()), 600);
        requests = new JoinRequests(address(payroll));
        vm.prank(employer);
        payroll.createOrg("Acme Labs");
    }

    /*//////////////////////////////////////////////////////////////
                                 TESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. A worker asks an employer; the request shows as pending
    function test_requestToJoin() public {
        vm.expectEmit(true, true, false, false, address(requests));
        emit IJoinRequests.JoinRequested(employer, alice);
        vm.prank(alice);
        requests.requestToJoin(employer);

        assertTrue(requests.hasRequested(employer, alice));
        address[] memory pending = requests.pendingFor(employer);
        assertEq(pending.length, 1);
        assertEq(pending[0], alice);
    }

    /// @notice 2. Only an address with an org can be asked
    function test_requestToJoin_revertsForNonEmployer() public {
        vm.prank(alice);
        vm.expectRevert(JoinRequests.JoinRequests__NotAnEmployer.selector);
        requests.requestToJoin(bob);
    }

    /// @notice 3. Asking twice, or asking yourself, reverts
    function test_requestToJoin_revertsOnDuplicateOrSelf() public {
        vm.prank(alice);
        requests.requestToJoin(employer);
        vm.prank(alice);
        vm.expectRevert(JoinRequests.JoinRequests__AlreadyRequested.selector);
        requests.requestToJoin(employer);

        vm.prank(employer);
        vm.expectRevert(JoinRequests.JoinRequests__SelfRequest.selector);
        requests.requestToJoin(employer);
    }

    /// @notice 4. The worker can cancel; cancelling again reverts
    function test_cancelRequest() public {
        vm.prank(alice);
        requests.requestToJoin(employer);

        vm.expectEmit(true, true, false, false, address(requests));
        emit IJoinRequests.JoinRequestCancelled(employer, alice);
        vm.prank(alice);
        requests.cancelRequest(employer);
        assertFalse(requests.hasRequested(employer, alice));

        vm.prank(alice);
        vm.expectRevert(JoinRequests.JoinRequests__NoRequest.selector);
        requests.cancelRequest(employer);
    }

    /// @notice 5. Only the employer asked can dismiss; others' lists are untouched
    function test_dismiss() public {
        vm.prank(alice);
        requests.requestToJoin(employer);
        vm.prank(bob);
        requests.requestToJoin(employer);

        vm.prank(bob);
        vm.expectRevert(JoinRequests.JoinRequests__NoRequest.selector);
        requests.dismiss(alice);

        vm.expectEmit(true, true, false, false, address(requests));
        emit IJoinRequests.JoinRequestDismissed(employer, alice);
        vm.prank(employer);
        requests.dismiss(alice);

        assertFalse(requests.hasRequested(employer, alice));
        assertTrue(requests.hasRequested(employer, bob));
        assertEq(requests.pendingFor(employer).length, 1);
    }

    /// @notice 6. The pending list is capped; dismissing makes room again
    function test_requestToJoin_capped() public {
        uint256 max = requests.MAX_PENDING();
        for (uint256 i = 1; i <= max; ++i) {
            vm.prank(address(uint160(0x10000 + i)));
            requests.requestToJoin(employer);
        }
        vm.prank(alice);
        vm.expectRevert(JoinRequests.JoinRequests__TooManyRequests.selector);
        requests.requestToJoin(employer);

        vm.prank(employer);
        requests.dismiss(address(uint160(0x10001)));
        vm.prank(alice);
        requests.requestToJoin(employer);
        assertTrue(requests.hasRequested(employer, alice));
    }

    /// @notice 7. The constructor rejects a zero payroll
    function test_constructor_revertsOnZeroPayroll() public {
        vm.expectRevert(JoinRequests.JoinRequests__ZeroAddress.selector);
        new JoinRequests(address(0));
    }
}
