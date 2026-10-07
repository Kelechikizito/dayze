// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IHumanRegistry} from "src/interfaces/IHumanRegistry.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title HumanRegistry
 * @author Kelechi Kizito Ugwu
 * @notice Marks wallets as verified, unique humans using backend-signed World ID attestations.
 * @dev One human, one wallet: each World ID nullifier can register once.
 *      The attester is trusted. It can mark wallets as human, but can't read salaries or move funds.
 *      No FHE here.
 */
contract HumanRegistry is IHumanRegistry, EIP712, Ownable {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when the attester address is zero
    error HumanRegistry__ZeroAddress();

    /// @notice Thrown when the attestation's deadline has passed
    error HumanRegistry__Expired();

    /// @notice Thrown when the signature isn't the attester's over (msg.sender, nullifier, deadline)
    error HumanRegistry__BadSignature();

    /// @notice Thrown when the nullifier was already used by another registration
    error HumanRegistry__NullifierUsed();

    /// @notice Thrown when the caller is already registered
    error HumanRegistry__AlreadyHuman();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice EIP-712 typehash for an attestation signed by the backend
    /// @dev Must match the backend's `types` object character for character
    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(address account,uint256 nullifier,uint64 deadline)");

    /// @notice The backend key that signs attestations after World ID checks a proof
    address private s_attester;

    /// @notice Whether a wallet has a verified World ID
    mapping(address account => bool) private s_isHuman;

    /// @notice Whether a World ID nullifier was already used. One human, one wallet.
    mapping(uint256 nullifier => bool) private s_nullifierUsed;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the attester and the EIP-712 domain. The deployer becomes owner.
    /// @param attesterAddress The backend key that signs attestations
    constructor(address attesterAddress) EIP712("Dayze HumanRegistry", "1") Ownable(msg.sender) {
        _setAttester(attesterAddress);
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IHumanRegistry
    function register(uint256 nullifier, uint64 deadline, bytes calldata signature) external {
        // A few seconds of validator drift doesn't matter for a 10-minute window
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert HumanRegistry__Expired();
        if (s_isHuman[msg.sender]) revert HumanRegistry__AlreadyHuman();
        if (s_nullifierUsed[nullifier]) revert HumanRegistry__NullifierUsed();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ATTESTATION_TYPEHASH, msg.sender, nullifier, deadline)));
        // tryRecover, so a malformed signature reverts with our error, not OZ's
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != s_attester) revert HumanRegistry__BadSignature();

        s_nullifierUsed[nullifier] = true;
        s_isHuman[msg.sender] = true;
        // The only call before this is the ecrecover precompile, which can't reenter
        // forge-lint: disable-next-line(reentrancy-events)
        emit HumanRegistered(msg.sender);
    }

    /// @inheritdoc IHumanRegistry
    function setAttester(address attesterAddress) external onlyOwner {
        _setAttester(attesterAddress);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Stores a new attester
    /// @param attesterAddress The new attester
    function _setAttester(address attesterAddress) internal {
        if (attesterAddress == address(0)) revert HumanRegistry__ZeroAddress();
        s_attester = attesterAddress;
        emit AttesterUpdated(attesterAddress);
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IHumanRegistry
    function isHuman(address account) external view returns (bool) {
        return s_isHuman[account];
    }

    /// @inheritdoc IHumanRegistry
    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return s_nullifierUsed[nullifier];
    }

    /// @inheritdoc IHumanRegistry
    function attester() external view returns (address) {
        return s_attester;
    }
}
