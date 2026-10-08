// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Script, console} from "forge-std/Script.sol";
import {IFHERC20} from "fhenix-confidential-contracts/interfaces/IFHERC20.sol";
import {ERC20_Harness} from "fhenix-confidential-contracts/test/ERC20_Harness.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {AuditRegistry} from "src/AuditRegistry.sol";
import {ConfidentialNative} from "src/ConfidentialNative.sol";
import {ConfidentialToken} from "src/ConfidentialToken.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {HumanRegistry} from "src/HumanRegistry.sol";
import {IDayzePayroll} from "src/interfaces/IDayzePayroll.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title InteractionsScript
 * @author Kelechi Kizito Ugwu
 * @notice Every plaintext call into a live Dayze deployment, one function each, run with `--sig`.
 * @dev Reads addresses from `deployments/<chainId>.json`. The signer comes from `--account`.
 *      Calls that take an encrypted input (fundVault, createStream, setThreshold, withdraw) or need
 *      a decrypt (resolvePolicy) can't run from Forge on a live chain: encryption needs Fhenix's
 *      off-chain ZK verifier. Do those in the app. See the Makefile for the `make` target per function.
 */
contract InteractionsScript is Script {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when this chain has no deployments/<chainId>.json
    error InteractionsScript__NotDeployed(uint256 chainId);

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Never expires, for `setOperator`
    uint48 internal constant FOREVER = type(uint48).max;

    /*//////////////////////////////////////////////////////////////
                       DEMO TOKENS AND SHIELDING
    //////////////////////////////////////////////////////////////*/

    /// @notice Mints demo USDC and ARB to the signer. Anyone can mint these test tokens.
    /// @param usdc Amount in USDC's 6 decimals, e.g. 10000e6
    /// @param arb Amount in ARB's 18 decimals, e.g. 1000e18
    function mintDemoTokens(uint256 usdc, uint256 arb) external {
        vm.startBroadcast();
        ERC20_Harness(_addr("usdc")).mint(msg.sender, usdc);
        ERC20_Harness(_addr("arb")).mint(msg.sender, arb);
        vm.stopBroadcast();
        console.log("Minted USDC (6 dp):", usdc);
        console.log("Minted ARB (18 dp):", arb);
    }

    /// @notice Shields the signer's USDC into cUSDC
    /// @param amount Amount in USDC's 6 decimals
    function shieldUsdc(uint256 amount) external {
        _shieldErc20("usdc", "cusdc", amount);
    }

    /// @notice Shields the signer's ARB into cARB. Anything below 1e12 wei is refunded as dust.
    /// @param amount Amount in ARB's 18 decimals
    function shieldArb(uint256 amount) external {
        _shieldErc20("arb", "carb", amount);
    }

    /// @notice Shields native ETH into cETH. Anything below 1e12 wei is refunded as dust.
    /// @param amountWei Amount of ETH in wei, e.g. 0.01 ether = 10000000000000000
    function shieldEth(uint256 amountWei) external {
        vm.startBroadcast();
        ConfidentialNative(payable(_addr("ceth"))).shieldNative{value: amountWei}(msg.sender);
        vm.stopBroadcast();
        console.log("Shielded ETH (wei):", amountWei);
    }

    /// @notice Lets payroll pull the signer's cUSDC, cARB and cETH, so `fundVault` works
    function setPayrollOperator() external {
        address payroll = _addr("payroll");
        vm.startBroadcast();
        IFHERC20(_addr("cusdc")).setOperator(payroll, FOREVER);
        IFHERC20(_addr("carb")).setOperator(payroll, FOREVER);
        IFHERC20(_addr("ceth")).setOperator(payroll, FOREVER);
        vm.stopBroadcast();
        console.log("Payroll is an operator for cUSDC, cARB and cETH:", payroll);
    }

    /*//////////////////////////////////////////////////////////////
                             EMPLOYER SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers the signer as an employer
    /// @param name Org name shown on credentials
    function createOrg(string calldata name) external {
        vm.startBroadcast();
        DayzePayroll(_addr("payroll")).createOrg(name);
        vm.stopBroadcast();
        console.log("Created org:", name);
    }

    /// @notice Adds an auditor who can read the signer's payroll handles from now on
    /// @param auditor The auditor's address
    function addAuditor(address auditor) external {
        vm.startBroadcast();
        AuditRegistry(_addr("auditRegistry")).addAuditor(auditor);
        vm.stopBroadcast();
        console.log("Added auditor:", auditor);
    }

    /// @notice Removes an auditor. Access to handles they already read stays.
    /// @param auditor The auditor's address
    function removeAuditor(address auditor) external {
        vm.startBroadcast();
        AuditRegistry(_addr("auditRegistry")).removeAuditor(auditor);
        vm.stopBroadcast();
        console.log("Removed auditor:", auditor);
    }

    /// @notice Sets the signer's k-of-n approvers. The threshold is encrypted, so set it in the app.
    /// @param approvers Approver addresses, e.g. "[0xabc...,0xdef...]"
    /// @param required How many approvals a stream above the threshold needs
    function setPolicy(address[] calldata approvers, uint8 required) external {
        vm.startBroadcast();
        ApprovalPolicy(_addr("approvalPolicy")).setPolicy(approvers, required);
        vm.stopBroadcast();
        console.log("Policy set. Approvers:", approvers.length);
        console.log("Required:", required);
    }

    /*//////////////////////////////////////////////////////////////
                         APPROVALS AND STREAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice Approves a pending stream as one of the payer's approvers
    /// @param payer The employer that owns the stream
    /// @param streamId The stream to approve
    function approve(address payer, uint256 streamId) external {
        vm.startBroadcast();
        ApprovalPolicy(_addr("approvalPolicy")).approve(payer, streamId);
        vm.stopBroadcast();
        console.log("Approved stream:", streamId);
    }

    /// @notice Activates a pending stream once it has enough approvals. Anyone can call it.
    /// @param streamId The stream to activate
    function activateApproved(uint256 streamId) external {
        vm.startBroadcast();
        DayzePayroll(_addr("payroll")).activateApproved(streamId);
        vm.stopBroadcast();
        console.log("Activated stream:", streamId);
    }

    /// @notice Cancels one of the signer's streams. What accrued before stays withdrawable.
    /// @param streamId The stream to cancel
    function cancelStream(uint256 streamId) external {
        vm.startBroadcast();
        DayzePayroll(_addr("payroll")).cancelStream(streamId);
        vm.stopBroadcast();
        console.log("Cancelled stream:", streamId);
    }

    /*//////////////////////////////////////////////////////////////
                             OWNER ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Allowlists another confidential wrapper. Payroll owner only.
    /// @param token The wrapper to accept
    function addToken(address token) external {
        vm.startBroadcast();
        DayzePayroll(_addr("payroll")).addToken(IFHERC20(token));
        vm.stopBroadcast();
        console.log("Allowlisted token:", token);
    }

    /// @notice Removes a wrapper from the allowlist. Existing streams keep withdrawing. Payroll owner only.
    /// @param token The wrapper to remove
    function removeToken(address token) external {
        vm.startBroadcast();
        DayzePayroll(_addr("payroll")).removeToken(IFHERC20(token));
        vm.stopBroadcast();
        console.log("Removed token:", token);
    }

    /// @notice Rotates the World ID attester key. HumanRegistry owner only.
    /// @param attester The new attester address
    function setAttester(address attester) external {
        vm.startBroadcast();
        HumanRegistry(_addr("humanRegistry")).setAttester(attester);
        vm.stopBroadcast();
        console.log("Attester set:", attester);
    }

    /*//////////////////////////////////////////////////////////////
                               READ-ONLY
    //////////////////////////////////////////////////////////////*/

    /// @notice Prints the deployment's wiring and an account's plaintext state. Sends nothing.
    /// @param who The account to look up
    function status(address who) external view {
        DayzePayroll payroll = DayzePayroll(_addr("payroll"));
        ApprovalPolicy policy = ApprovalPolicy(_addr("approvalPolicy"));

        console.log("Chain:", block.chainid);
        console.log("Payroll:", address(payroll));
        console.log("  period (s):", payroll.PERIOD());
        console.log("  policy wired:", policy.payroll() == address(payroll));
        console.log("  credential wired:", payroll.credential() == _addr("incomeCredential"));
        console.log("  cUSDC allowlisted:", payroll.s_supportedTokens(IFHERC20(_addr("cusdc"))));
        console.log("  cARB allowlisted:", payroll.s_supportedTokens(IFHERC20(_addr("carb"))));
        console.log("  cETH allowlisted:", payroll.s_supportedTokens(IFHERC20(_addr("ceth"))));

        console.log("Account:", who);
        IDayzePayroll.Org memory org = payroll.orgOf(who);
        console.log("  org:", org.exists ? org.name : "(none)");
        console.log("  streams as payer:", payroll.streamsOfPayer(who).length);
        console.log("  streams as payee:", payroll.streamsOfPayee(who).length);
        console.log("  has policy:", policy.hasPolicy(who));
        console.log("  auditors:", AuditRegistry(_addr("auditRegistry")).auditorCount(who));
        console.log("  verified human:", HumanRegistry(_addr("humanRegistry")).isHuman(who));
        console.log("  USDC (6 dp):", ERC20_Harness(_addr("usdc")).balanceOf(who));
        console.log("  ARB (18 dp):", ERC20_Harness(_addr("arb")).balanceOf(who));
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Approves a wrapper and shields the signer's underlying tokens
    /// @param underlyingKey JSON key of the ERC20
    /// @param wrapperKey JSON key of its wrapper
    /// @param amount Amount in the ERC20's decimals
    function _shieldErc20(string memory underlyingKey, string memory wrapperKey, uint256 amount) internal {
        address underlying = _addr(underlyingKey);
        address wrapper = _addr(wrapperKey);
        vm.startBroadcast();
        ERC20_Harness(underlying).approve(wrapper, amount);
        ConfidentialToken(wrapper).shield(msg.sender, amount);
        vm.stopBroadcast();
        console.log("Shielded into", wrapperKey, amount);
    }

    /// @notice Reads one address from deployments/<chainId>.json
    /// @param key The JSON key, e.g. "payroll"
    /// @return The address
    function _addr(string memory key) internal view returns (address) {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        if (!vm.exists(path)) revert InteractionsScript__NotDeployed(block.chainid);
        return vm.parseJsonAddress(vm.readFile(path), string.concat(".", key));
    }
}
