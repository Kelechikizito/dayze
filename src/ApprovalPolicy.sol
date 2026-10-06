// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, ebool, euint64, externalEuint64, sharedEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IApprovalPolicy} from "src/interfaces/IApprovalPolicy.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title ApprovalPolicy
 * @author Kelechi Kizito Ugwu
 * @notice Per-payer k-of-n approvers plus an encrypted monthly threshold per token.
 * @dev Salaries above the threshold need k approvals before payroll activates them.
 *      Thresholds stay encrypted. Who approved, and which tokens have a threshold, are public.
 *      Every `setPolicy` starts a new version, which drops the old approvers and their approvals.
 */
contract ApprovalPolicy is IApprovalPolicy, Ownable {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when `evaluate` is called by anyone but payroll
    error ApprovalPolicy__NotPayroll();

    /// @notice Thrown when payroll is set a second time
    error ApprovalPolicy__PayrollAlreadySet();

    /// @notice Thrown when an address argument is zero
    error ApprovalPolicy__ZeroAddress();

    /// @notice Thrown when `required` is 0 or more than the number of approvers
    error ApprovalPolicy__InvalidRequired();

    /// @notice Thrown when a policy lists more than `MAX_APPROVERS`
    error ApprovalPolicy__TooManyApprovers();

    /// @notice Thrown when a policy lists the same approver twice
    error ApprovalPolicy__DuplicateApprover();

    /// @notice Thrown when the caller is not one of the payer's approvers
    error ApprovalPolicy__NotApprover();

    /// @notice Thrown when an approver approves the same stream twice
    error ApprovalPolicy__AlreadyApproved();

    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice A payer's approver set
    struct Policy {
        address[] approvers;
        uint8 required; // approvals needed
        uint64 version; // bumped on every setPolicy; keys approvers and approvals
        bool exists;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Most approvers one policy can list
    uint256 public constant MAX_APPROVERS = 10;

    /// @notice The only contract allowed to call `evaluate`
    address private s_payroll;

    /// @notice Each payer's current policy
    mapping(address payer => Policy policy) private s_policies;

    /// @notice Whether an address approves for a payer, per policy version
    mapping(address payer => mapping(uint64 version => mapping(address approver => bool))) private s_isApprover;

    /// @notice Each payer's encrypted monthly threshold, per token
    mapping(address payer => mapping(address token => euint64 threshold)) private s_thresholds;

    /// @notice Whether a payer has set a threshold for a token
    mapping(address payer => mapping(address token => bool)) private s_hasThreshold;

    /// @notice Approvals per stream, per policy version
    mapping(address payer => mapping(uint64 version => mapping(uint256 streamId => uint8 count))) private
        s_approvalCount;

    /// @notice Who approved which stream, per policy version
    mapping(
        address payer => mapping(uint64 version => mapping(uint256 streamId => mapping(address approver => bool)))
    ) private s_approved;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted once, when the owner sets payroll
    /// @param payroll The payroll contract
    event PayrollSet(address indexed payroll);

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Restricts a function to the payroll contract
    modifier onlyPayroll() {
        if (msg.sender != s_payroll) revert ApprovalPolicy__NotPayroll();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Makes the deployer the owner, who sets payroll once
    constructor() Ownable(msg.sender) {}

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the payroll contract. Owner only, and only once.
    /// @param payrollAddress The payroll contract
    function setPayroll(address payrollAddress) external onlyOwner {
        if (payrollAddress == address(0)) revert ApprovalPolicy__ZeroAddress();
        if (s_payroll != address(0)) revert ApprovalPolicy__PayrollAlreadySet();
        s_payroll = payrollAddress;
        emit PayrollSet(payrollAddress);
    }

    /// @inheritdoc IApprovalPolicy
    function setPolicy(address[] calldata approvers, uint8 requiredApprovals) external {
        _setPolicy(msg.sender, approvers, requiredApprovals);
    }

    /// @inheritdoc IApprovalPolicy
    function setThreshold(address token, externalEuint64 threshold, bytes calldata proof) external {
        _setThreshold(msg.sender, token, threshold, proof);
    }

    /// @inheritdoc IApprovalPolicy
    /// @dev Must be called directly by payroll: `receiveEuint64Param` checks the sharer is the caller.
    ///      False with no policy. True with a policy but no threshold for `token` (fail closed).
    function evaluate(address payer, address token, sharedEuint64 monthly)
        external
        onlyPayroll
        returns (ebool needsApproval)
    {
        euint64 amount = FHE.receiveEuint64Param(monthly);
        if (!s_policies[payer].exists) {
            needsApproval = FHE.asEbool(false);
        } else if (!s_hasThreshold[payer][token]) {
            needsApproval = FHE.asEbool(true);
        } else {
            needsApproval = FHE.gt(amount, s_thresholds[payer][token]);
        }
        FHE.allowThis(needsApproval);
        FHE.allow(needsApproval, msg.sender);
    }

    /// @inheritdoc IApprovalPolicy
    function approve(address payer, uint256 streamId) external {
        _approve(payer, streamId, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Replaces `payer`'s approver set and starts a new policy version
    /// @param payer The payer whose policy changes
    /// @param approvers Addresses allowed to approve
    /// @param requiredApprovals Approvals needed
    function _setPolicy(address payer, address[] calldata approvers, uint8 requiredApprovals) internal {
        uint256 count = approvers.length;
        if (count > MAX_APPROVERS) revert ApprovalPolicy__TooManyApprovers();
        if (requiredApprovals == 0 || requiredApprovals > count) revert ApprovalPolicy__InvalidRequired();

        Policy storage policy = s_policies[payer];
        uint64 version = policy.version + 1;
        // Reverting is intended: a bad approver list must fail as a whole, never save part of a policy.
        // aderyn-ignore-next-line(require-revert-in-loop)
        for (uint256 i; i < count; ++i) {
            address approver = approvers[i];
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (approver == address(0)) revert ApprovalPolicy__ZeroAddress();
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (s_isApprover[payer][version][approver]) revert ApprovalPolicy__DuplicateApprover();
            s_isApprover[payer][version][approver] = true;
        }

        policy.approvers = approvers;
        policy.required = requiredApprovals;
        policy.version = version;
        policy.exists = true;
        emit PolicySet(payer, requiredApprovals, count);
    }

    /// @notice Stores `payer`'s encrypted monthly threshold for `token`
    /// @param payer The payer whose threshold changes
    /// @param token The confidential wrapper the threshold applies to
    /// @param threshold Encrypted threshold in the token's 6-decimal units
    /// @param proof Proof that verifies `threshold`
    function _setThreshold(address payer, address token, externalEuint64 threshold, bytes calldata proof) internal {
        if (token == address(0)) revert ApprovalPolicy__ZeroAddress();
        euint64 value = FHE.asEuint64(threshold, proof);
        FHE.allowThis(value);
        FHE.allow(value, payer); // the payer can view their own threshold
        s_thresholds[payer][token] = value;
        s_hasThreshold[payer][token] = true;
        emit ThresholdSet(payer, token);
    }

    /// @notice Records `approver`'s approval of `payer`'s stream under the current policy
    /// @param payer The payer that owns the stream
    /// @param streamId The stream to approve
    /// @param approver The approver signing off
    function _approve(address payer, uint256 streamId, address approver) internal {
        uint64 version = s_policies[payer].version;
        if (!s_isApprover[payer][version][approver]) revert ApprovalPolicy__NotApprover();
        if (s_approved[payer][version][streamId][approver]) revert ApprovalPolicy__AlreadyApproved();

        s_approved[payer][version][streamId][approver] = true;
        uint8 count = ++s_approvalCount[payer][version][streamId];
        emit Approved(payer, streamId, approver, count);
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IApprovalPolicy
    function approvalCount(address payer, uint256 streamId) external view returns (uint8) {
        return s_approvalCount[payer][s_policies[payer].version][streamId];
    }

    /// @inheritdoc IApprovalPolicy
    function required(address payer) external view returns (uint8) {
        return s_policies[payer].required;
    }

    /// @inheritdoc IApprovalPolicy
    function hasPolicy(address payer) external view returns (bool) {
        return s_policies[payer].exists;
    }

    /// @inheritdoc IApprovalPolicy
    function hasThreshold(address payer, address token) external view returns (bool) {
        return s_hasThreshold[payer][token];
    }

    /// @inheritdoc IApprovalPolicy
    function approversOf(address payer) external view returns (address[] memory) {
        return s_policies[payer].approvers;
    }

    /// @inheritdoc IApprovalPolicy
    function isApprover(address payer, address who) external view returns (bool) {
        return s_isApprover[payer][s_policies[payer].version][who];
    }

    /// @inheritdoc IApprovalPolicy
    function hasApproved(address payer, uint256 streamId, address who) external view returns (bool) {
        return s_approved[payer][s_policies[payer].version][streamId][who];
    }

    /// @inheritdoc IApprovalPolicy
    function thresholdOf(address payer, address token) external view returns (euint64) {
        return s_thresholds[payer][token];
    }

    /// @inheritdoc IApprovalPolicy
    function payroll() external view returns (address) {
        return s_payroll;
    }
}
