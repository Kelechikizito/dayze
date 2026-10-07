// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {FHE, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";
import {IHumanRegistry} from "src/interfaces/IHumanRegistry.sol";
import {IIncomeCredential} from "src/interfaces/IIncomeCredential.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title IncomeCredential
 * @author Kelechi Kizito Ugwu
 * @notice A payee proves "I earn >= X of token T per month" to one verifier. The verifier learns one bit.
 * @dev Compares the stream's stored encrypted `monthly` against a plaintext threshold, so there's no rounding.
 *      Payroll must call `setCredential(this)` before streams are created, so this contract can read `monthly`.
 *      Honest limits:
 *      - Expiry ends validity. It can't make a verifier forget a bit they already decrypted.
 *      - The result is as of issuance. A later salary change doesn't update it. Short expiries keep it honest.
 *      - It proves what a payroll contract pays, not who the employer is.
 *      - One credential covers one stream in one token. "Across all streams" would need prices.
 */
contract IncomeCredential is IIncomeCredential {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a constructor address or the verifier is zero
    error IncomeCredential__ZeroAddress();

    /// @notice Thrown when the caller is not the stream's (or credential's) payee
    error IncomeCredential__NotPayee();

    /// @notice Thrown when issuing on a stream that is not Active
    error IncomeCredential__StreamNotActive();

    /// @notice Thrown when the expiry is not in the future
    error IncomeCredential__BadExpiry();

    /// @notice Thrown when revoking a credential that is already revoked
    error IncomeCredential__AlreadyRevoked();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Payroll, which owns the streams and shares `monthly` with this contract
    IDayzePayroll public immutable I_PAYROLL;

    /// @notice World ID registry, read at issue time for the "verified human" flag
    IHumanRegistry public immutable I_HUMAN_REGISTRY;

    /// @notice Credentials by id; ids start at 1
    mapping(uint256 id => Credential credential) private s_credentials;

    /// @notice Number of credentials issued; also the last id used
    uint256 private s_credentialCount;

    /// @notice Credential ids per payee
    mapping(address payee => uint256[] ids) private s_payeeCredentials;

    /// @notice Credential ids per verifier
    mapping(address verifier => uint256[] ids) private s_verifierCredentials;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets payroll and the human registry
    /// @param payroll The payroll contract
    /// @param humanRegistry The World ID registry
    constructor(address payroll, address humanRegistry) {
        if (payroll == address(0)) revert IncomeCredential__ZeroAddress();
        if (humanRegistry == address(0)) revert IncomeCredential__ZeroAddress();
        I_PAYROLL = IDayzePayroll(payroll);
        I_HUMAN_REGISTRY = IHumanRegistry(humanRegistry);
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IIncomeCredential
    /// @dev `ok` is allowed only to the verifier. The payee already knows their salary.
    function issue(uint256 streamId, address verifier, uint64 threshold, uint64 expiresAt)
        external
        returns (uint256 id)
    {
        if (verifier == address(0)) revert IncomeCredential__ZeroAddress();
        // forge-lint: disable-next-line(block-timestamp)
        if (expiresAt <= block.timestamp) revert IncomeCredential__BadExpiry();
        IDayzePayroll.Stream memory s = I_PAYROLL.getStream(streamId);
        if (s.payee != msg.sender) revert IncomeCredential__NotPayee();
        if (s.status != IDayzePayroll.Status.Active) revert IncomeCredential__StreamNotActive();

        ebool ok = FHE.gte(s.monthly, FHE.asEuint64(threshold));
        FHE.allowThis(ok);
        FHE.allow(ok, verifier);

        id = ++s_credentialCount;
        s_credentials[id] = Credential({
            payee: msg.sender,
            payer: s.payer,
            verifier: verifier,
            token: address(s.token),
            streamId: streamId,
            threshold: threshold,
            // forge-lint: disable-next-line(unsafe-typecast)
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            streamActiveSince: s.startTime,
            revoked: false,
            payeeIsHuman: I_HUMAN_REGISTRY.isHuman(msg.sender),
            ok: ok
        });
        s_payeeCredentials[msg.sender].push(id);
        s_verifierCredentials[verifier].push(id);

        emit CredentialIssued(id, msg.sender, verifier, address(s.token), threshold, expiresAt);
    }

    /// @inheritdoc IIncomeCredential
    function revoke(uint256 id) external {
        Credential storage c = s_credentials[id];
        if (c.payee != msg.sender) revert IncomeCredential__NotPayee();
        if (c.revoked) revert IncomeCredential__AlreadyRevoked();
        c.revoked = true;
        emit CredentialRevoked(id);
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IIncomeCredential
    /// @dev Also false once the stream is cancelled: the payee no longer earns from it.
    ///      A salary change while Active doesn't affect it (the result is as of issuance).
    function isValid(uint256 id) external view returns (bool) {
        Credential storage c = s_credentials[id];
        if (c.payee == address(0) || c.revoked) return false;
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= c.expiresAt) return false;
        return I_PAYROLL.getStream(c.streamId).status == IDayzePayroll.Status.Active;
    }

    /// @inheritdoc IIncomeCredential
    function get(uint256 id) external view returns (Credential memory) {
        return s_credentials[id];
    }

    /// @inheritdoc IIncomeCredential
    function credentialsOf(address payee) external view returns (uint256[] memory) {
        return s_payeeCredentials[payee];
    }

    /// @inheritdoc IIncomeCredential
    function credentialsFor(address verifier) external view returns (uint256[] memory) {
        return s_verifierCredentials[verifier];
    }
}
