// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, ebool, euint64, euint128, externalEuint64, sharedEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IFHERC20} from "fhenix-confidential-contracts/interfaces/IFHERC20.sol";
import {IApprovalPolicy} from "src/interfaces/IApprovalPolicy.sol";
import {IAuditRegistry} from "src/interfaces/IAuditRegistry.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";
import {AuditAccess} from "src/libraries/AuditAccess.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title DayzePayroll
 * @author Kelechi Kizito Ugwu
 * @notice Encrypted salary streams paid from per-payer, per-token confidential vaults.
 * @dev Accrual is lazy: `monthly * elapsed / PERIOD`, computed in euint128 on each withdraw.
 *      Over-withdrawals and underfunded vaults pay 0 instead of reverting, so nothing leaks.
 *      New streams wait in `AwaitingPolicy` until anyone posts the decrypted `needsApproval` bit.
 *      That bit is the only value ever made public: "this salary is above or below a hidden threshold".
 */
contract DayzePayroll is IDayzePayroll, Ownable {
    using AuditAccess for IAuditRegistry;

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when an address argument is zero
    error DayzePayroll__ZeroAddress();

    /// @notice Thrown when `PERIOD` is 0
    error DayzePayroll__ZeroPeriod();

    /// @notice Thrown when the token is not on the allowlist
    error DayzePayroll__UnsupportedToken();

    /// @notice Thrown when adding a token that is already on the allowlist
    error DayzePayroll__TokenAlreadySupported();

    /// @notice Thrown when the caller already has an org
    error DayzePayroll__OrgExists();

    /// @notice Thrown when the caller has no org
    error DayzePayroll__NoOrg();

    /// @notice Thrown when the caller is not the stream's payee
    error DayzePayroll__NotPayee();

    /// @notice Thrown when the caller is not the stream's payer
    error DayzePayroll__NotPayer();

    /// @notice Thrown when withdrawing from a stream that is not Active or Cancelled
    error DayzePayroll__NotWithdrawable();

    /// @notice Thrown when cancelling a stream that is already cancelled or doesn't exist
    error DayzePayroll__NotCancellable();

    /// @notice Thrown when resolving a stream that is not `AwaitingPolicy`
    error DayzePayroll__AlreadyResolved();

    /// @notice Thrown when the decrypt signature doesn't match the stream's handle and result
    error DayzePayroll__BadDecryptProof();

    /// @notice Thrown when activating a stream that is not `Pending`
    error DayzePayroll__NotPending();

    /// @notice Thrown when activating a stream that has fewer approvals than the policy requires
    error DayzePayroll__NotEnoughApprovals();

    /// @notice Thrown when the credential contract is set a second time
    error DayzePayroll__CredentialAlreadySet();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Policy that decides which streams need approval
    IApprovalPolicy public immutable I_APPROVAL_POLICY;

    /// @notice Registry of each payer's auditors
    IAuditRegistry public immutable I_AUDIT_REGISTRY;

    /// @notice Length of one pay period in seconds: 30 days in prod, e.g. 600 (10 min) for the demo
    uint64 public immutable PERIOD;

    /// @notice Confidential wrappers payroll accepts; owner-managed
    mapping(IFHERC20 token => bool supported) public s_supportedTokens;

    /// @notice Each payer's encrypted funded balance, per token
    mapping(address payer => mapping(IFHERC20 token => euint64 balance)) internal s_vaults;

    /// @notice Each payer's org
    mapping(address payer => Org org) internal s_orgs;

    /// @notice Streams by id; ids start at 1
    mapping(uint256 id => Stream stream) internal s_streams;

    /// @notice Number of streams created; also the last id used
    uint256 internal s_streamCount;

    /// @notice Stream ids per payer
    mapping(address payer => uint256[] ids) internal s_payerStreams;

    /// @notice Stream ids per payee
    mapping(address payee => uint256[] ids) internal s_payeeStreams;

    /// @notice IncomeCredential, which may compute on every stream's `monthly`; set once by the owner
    address internal s_credential;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the policy, the audit registry and the pay period. The deployer becomes owner.
    /// @param approvalPolicy The approval policy
    /// @param auditRegistry The audit registry
    /// @param period Length of one pay period in seconds
    constructor(address approvalPolicy, address auditRegistry, uint64 period) Ownable(msg.sender) {
        if (approvalPolicy == address(0)) revert DayzePayroll__ZeroAddress();
        if (auditRegistry == address(0)) revert DayzePayroll__ZeroAddress();
        if (period == 0) revert DayzePayroll__ZeroPeriod();
        I_APPROVAL_POLICY = IApprovalPolicy(approvalPolicy);
        I_AUDIT_REGISTRY = IAuditRegistry(auditRegistry);
        PERIOD = period;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IDayzePayroll
    function createOrg(string calldata name) external {
        if (s_orgs[msg.sender].exists) revert DayzePayroll__OrgExists();
        s_orgs[msg.sender] = Org({name: name, exists: true});
        emit OrgCreated(msg.sender, name);
    }

    /// @inheritdoc IDayzePayroll
    function addToken(IFHERC20 token) external onlyOwner {
        if (address(token) == address(0)) revert DayzePayroll__ZeroAddress();
        if (s_supportedTokens[token]) revert DayzePayroll__TokenAlreadySupported();
        s_supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    /// @inheritdoc IDayzePayroll
    function removeToken(IFHERC20 token) external onlyOwner {
        if (!s_supportedTokens[token]) revert DayzePayroll__UnsupportedToken();
        s_supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    /// @inheritdoc IDayzePayroll
    function setCredential(address credentialAddress) external onlyOwner {
        if (credentialAddress == address(0)) revert DayzePayroll__ZeroAddress();
        if (s_credential != address(0)) revert DayzePayroll__CredentialAlreadySet();
        s_credential = credentialAddress;
        emit CredentialSet(credentialAddress);
    }

    /// @inheritdoc IDayzePayroll
    /// @dev Credits the amount the token actually moved, so a short payer is credited 0
    function fundVault(IFHERC20 token, externalEuint64 amount, bytes calldata proof) external {
        if (!s_supportedTokens[token]) revert DayzePayroll__UnsupportedToken();

        euint64 amt = FHE.asEuint64(amount, proof);
        FHE.allowThis(amt);
        sharedEuint64 movedShared =
            token.confidentialTransferFrom(msg.sender, address(this), FHE.shareEuint64(amt, address(token)));
        euint64 moved = FHE.receiveEuint64FromCall(movedShared, address(token));

        euint64 vault = FHE.add(s_vaults[msg.sender][token], moved);
        s_vaults[msg.sender][token] = vault;
        FHE.allowThis(vault);
        FHE.allow(vault, msg.sender);
        I_AUDIT_REGISTRY.allowAuditors(msg.sender, vault);

        emit VaultFunded(msg.sender, token);
    }

    /// @inheritdoc IDayzePayroll
    function createStream(address payee, IFHERC20 token, externalEuint64 monthly, bytes calldata proof)
        external
        returns (uint256 id)
    {
        if (payee == address(0)) revert DayzePayroll__ZeroAddress();
        if (!s_supportedTokens[token]) revert DayzePayroll__UnsupportedToken();
        if (!s_orgs[msg.sender].exists) revert DayzePayroll__NoOrg();

        euint64 monthlyAmt = FHE.asEuint64(monthly, proof);
        FHE.allowThis(monthlyAmt);
        FHE.allow(monthlyAmt, payee);
        FHE.allow(monthlyAmt, msg.sender);
        I_AUDIT_REGISTRY.allowAuditors(msg.sender, monthlyAmt);
        // Streams created before `setCredential` can't get credentials; deploy sets it right away
        if (s_credential != address(0)) FHE.allow(monthlyAmt, s_credential);

        euint64 withdrawn = FHE.asEuint64(0);
        FHE.allowThis(withdrawn);
        FHE.allow(withdrawn, payee);
        FHE.allow(withdrawn, msg.sender);

        id = ++s_streamCount;
        Stream storage s = s_streams[id];
        s.payer = msg.sender;
        s.payee = payee;
        s.token = token;
        s.monthly = monthlyAmt;
        s.withdrawn = withdrawn;

        s_payerStreams[msg.sender].push(id);
        s_payeeStreams[payee].push(id);
        emit StreamCreated(id, msg.sender, payee, token, euint64.unwrap(monthlyAmt));

        ebool needsApproval = I_APPROVAL_POLICY.evaluate(
            msg.sender, address(token), FHE.shareEuint64(monthlyAmt, address(I_APPROVAL_POLICY))
        );
        FHE.allowThis(needsApproval);
        FHE.allowPublic(needsApproval); // anyone may decrypt this ONE bit
        s.needsApproval = needsApproval;
        s.status = Status.AwaitingPolicy;
        emit PolicyCheckRequested(id, ebool.unwrap(needsApproval));
    }

    /// @inheritdoc IDayzePayroll
    /// @dev Permissionless: the decrypt signature proves the result.
    ///      The status check stops replays; checking against THIS stream's handle stops cross-stream reuse.
    function resolvePolicy(uint256 id, bool needsApproval, bytes calldata sig) external {
        Stream storage s = s_streams[id];
        if (s.status != Status.AwaitingPolicy) revert DayzePayroll__AlreadyResolved();
        if (!FHE.verifyDecryptResultSafe(s.needsApproval, needsApproval, sig)) {
            revert DayzePayroll__BadDecryptProof();
        }

        if (needsApproval) {
            s.status = Status.Pending;
            emit StreamPending(id);
        } else {
            _activate(s, id);
        }
    }

    /// @inheritdoc IDayzePayroll
    function activateApproved(uint256 id) external {
        Stream storage s = s_streams[id];
        if (s.status != Status.Pending) revert DayzePayroll__NotPending();
        if (I_APPROVAL_POLICY.approvalCount(s.payer, id) < I_APPROVAL_POLICY.required(s.payer)) {
            revert DayzePayroll__NotEnoughApprovals();
        }
        _activate(s, id);
    }

    /// @inheritdoc IDayzePayroll
    /// @dev Pays `req` only if it fits both the stream's available amount and the payer's vault
    function withdraw(uint256 id, externalEuint64 amount, bytes calldata proof) external {
        Stream storage s = s_streams[id];
        if (msg.sender != s.payee) revert DayzePayroll__NotPayee();
        if (s.status != Status.Active && s.status != Status.Cancelled) revert DayzePayroll__NotWithdrawable();

        euint64 req = FHE.asEuint64(amount, proof);
        euint64 available = FHE.sub(_accrued(s), s.withdrawn); // withdrawn <= accrued always
        euint64 vault = s_vaults[s.payer][s.token];
        ebool ok = FHE.and(FHE.lte(req, available), FHE.lte(req, vault));
        euint64 pay = FHE.select(ok, req, FHE.asEuint64(0));

        euint64 withdrawn = FHE.add(s.withdrawn, pay);
        s.withdrawn = withdrawn;
        FHE.allowThis(withdrawn);
        FHE.allow(withdrawn, s.payee);
        FHE.allow(withdrawn, s.payer);
        I_AUDIT_REGISTRY.allowAuditors(s.payer, withdrawn);

        euint64 newVault = FHE.sub(vault, pay);
        s_vaults[s.payer][s.token] = newVault;
        FHE.allowThis(newVault);
        FHE.allow(newVault, s.payer);
        I_AUDIT_REGISTRY.allowAuditors(s.payer, newVault);

        emit Withdrawn(id, euint64.unwrap(withdrawn));

        // A never-funded vault means `pay` is 0, and the token reverts on a sender with no balance.
        // Skipping leaks nothing: `VaultFunded` already shows who funded which token.
        if (!FHE.isInitialized(vault)) return;

        FHE.allowThis(pay);
        // The returned amount equals `pay`: the vault check above keeps payroll's pooled balance >= pay
        // forge-lint: disable-next-line(unused-return)
        s.token.confidentialTransfer(s.payee, FHE.shareEuint64(pay, address(s.token)));
    }

    /// @inheritdoc IDayzePayroll
    function cancelStream(uint256 id) external {
        Stream storage s = s_streams[id];
        if (msg.sender != s.payer) revert DayzePayroll__NotPayer();
        if (s.status == Status.Cancelled) revert DayzePayroll__NotCancellable();

        // A stream that never went Active has startTime 0; end there too so it accrues nothing
        // forge-lint: disable-next-line(unsafe-typecast)
        s.endTime = s.status == Status.Active ? uint64(block.timestamp) : s.startTime;
        s.status = Status.Cancelled;
        emit StreamCancelled(id);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Starts a stream's accrual from now
    /// @param s The stream
    /// @param id The stream's id
    function _activate(Stream storage s, uint256 id) internal {
        s.status = Status.Active;
        // forge-lint: disable-next-line(unsafe-typecast)
        s.startTime = uint64(block.timestamp);
        emit StreamActivated(id, s.startTime);
    }

    /// @notice Computes the total amount a stream has accrued so far
    /// @dev Lazy: no state change. Elapsed time is plaintext; only the salary is encrypted.
    ///      Done in euint128 so `monthly * elapsed` can't overflow and nothing truncates per second.
    ///      Cancelled streams stop accruing at `endTime`.
    /// @param s The stream
    /// @return Encrypted `monthly * elapsed / PERIOD`, in the token's units
    function _accrued(Stream storage s) internal returns (euint64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 end = s.status == Status.Cancelled ? s.endTime : uint64(block.timestamp);
        uint64 elapsed = end - s.startTime;
        euint128 total = FHE.mul(FHE.asEuint128(s.monthly), FHE.asEuint128(uint256(elapsed)));
        return FHE.asEuint64(FHE.div(total, FHE.asEuint128(uint256(PERIOD))));
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IDayzePayroll
    function credential() external view returns (address) {
        return s_credential;
    }

    /// @inheritdoc IDayzePayroll
    function orgOf(address payer) external view returns (Org memory) {
        return s_orgs[payer];
    }

    /// @inheritdoc IDayzePayroll
    function getStream(uint256 id) external view returns (Stream memory) {
        return s_streams[id];
    }

    /// @inheritdoc IDayzePayroll
    function streamsOfPayer(address payer) external view returns (uint256[] memory) {
        return s_payerStreams[payer];
    }

    /// @inheritdoc IDayzePayroll
    function streamsOfPayee(address payee) external view returns (uint256[] memory) {
        return s_payeeStreams[payee];
    }

    /// @inheritdoc IDayzePayroll
    function vaultOf(address payer, IFHERC20 token) external view returns (euint64) {
        return s_vaults[payer][token];
    }
}
