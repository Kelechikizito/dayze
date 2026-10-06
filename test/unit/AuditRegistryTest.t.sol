// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {FHE, euint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {AuditRegistry} from "src/AuditRegistry.sol";
import {IAuditRegistry} from "src/interfaces/IAuditRegistry.sol";
import {AuditHarness} from "../mocks/AuditHarness.sol";
import {DayzeTestBase} from "../utils/DayzeTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title AuditRegistryTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `AuditRegistry` and the `AuditAccess` helper on CoFHE mocks.
 * @dev Covers add/list/remove, input checks, the cap, per-payer separation,
 *      and sticky access: a removed auditor keeps old handles but not new ones.
 */
contract AuditRegistryTest is DayzeTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    AuditRegistry internal registry;

    /// @notice Stand-in for payroll that shares handles with auditors
    AuditHarness internal harness;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the shared base, the registry and the harness
    function setUp() public override {
        super.setUp();
        registry = new AuditRegistry();
        harness = new AuditHarness(registry);
        vm.label(address(registry), "AuditRegistry");
        vm.label(address(harness), "AuditHarness");
    }

    /*//////////////////////////////////////////////////////////////
                               ADD AUDITOR
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. Adding an auditor lists them and emits `AuditorAdded`
    function test_addAuditor() public {
        vm.expectEmit(true, true, false, false, address(registry));
        emit IAuditRegistry.AuditorAdded(employer, alice);

        vm.prank(employer);
        registry.addAuditor(alice);

        assertTrue(registry.isAuditor(employer, alice));
        assertEq(registry.auditorCount(employer), 1);
        address[] memory auditors = registry.auditorsOf(employer);
        assertEq(auditors.length, 1);
        assertEq(auditors[0], alice);
    }

    /// @notice 1b. The zero address can't be an auditor
    function test_addAuditor_revertsOnZeroAddress() public {
        vm.prank(employer);
        vm.expectRevert(AuditRegistry.AuditRegistry__ZeroAddress.selector);
        registry.addAuditor(address(0));
    }

    /// @notice 1c. A payer can't be their own auditor
    function test_addAuditor_revertsOnSelf() public {
        vm.prank(employer);
        vm.expectRevert(AuditRegistry.AuditRegistry__SelfAuditor.selector);
        registry.addAuditor(employer);
    }

    /// @notice 1d. Adding the same auditor twice reverts
    function test_addAuditor_revertsOnDuplicate() public {
        vm.startPrank(employer);
        registry.addAuditor(alice);
        vm.expectRevert(AuditRegistry.AuditRegistry__AlreadyAuditor.selector);
        registry.addAuditor(alice);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                              REMOVE AUDITOR
    //////////////////////////////////////////////////////////////*/

    /// @notice 1e. Removing an auditor unlists them and emits `AuditorRemoved`
    function test_removeAuditor() public {
        vm.prank(employer);
        registry.addAuditor(alice);

        vm.expectEmit(true, true, false, false, address(registry));
        emit IAuditRegistry.AuditorRemoved(employer, alice);

        vm.prank(employer);
        registry.removeAuditor(alice);

        assertFalse(registry.isAuditor(employer, alice));
        assertEq(registry.auditorCount(employer), 0);
        assertEq(registry.auditorsOf(employer).length, 0);
    }

    /// @notice 1f. Removing someone who isn't an auditor reverts
    function test_removeAuditor_revertsWhenMissing() public {
        vm.prank(employer);
        vm.expectRevert(AuditRegistry.AuditRegistry__NotAuditor.selector);
        registry.removeAuditor(alice);
    }

    /// @notice 1g. A removed auditor can be added again
    function test_removeAuditor_thenAddAgain() public {
        vm.startPrank(employer);
        registry.addAuditor(alice);
        registry.removeAuditor(alice);
        registry.addAuditor(alice);
        vm.stopPrank();

        assertTrue(registry.isAuditor(employer, alice));
    }

    /*//////////////////////////////////////////////////////////////
                           PER-PAYER SEPARATION
    //////////////////////////////////////////////////////////////*/

    /// @notice 2. Bob's calls only change Bob's set, never the employer's
    function test_onlyPayerControlsTheirSet() public {
        vm.prank(employer);
        registry.addAuditor(alice);

        // bob adds alice to his own set; the employer's set is unchanged
        vm.prank(bob);
        registry.addAuditor(alice);
        assertEq(registry.auditorCount(employer), 1);
        assertEq(registry.auditorCount(bob), 1);

        // bob removes alice from his set; she stays the employer's auditor
        vm.prank(bob);
        registry.removeAuditor(alice);
        assertTrue(registry.isAuditor(employer, alice));
        assertFalse(registry.isAuditor(bob, alice));
    }

    /*//////////////////////////////////////////////////////////////
                                   CAP
    //////////////////////////////////////////////////////////////*/

    /// @notice 3. A payer can have at most `MAX_AUDITORS`; removing one frees a slot
    function test_cap() public {
        uint256 max = registry.MAX_AUDITORS();

        vm.startPrank(employer);
        for (uint256 i = 1; i <= max; ++i) {
            registry.addAuditor(address(uint160(i)));
        }
        assertEq(registry.auditorCount(employer), max);

        vm.expectRevert(AuditRegistry.AuditRegistry__TooManyAuditors.selector);
        registry.addAuditor(alice);

        registry.removeAuditor(address(1));
        registry.addAuditor(alice);
        vm.stopPrank();

        assertEq(registry.auditorCount(employer), max);
        assertTrue(registry.isAuditor(employer, alice));
    }

    /*//////////////////////////////////////////////////////////////
                              STICKY ACCESS
    //////////////////////////////////////////////////////////////*/

    /// @notice 4. A removed auditor keeps access to old handles but not to new ones (known risk, §8)
    function test_removedAuditorKeepsOldHandlesOnly() public {
        vm.prank(employer);
        registry.addAuditor(alice);

        euint64 oldHandle = harness.createHandle(employer, 1);
        assertTrue(FHE.isAllowed(oldHandle, alice));
        assertFalse(FHE.isAllowed(oldHandle, bob));

        vm.prank(employer);
        registry.removeAuditor(alice);

        euint64 newHandle = harness.createHandle(employer, 2);
        assertTrue(FHE.isAllowed(oldHandle, alice)); // sticky: FHE.allow can't be undone
        assertFalse(FHE.isAllowed(newHandle, alice));
    }

    /*//////////////////////////////////////////////////////////////
                                   FUZZ
    //////////////////////////////////////////////////////////////*/

    /// @notice Any valid auditor can be added and removed, leaving the set empty
    /// @param auditor Random auditor address
    function testFuzz_addThenRemove(address auditor) public {
        vm.assume(auditor != address(0) && auditor != employer);

        vm.startPrank(employer);
        registry.addAuditor(auditor);
        assertTrue(registry.isAuditor(employer, auditor));
        registry.removeAuditor(auditor);
        vm.stopPrank();

        assertFalse(registry.isAuditor(employer, auditor));
        assertEq(registry.auditorCount(employer), 0);
    }
}
