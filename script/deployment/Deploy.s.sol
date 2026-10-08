// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IWETH} from "fhenix-confidential-contracts/interfaces/IWETH.sol";
import {IFHERC20} from "fhenix-confidential-contracts/interfaces/IFHERC20.sol";
import {ERC20_Harness} from "fhenix-confidential-contracts/test/ERC20_Harness.sol";
import {ConfidentialToken} from "src/ConfidentialToken.sol";
import {ConfidentialNative} from "src/ConfidentialNative.sol";
import {AuditRegistry} from "src/AuditRegistry.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {HumanRegistry} from "src/HumanRegistry.sol";
import {IncomeCredential} from "src/IncomeCredential.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title Deploy
 * @author Kelechi Kizito Ugwu
 * @notice Deploys and wires every Dayze contract on Arbitrum Sepolia or Base Sepolia.
 * @dev Signer comes from `--account`, never from a private key in env. Writes `deployments/<chainId>.json`.
 *      Env: `ATTESTER` (required, an address), `DEMO_PERIOD` (optional, seconds; default 30 days),
 *      `WETH` (optional; defaults to the chain's canonical WETH).
 *      `deploy` is public so fork tests can run the exact same wiring without broadcasting.
 */
contract Deploy is Script {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown on a chain with no known WETH and no `WETH` env var
    error Deploy__UnknownWeth(uint256 chainId);

    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Every deployed address
    struct Deployment {
        address usdc;
        address arb;
        address cusdc;
        address carb;
        address ceth;
        address auditRegistry;
        address approvalPolicy;
        address payroll;
        address humanRegistry;
        address incomeCredential;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Canonical WETH on Arbitrum Sepolia
    address internal constant WETH_ARBITRUM_SEPOLIA = 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73;

    /// @notice Canonical WETH on Base Sepolia (OP Stack predeploy)
    address internal constant WETH_BASE_SEPOLIA = 0x4200000000000000000000000000000000000006;

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys, wires, and writes the addresses to `deployments/<chainId>.json`
    /// @dev Writes only on `--broadcast`, so a dry run never leaves fake addresses on disk
    /// @return d The deployed addresses
    function run() external returns (Deployment memory d) {
        uint64 period = uint64(vm.envOr("DEMO_PERIOD", uint256(30 days)));
        address attester = vm.envAddress("ATTESTER");
        address weth = vm.envOr("WETH", wethFor(block.chainid));

        vm.startBroadcast();
        d = deploy(period, attester, weth);
        vm.stopBroadcast();

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _write(d, period);
    }

    /*//////////////////////////////////////////////////////////////
                            PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys and wires everything. The caller (broadcaster or test) becomes the owner.
    /// @param period Length of one pay period in seconds
    /// @param attester Address of the World ID backend attester key
    /// @param weth The chain's WETH, wrapped by cETH
    /// @return d The deployed addresses
    function deploy(uint64 period, address attester, address weth) public returns (Deployment memory d) {
        // Demo tokens anyone can mint
        d.usdc = address(new ERC20_Harness("USD Coin", "USDC", 6));
        d.arb = address(new ERC20_Harness("Arbitrum", "ARB", 18));

        // Confidential wrappers
        d.cusdc = address(new ConfidentialToken(IERC20(d.usdc), "Confidential USDC", "cUSDC"));
        d.carb = address(new ConfidentialToken(IERC20(d.arb), "Confidential ARB", "cARB"));
        d.ceth = address(new ConfidentialNative(IWETH(weth)));

        // Core
        d.auditRegistry = address(new AuditRegistry());
        d.approvalPolicy = address(new ApprovalPolicy());
        d.payroll = address(new DayzePayroll(d.approvalPolicy, d.auditRegistry, period));
        d.humanRegistry = address(new HumanRegistry(attester));
        d.incomeCredential = address(new IncomeCredential(d.payroll, d.humanRegistry));

        // Wiring: one-shot setters first, so every stream gets the credential
        ApprovalPolicy(d.approvalPolicy).setPayroll(d.payroll);
        DayzePayroll payroll = DayzePayroll(d.payroll);
        payroll.setCredential(d.incomeCredential);
        payroll.addToken(IFHERC20(d.cusdc));
        payroll.addToken(IFHERC20(d.carb));
        payroll.addToken(IFHERC20(d.ceth));
    }

    /// @notice Returns the canonical WETH for a chain
    /// @param chainId The chain
    /// @return The WETH address
    function wethFor(uint256 chainId) public pure returns (address) {
        if (chainId == 421614) return WETH_ARBITRUM_SEPOLIA;
        if (chainId == 84532) return WETH_BASE_SEPOLIA;
        revert Deploy__UnknownWeth(chainId);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Writes the addresses to `deployments/<chainId>.json`
    /// @param d The deployed addresses
    /// @param period The pay period used
    function _write(Deployment memory d, uint64 period) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "period", period);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "usdc", d.usdc);
        vm.serializeAddress(k, "arb", d.arb);
        vm.serializeAddress(k, "cusdc", d.cusdc);
        vm.serializeAddress(k, "carb", d.carb);
        vm.serializeAddress(k, "ceth", d.ceth);
        vm.serializeAddress(k, "auditRegistry", d.auditRegistry);
        vm.serializeAddress(k, "approvalPolicy", d.approvalPolicy);
        vm.serializeAddress(k, "payroll", d.payroll);
        vm.serializeAddress(k, "humanRegistry", d.humanRegistry);
        string memory json = vm.serializeAddress(k, "incomeCredential", d.incomeCredential);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
