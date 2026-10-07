// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {HumanRegistry} from "src/HumanRegistry.sol";
import {IHumanRegistry} from "src/interfaces/IHumanRegistry.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title HumanRegistryTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `HumanRegistry`. No FHE, so it extends plain `Test`.
 * @dev The digest is built by hand from the same strings the backend uses, not read from the contract.
 *      So a typo in the domain or typehash fails here instead of in production.
 */
contract HumanRegistryTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    HumanRegistry internal registry;

    /// @notice Test-only attester keys
    uint256 internal constant ATTESTER_PKEY = 0xA77E57;
    uint256 internal constant OTHER_PKEY = 0xBAD;

    /// @notice Attester address
    address internal attester;

    /// @notice Actors
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    /// @notice A World ID nullifier for alice
    uint256 internal constant NULLIFIER = 0x1234;

    /// @notice The strings the backend must copy exactly
    string internal constant DOMAIN_NAME = "Dayze HumanRegistry";
    string internal constant DOMAIN_VERSION = "1";
    string internal constant ATTESTATION_TYPE = "Attestation(address account,uint256 nullifier,uint64 deadline)";

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the registry with the test attester
    function setUp() public {
        attester = vm.addr(ATTESTER_PKEY);
        registry = new HumanRegistry(attester);
        vm.label(address(registry), "HumanRegistry");
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Signs an attestation the way the backend's `signTypedData` does
    /// @param pkey The signing key
    /// @param account The wallet the attestation names
    /// @param nullifier The World ID nullifier
    /// @param deadline The expiry timestamp
    /// @return The 65-byte signature
    function _sign(uint256 pkey, address account, uint256 nullifier, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                address(registry)
            )
        );
        bytes32 structHash = keccak256(abi.encode(keccak256(bytes(ATTESTATION_TYPE)), account, nullifier, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @notice A deadline 10 minutes from now, like the backend sets
    /// @return The deadline
    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 10 minutes);
    }

    /*//////////////////////////////////////////////////////////////
                                 TESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. A valid attestation marks the caller as human
    function test_register() public {
        uint64 deadline = _deadline();
        bytes memory sig = _sign(ATTESTER_PKEY, alice, NULLIFIER, deadline);

        vm.expectEmit(true, false, false, false, address(registry));
        emit IHumanRegistry.HumanRegistered(alice);
        vm.prank(alice);
        registry.register(NULLIFIER, deadline, sig);

        assertTrue(registry.isHuman(alice));
        assertTrue(registry.isNullifierUsed(NULLIFIER));
        assertFalse(registry.isHuman(bob));
    }

    /// @notice 2. A signature from a different key reverts; so does a malformed one
    function test_register_revertsOnWrongSigner() public {
        uint64 deadline = _deadline();
        bytes memory sig = _sign(OTHER_PKEY, alice, NULLIFIER, deadline);

        vm.prank(alice);
        vm.expectRevert(HumanRegistry.HumanRegistry__BadSignature.selector);
        registry.register(NULLIFIER, deadline, sig);

        vm.prank(alice);
        vm.expectRevert(HumanRegistry.HumanRegistry__BadSignature.selector);
        registry.register(NULLIFIER, deadline, hex"deadbeef");
    }

    /// @notice 3. Bob can't use alice's attestation: the digest uses msg.sender
    function test_register_revertsOnStolenAttestation() public {
        uint64 deadline = _deadline();
        bytes memory sig = _sign(ATTESTER_PKEY, alice, NULLIFIER, deadline);

        vm.prank(bob);
        vm.expectRevert(HumanRegistry.HumanRegistry__BadSignature.selector);
        registry.register(NULLIFIER, deadline, sig);
    }

    /// @notice 3b. Changing the deadline or nullifier breaks the signature
    function test_register_revertsOnTamperedFields() public {
        uint64 deadline = _deadline();
        bytes memory sig = _sign(ATTESTER_PKEY, alice, NULLIFIER, deadline);

        vm.prank(alice);
        vm.expectRevert(HumanRegistry.HumanRegistry__BadSignature.selector);
        registry.register(NULLIFIER, deadline + 1 days, sig);

        vm.prank(alice);
        vm.expectRevert(HumanRegistry.HumanRegistry__BadSignature.selector);
        registry.register(NULLIFIER + 1, deadline, sig);
    }

    /// @notice 4. An expired attestation reverts
    function test_register_revertsWhenExpired() public {
        uint64 deadline = _deadline();
        bytes memory sig = _sign(ATTESTER_PKEY, alice, NULLIFIER, deadline);

        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(HumanRegistry.HumanRegistry__Expired.selector);
        registry.register(NULLIFIER, deadline, sig);

        vm.warp(deadline); // the deadline itself still works
        vm.prank(alice);
        registry.register(NULLIFIER, deadline, sig);
    }

    /// @notice 5. One nullifier can't register a second wallet
    function test_register_revertsOnUsedNullifier() public {
        uint64 deadline = _deadline();
        vm.prank(alice);
        registry.register(NULLIFIER, deadline, _sign(ATTESTER_PKEY, alice, NULLIFIER, deadline));

        bytes memory bobSig = _sign(ATTESTER_PKEY, bob, NULLIFIER, deadline);
        vm.prank(bob);
        vm.expectRevert(HumanRegistry.HumanRegistry__NullifierUsed.selector);
        registry.register(NULLIFIER, deadline, bobSig);
    }

    /// @notice 6. Registering twice reverts
    function test_register_revertsWhenAlreadyHuman() public {
        uint64 deadline = _deadline();
        vm.prank(alice);
        registry.register(NULLIFIER, deadline, _sign(ATTESTER_PKEY, alice, NULLIFIER, deadline));

        bytes memory sig2 = _sign(ATTESTER_PKEY, alice, NULLIFIER + 1, deadline);
        vm.prank(alice);
        vm.expectRevert(HumanRegistry.HumanRegistry__AlreadyHuman.selector);
        registry.register(NULLIFIER + 1, deadline, sig2);
    }

    /// @notice 7. `setAttester` is owner-only; old signatures fail after rotation
    function test_setAttester() public {
        address newAttester = vm.addr(OTHER_PKEY);
        uint64 deadline = _deadline();
        bytes memory oldSig = _sign(ATTESTER_PKEY, alice, NULLIFIER, deadline);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        registry.setAttester(newAttester);

        vm.expectRevert(HumanRegistry.HumanRegistry__ZeroAddress.selector);
        registry.setAttester(address(0));

        vm.expectEmit(true, false, false, false, address(registry));
        emit IHumanRegistry.AttesterUpdated(newAttester);
        registry.setAttester(newAttester);
        assertEq(registry.attester(), newAttester);

        vm.prank(alice);
        vm.expectRevert(HumanRegistry.HumanRegistry__BadSignature.selector);
        registry.register(NULLIFIER, deadline, oldSig);

        vm.prank(alice);
        registry.register(NULLIFIER, deadline, _sign(OTHER_PKEY, alice, NULLIFIER, deadline));
        assertTrue(registry.isHuman(alice));
    }

    /// @notice 7b. The constructor rejects a zero attester
    function test_constructor_revertsOnZeroAttester() public {
        vm.expectRevert(HumanRegistry.HumanRegistry__ZeroAddress.selector);
        new HumanRegistry(address(0));
    }
}
