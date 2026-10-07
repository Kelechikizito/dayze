// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, ebool, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {HumanRegistry} from "src/HumanRegistry.sol";
import {IncomeCredential} from "src/IncomeCredential.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";
import {IIncomeCredential} from "src/interfaces/IIncomeCredential.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title IncomeCredentialTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `IncomeCredential` on CoFHE mocks, with the 600s demo period.
 * @dev Alice is paid 3,000 cUSDC/month by the employer. `verifier` is a landlord asking about her income.
 */
contract IncomeCredentialTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    IncomeCredential internal credential;

    /// @notice World ID registry the credential reads
    HumanRegistry internal humanRegistry;

    /// @notice Test-only attester key for `humanRegistry`
    uint256 internal constant ATTESTER_PKEY = 0xA77E57;

    /// @notice The address alice issues credentials to
    address internal verifier;

    /// @notice Alice's monthly salary
    uint64 internal constant MONTHLY = 3000e6;

    /// @notice Alice's stream
    uint256 internal streamId;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the human registry and the credential, wires it into payroll, and starts alice's stream
    function setUp() public override {
        super.setUp();
        verifier = makeAddr("verifier");

        humanRegistry = new HumanRegistry(vm.addr(ATTESTER_PKEY));
        credential = new IncomeCredential(address(payroll), address(humanRegistry));
        payroll.setCredential(address(credential));
        vm.label(address(humanRegistry), "HumanRegistry");
        vm.label(address(credential), "IncomeCredential");

        streamId = _createActiveStream(tUsdc, MONTHLY);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc PayrollTestBase
    function _period() internal pure override returns (uint64) {
        return 600;
    }

    /// @notice Alice issues a credential on `id` to `verifier`, valid for 1 hour
    /// @param id The stream
    /// @param threshold The monthly amount asked about
    /// @return The credential id
    function _issue(uint256 id, uint64 threshold) internal returns (uint256) {
        vm.prank(alice);
        return credential.issue(id, verifier, threshold, uint64(block.timestamp + 1 hours));
    }

    /// @notice Returns a credential's encrypted result
    /// @param id The credential
    /// @return The result handle
    function _ok(uint256 id) internal view returns (ebool) {
        return credential.get(id).ok;
    }

    /// @notice Registers alice in the human registry with a signed attestation
    function _registerAliceAsHuman() internal {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Dayze HumanRegistry"),
                keccak256("1"),
                block.chainid,
                address(humanRegistry)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(keccak256("Attestation(address account,uint256 nullifier,uint64 deadline)"), alice, 1, deadline)
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(ATTESTER_PKEY, keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)));
        vm.prank(alice);
        humanRegistry.register(1, deadline, abi.encodePacked(r, s, v));
    }

    /*//////////////////////////////////////////////////////////////
                                 RESULT
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. 3,000/month passes 2,500 and exactly 3,000, fails 4,000
    function test_issue_comparesMonthly() public {
        expectPlaintext(_ok(_issue(streamId, 2500e6)), true);
        expectPlaintext(_ok(_issue(streamId, 4000e6)), false);
        expectPlaintext(_ok(_issue(streamId, MONTHLY)), true); // no rounding: compares stored monthly
    }

    /// @notice 2. 1 cETH/month passes 0.5 cETH; the credential stores token = cETH
    function test_issue_lowUnitToken() public {
        uint256 ethStream = _createActiveStream(tEth, 1e6);
        uint256 id = _issue(ethStream, 5e5);

        expectPlaintext(_ok(id), true);
        assertEq(credential.get(id).token, address(ceth));
    }

    /// @notice 2b. `issue` stores the stream's details and emits the event without the result
    function test_issue_storesDetails() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        vm.expectEmit(true, true, true, true, address(credential));
        emit IIncomeCredential.CredentialIssued(1, alice, verifier, address(cusdc), 2500e6, expiresAt);
        vm.prank(alice);
        uint256 id = credential.issue(streamId, verifier, 2500e6, expiresAt);

        IIncomeCredential.Credential memory c = credential.get(id);
        assertEq(c.payee, alice);
        assertEq(c.payer, employer);
        assertEq(c.verifier, verifier);
        assertEq(c.streamId, streamId);
        assertEq(c.threshold, 2500e6);
        assertEq(c.issuedAt, block.timestamp);
        assertEq(c.expiresAt, expiresAt);
        assertEq(c.streamActiveSince, payroll.getStream(streamId).startTime);
        assertFalse(c.revoked);

        assertEq(credential.credentialsOf(alice)[0], id);
        assertEq(credential.credentialsFor(verifier)[0], id);
    }

    /*//////////////////////////////////////////////////////////////
                                  ACL
    //////////////////////////////////////////////////////////////*/

    /// @notice 3. Only the verifier can read the result; not bob, the payer or the payee
    function test_issue_resultOnlyForVerifier() public {
        ebool ok = _ok(_issue(streamId, 2500e6));

        assertTrue(FHE.isAllowed(ok, verifier));
        assertFalse(FHE.isAllowed(ok, bob));
        assertFalse(FHE.isAllowed(ok, employer));
        assertFalse(FHE.isAllowed(ok, alice));
    }

    /*//////////////////////////////////////////////////////////////
                              ISSUE CHECKS
    //////////////////////////////////////////////////////////////*/

    /// @notice 4. Non-payee, bad expiry and zero verifier revert
    function test_issue_reverts() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.prank(bob);
        vm.expectRevert(IncomeCredential.IncomeCredential__NotPayee.selector);
        credential.issue(streamId, verifier, 1, expiresAt);

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__BadExpiry.selector);
        credential.issue(streamId, verifier, 1, uint64(block.timestamp));

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__ZeroAddress.selector);
        credential.issue(streamId, address(0), 1, expiresAt);
    }

    /// @notice 4b. Issuing on a Pending or Cancelled stream reverts
    function test_issue_revertsOnInactiveStream() public {
        address[] memory approvers = new address[](1);
        approvers[0] = bob;
        vm.prank(employer);
        policy.setPolicy(approvers, 1);
        (externalEuint64 h, bytes memory p) = employerClient.createExternalEuint64(1000e6, address(policy));
        vm.prank(employer);
        policy.setThreshold(address(cusdc), h, p);

        uint256 pending = _createStream(tUsdc, MONTHLY);
        _resolve(pending);
        assertEq(uint8(payroll.getStream(pending).status), uint8(IDayzePayroll.Status.Pending));

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__StreamNotActive.selector);
        credential.issue(pending, verifier, 1, uint64(block.timestamp + 1 hours));

        vm.prank(employer);
        payroll.cancelStream(streamId);
        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__StreamNotActive.selector);
        credential.issue(streamId, verifier, 1, uint64(block.timestamp + 1 hours));
    }

    /*//////////////////////////////////////////////////////////////
                         VALIDITY AND REVOKING
    //////////////////////////////////////////////////////////////*/

    /// @notice 5. Valid before expiry, invalid at expiry
    function test_isValid_expires() public {
        uint256 id = _issue(streamId, 2500e6);
        assertTrue(credential.isValid(id));

        vm.warp(credential.get(id).expiresAt - 1);
        assertTrue(credential.isValid(id));

        vm.warp(credential.get(id).expiresAt);
        assertFalse(credential.isValid(id));
    }

    /// @notice 6. Revoking makes it invalid; only the payee can revoke, once
    function test_revoke() public {
        uint256 id = _issue(streamId, 2500e6);

        vm.prank(bob);
        vm.expectRevert(IncomeCredential.IncomeCredential__NotPayee.selector);
        credential.revoke(id);

        vm.expectEmit(true, false, false, false, address(credential));
        emit IIncomeCredential.CredentialRevoked(id);
        vm.prank(alice);
        credential.revoke(id);
        assertFalse(credential.isValid(id));
        assertTrue(credential.get(id).revoked);

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__AlreadyRevoked.selector);
        credential.revoke(id);
    }

    /// @notice 7. Cancelling the stream after issuance makes the credential invalid
    /// @dev Our choice: the claim is "earns >= X", which stops being true once the stream ends
    function test_isValid_falseAfterStreamCancelled() public {
        uint256 id = _issue(streamId, 2500e6);

        vm.prank(employer);
        payroll.cancelStream(streamId);
        assertFalse(credential.isValid(id));
    }

    /// @notice 7b. An id that was never issued is not valid
    function test_isValid_unknownId() public view {
        assertFalse(credential.isValid(99));
    }

    /// @notice 8. Demo timing: a 2-minute credential expires after 2 minutes
    function test_demoTiming() public {
        vm.prank(alice);
        uint256 id = credential.issue(streamId, verifier, 2500e6, uint64(block.timestamp + 2 minutes));
        assertTrue(credential.isValid(id));

        vm.warp(block.timestamp + 2 minutes + 1);
        assertFalse(credential.isValid(id));
    }

    /*//////////////////////////////////////////////////////////////
                              WORLD ID
    //////////////////////////////////////////////////////////////*/

    /// @notice 9. `payeeIsHuman` reflects the registry at issue time; unregistered payees can still issue
    function test_issue_payeeIsHuman() public {
        uint256 before = _issue(streamId, 2500e6);
        assertFalse(credential.get(before).payeeIsHuman);

        _registerAliceAsHuman();
        uint256 afterRegister = _issue(streamId, 2500e6);
        assertTrue(credential.get(afterRegister).payeeIsHuman);
        assertFalse(credential.get(before).payeeIsHuman); // stored at issue time
    }

    /*//////////////////////////////////////////////////////////////
                              PAYROLL HOOK
    //////////////////////////////////////////////////////////////*/

    /// @notice 10. `setCredential` is owner-only and one-shot; new streams share `monthly` with it
    function test_setCredential() public {
        assertEq(payroll.credential(), address(credential));
        assertTrue(FHE.isAllowed(payroll.getStream(streamId).monthly, address(credential)));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        payroll.setCredential(bob);

        vm.expectRevert(DayzePayroll.DayzePayroll__CredentialAlreadySet.selector);
        payroll.setCredential(bob);
    }
}
