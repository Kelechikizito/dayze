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
 * @dev Money flows vault → payroll → stream → payee. Once per period the payer runs payroll with an
 *      encrypted budget: each stream gets min(its salary for the rest of the period, budget left), and
 *      that amount leaves the vault. A stream streams only its allocation, linearly to the period's end,
 *      so pay never outruns the money. Finished periods move into `banked`, which stays withdrawable.
 *      Streaming is lazy, computed in euint128 on each withdraw. Over-withdrawals pay 0 instead of
 *      reverting, so nothing leaks.
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

    /// @notice Thrown when running payroll for a stream that isn't Active
    error DayzePayroll__NotActive();

    /// @notice Thrown when running payroll for a stream paid in another token
    error DayzePayroll__WrongToken();

    /// @notice Thrown when running payroll for a stream already funded this period
    error DayzePayroll__AlreadyFunded();

    /// @notice Thrown when running payroll from a vault that was never funded
    error DayzePayroll__VaultNotFunded();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Policy that decides which streams need approval
    IApprovalPolicy public immutable I_APPROVAL_POLICY;

    /// @notice Registry of each payer's auditors
    IAuditRegistry public immutable I_AUDIT_REGISTRY;

    /// @notice Length of one pay period in seconds: 30 days in prod, e.g. 600 (10 min) for the demo.
    ///         Periods are fixed windows from time 0, the same for every payer.
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

        _setVault(msg.sender, token, FHE.add(s_vaults[msg.sender][token], moved));

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

        id = ++s_streamCount;
        Stream storage s = s_streams[id];
        s.payer = msg.sender;
        s.payee = payee;
        s.token = token;
        s.monthly = monthlyAmt;
        // Encrypted zeros the payee and payer can read; auditors get access once they change
        s.withdrawn = _zeroFor(msg.sender, payee);
        s.allocated = _zeroFor(msg.sender, payee);
        s.banked = _zeroFor(msg.sender, payee);

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
    /// @dev Nothing here reveals whether the budget or vault ran short: every stream gets an allocation,
    ///      possibly 0, and only the payee (and payer, auditors) can read theirs.
    function runPayroll(IFHERC20 token, externalEuint64 budget, bytes calldata proof, uint256[] calldata ids)
        external
    {
        if (!s_orgs[msg.sender].exists) revert DayzePayroll__NoOrg();

        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp);
        uint64 end = _periodEnd(nowTs);
        euint64 vault = s_vaults[msg.sender][token];
        // Leaks nothing: `VaultFunded` already shows who funded which token. It also keeps `withdraw`'s
        // "never funded" check true: only funding initializes a vault.
        if (!FHE.isInitialized(vault)) revert DayzePayroll__VaultNotFunded();
        euint64 pot = FHE.min(FHE.asEuint64(budget, proof), vault);
        euint64 spent = FHE.asEuint64(0);

        for (uint256 i; i < ids.length; ++i) {
            Stream storage s = s_streams[ids[i]];
            if (s.payer != msg.sender) revert DayzePayroll__NotPayer();
            if (s.token != token) revert DayzePayroll__WrongToken();
            if (s.status != Status.Active) revert DayzePayroll__NotActive();
            if (s.allocEnd == end) revert DayzePayroll__AlreadyFunded();

            // The last allocation's period is over, so all of it was earned
            if (s.allocEnd != 0) _setBanked(s, FHE.add(s.banked, s.allocated));

            euint64 want = _scale(s.monthly, end - nowTs, PERIOD);
            euint64 give = FHE.min(want, pot);
            pot = FHE.sub(pot, give);
            spent = FHE.add(spent, give);

            _setAllocated(s, give);
            s.allocStart = nowTs;
            s.allocEnd = end;
        }

        _setVault(msg.sender, token, FHE.sub(vault, spent));
        emit PayrollRun(msg.sender, token, end, ids.length);
    }

    /// @inheritdoc IDayzePayroll
    /// @dev No vault check: what a stream streams was already set aside out of the vault
    function withdraw(uint256 id, externalEuint64 amount, bytes calldata proof) external {
        Stream storage s = s_streams[id];
        if (msg.sender != s.payee) revert DayzePayroll__NotPayee();
        if (s.status != Status.Active && s.status != Status.Cancelled) revert DayzePayroll__NotWithdrawable();

        euint64 req = FHE.asEuint64(amount, proof);
        euint64 available = FHE.sub(_streamed(s), s.withdrawn); // withdrawn <= streamed always
        euint64 pay = FHE.select(FHE.lte(req, available), req, FHE.asEuint64(0));

        euint64 withdrawn = FHE.add(s.withdrawn, pay);
        s.withdrawn = withdrawn;
        _allowStream(s, withdrawn);

        emit Withdrawn(id, euint64.unwrap(withdrawn));

        // A never-funded vault means nothing was set aside, so `pay` is 0, and the token reverts
        // on a sender with no balance. Skipping leaks nothing: `VaultFunded` already shows who funded what.
        if (!FHE.isInitialized(s_vaults[s.payer][s.token])) return;

        FHE.allowThis(pay);
        // The returned amount equals `pay`: allocations come out of funded vaults, so payroll holds >= pay
        // forge-lint: disable-next-line(unused-return)
        s.token.confidentialTransfer(s.payee, FHE.shareEuint64(pay, address(s.token)));
    }

    /// @inheritdoc IDayzePayroll
    function cancelStream(uint256 id) external {
        Stream storage s = s_streams[id];
        if (msg.sender != s.payer) revert DayzePayroll__NotPayer();
        if (s.status == Status.Cancelled) revert DayzePayroll__NotCancellable();

        // Bank what the allocation streamed so far; the rest goes back to the vault
        if (s.allocEnd != 0) {
            euint64 earned = _allocationStreamed(s);
            _setBanked(s, FHE.add(s.banked, earned));
            _setVault(s.payer, s.token, FHE.add(s_vaults[s.payer][s.token], FHE.sub(s.allocated, earned)));
            _setAllocated(s, FHE.asEuint64(0));
            s.allocEnd = 0;
        }

        // A stream that never went Active has startTime 0; end there too
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

    /// @notice Total a stream has streamed so far: everything banked plus its live allocation's share
    /// @param s The stream
    /// @return Encrypted amount, in the token's units
    function _streamed(Stream storage s) internal returns (euint64) {
        if (s.allocEnd == 0) return s.banked;
        return FHE.add(s.banked, _allocationStreamed(s));
    }

    /// @notice How much of the current allocation has streamed: linear from `allocStart` to `allocEnd`
    /// @dev Lazy: no state change. Times are plaintext; only the amount is encrypted.
    /// @param s The stream; must have an allocation
    /// @return Encrypted amount, all of `allocated` once its period is over
    function _allocationStreamed(Stream storage s) internal returns (euint64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs >= s.allocEnd) return s.allocated;
        return _scale(s.allocated, nowTs - s.allocStart, s.allocEnd - s.allocStart);
    }

    /// @notice `amount * num / den` without overflow or per-second truncation
    /// @dev In euint128 so `amount * num` can't overflow. `num <= den` everywhere it's used.
    /// @param amount Encrypted amount
    /// @param num Plaintext numerator
    /// @param den Plaintext denominator, non-zero
    /// @return Encrypted result
    function _scale(euint64 amount, uint64 num, uint64 den) internal returns (euint64) {
        euint128 total = FHE.mul(FHE.asEuint128(amount), FHE.asEuint128(uint256(num)));
        return FHE.asEuint64(FHE.div(total, FHE.asEuint128(uint256(den))));
    }

    /// @notice End of the pay period containing `timestamp`
    /// @param timestamp Any time
    /// @return The next multiple of `PERIOD` after `timestamp`
    function _periodEnd(uint64 timestamp) internal view returns (uint64) {
        return (timestamp / PERIOD + 1) * PERIOD;
    }

    /// @notice An encrypted 0 that payroll, the payer and the payee can use
    /// @param payer The stream's payer
    /// @param payee The stream's payee
    /// @return The handle
    function _zeroFor(address payer, address payee) internal returns (euint64) {
        euint64 zero = FHE.asEuint64(0);
        FHE.allowThis(zero);
        FHE.allow(zero, payee);
        FHE.allow(zero, payer);
        return zero;
    }

    /// @notice Lets payroll, the payee, the payer and the payer's auditors read a stream value
    /// @param s The stream
    /// @param value The handle
    function _allowStream(Stream storage s, euint64 value) internal {
        FHE.allowThis(value);
        FHE.allow(value, s.payee);
        FHE.allow(value, s.payer);
        I_AUDIT_REGISTRY.allowAuditors(s.payer, value);
    }

    /// @notice Stores a stream's allocation and grants access to it
    /// @param s The stream
    /// @param value The new allocation
    function _setAllocated(Stream storage s, euint64 value) internal {
        s.allocated = value;
        _allowStream(s, value);
    }

    /// @notice Stores a stream's banked total and grants access to it
    /// @param s The stream
    /// @param value The new banked total
    function _setBanked(Stream storage s, euint64 value) internal {
        s.banked = value;
        _allowStream(s, value);
    }

    /// @notice Stores a payer's vault balance and grants access to it
    /// @param payer The payer
    /// @param token The wrapper
    /// @param value The new balance
    function _setVault(address payer, IFHERC20 token, euint64 value) internal {
        s_vaults[payer][token] = value;
        FHE.allowThis(value);
        FHE.allow(value, payer);
        I_AUDIT_REGISTRY.allowAuditors(payer, value);
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

    /// @inheritdoc IDayzePayroll
    function periodEnd(uint64 timestamp) external view returns (uint64) {
        return _periodEnd(timestamp);
    }
}
