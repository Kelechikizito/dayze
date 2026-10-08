// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IFHERC20} from "fhenix-confidential-contracts/interfaces/IFHERC20.sol";
import {ERC20_Harness} from "fhenix-confidential-contracts/test/ERC20_Harness.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {ConfidentialNative} from "src/ConfidentialNative.sol";
import {ConfidentialToken} from "src/ConfidentialToken.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {HumanRegistry} from "src/HumanRegistry.sol";
import {IncomeCredential} from "src/IncomeCredential.sol";
import {DeployScript} from "script/deployment/DeployScript.s.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title LiveForkTest
 * @author Kelechi Kizito Ugwu
 * @notice Runs the deploy script against the real CoFHE TaskManager on an Arbitrum Sepolia or Base Sepolia fork.
 * @dev Skips itself on any other chain, so plain `forge test` ignores it. Run with:
 *      `forge test --match-path "test/forks/*" --fork-url $BASE_SEPOLIA_RPC_URL -vv`
 *      Can't test decryption or encrypted inputs here: both need Fhenix's off-chain services.
 *      Those are tested end to end from the frontend.
 */
contract LiveForkTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The deploy script, which owns everything it deploys in this test
    DeployScript internal deployer;

    /// @notice A fresh deployment on the fork
    DeployScript.Deployment internal d;

    /// @notice Pay period for the fresh deployment
    uint64 internal constant PERIOD = 600;

    /// @notice Stand-in attester
    address internal attester = makeAddr("attester");

    /// @notice A worker
    address internal alice = makeAddr("alice");

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Skips off-fork; otherwise deploys everything with the real deploy script
    function setUp() public {
        if (block.chainid != 421614 && block.chainid != 84532) {
            vm.skip(true);
            return;
        }
        deployer = new DeployScript();
        d = deployer.deploy(PERIOD, attester, deployer.wethFor(block.chainid));
    }

    /*//////////////////////////////////////////////////////////////
                            FRESH DEPLOYMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Every one-shot setter and allowlist entry is wired
    function test_fork_wiring() public view {
        DayzePayroll payroll = DayzePayroll(d.payroll);

        assertEq(ApprovalPolicy(d.approvalPolicy).payroll(), d.payroll);
        assertEq(payroll.credential(), d.incomeCredential);
        assertEq(address(payroll.I_APPROVAL_POLICY()), d.approvalPolicy);
        assertEq(address(payroll.I_AUDIT_REGISTRY()), d.auditRegistry);
        assertEq(payroll.PERIOD(), PERIOD);
        assertTrue(payroll.s_supportedTokens(IFHERC20(d.cusdc)));
        assertTrue(payroll.s_supportedTokens(IFHERC20(d.carb)));
        assertTrue(payroll.s_supportedTokens(IFHERC20(d.ceth)));

        assertEq(HumanRegistry(d.humanRegistry).attester(), attester);
        assertEq(address(IncomeCredential(d.incomeCredential).I_PAYROLL()), d.payroll);
        assertEq(address(IncomeCredential(d.incomeCredential).I_HUMAN_REGISTRY()), d.humanRegistry);

        assertEq(Ownable(d.payroll).owner(), address(deployer));
        assertEq(Ownable(d.approvalPolicy).owner(), address(deployer));
        assertEq(Ownable(d.humanRegistry).owner(), address(deployer));
    }

    /// @notice Wrapper decimals match the 6-decimal confidential units
    function test_fork_wrapperDecimals() public view {
        assertEq(ConfidentialToken(d.cusdc).decimals(), 6);
        assertEq(ConfidentialToken(d.carb).decimals(), 6);
        assertEq(ConfidentialNative(payable(d.ceth)).decimals(), 6);
        assertEq(ConfidentialToken(d.carb).rate(), 1e12);
    }

    /// @notice Shielding USDC runs FHE ops on the real TaskManager and grants the holder access
    function test_fork_shieldUsdcUsesRealTaskManager() public {
        ERC20_Harness(d.usdc).mint(alice, 1000e6);
        vm.startPrank(alice);
        ERC20_Harness(d.usdc).approve(d.cusdc, 1000e6);
        ConfidentialToken(d.cusdc).shield(alice, 1000e6);
        vm.stopPrank();

        euint64 bal = ConfidentialToken(d.cusdc).confidentialBalanceOf(alice);
        assertTrue(FHE.isInitialized(bal));
        assertTrue(FHE.isAllowed(bal, alice));
        assertFalse(FHE.isAllowed(bal, makeAddr("bob")));
        assertEq(ERC20_Harness(d.usdc).balanceOf(d.cusdc), 1000e6);
    }

    /// @notice Shielding native ETH goes through the chain's real WETH
    /// @dev Deal more than the value: with `isolate`, each call is its own tx, and on Base (OP Stack)
    ///      the sender also pays an L1 data fee. Sending the whole balance reverts before execution.
    function test_fork_shieldNativeUsesRealWeth() public {
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        ConfidentialNative(payable(d.ceth)).shieldNative{value: 1 ether}(alice);

        euint64 bal = ConfidentialNative(payable(d.ceth)).confidentialBalanceOf(alice);
        assertTrue(FHE.isInitialized(bal));
        assertTrue(FHE.isAllowed(bal, alice));
    }

    /// @notice Plaintext payroll paths work on the fork
    function test_fork_plaintextPayrollPaths() public {
        DayzePayroll payroll = DayzePayroll(d.payroll);

        vm.prank(alice);
        payroll.createOrg("Acme");
        assertTrue(payroll.orgOf(alice).exists);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        payroll.addToken(IFHERC20(d.usdc));

        vm.prank(alice);
        vm.expectRevert(DayzePayroll.DayzePayroll__AlreadyResolved.selector);
        payroll.resolvePolicy(1, false, "");
    }

    /*//////////////////////////////////////////////////////////////
                            LIVE DEPLOYMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice If this chain has a broadcast deployment, check it is wired the same way
    function test_fork_liveDeploymentIsWired() public {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        if (!vm.exists(path)) {
            vm.skip(true);
            return;
        }
        string memory json = vm.readFile(path);
        address payroll = vm.parseJsonAddress(json, ".payroll");
        address policy = vm.parseJsonAddress(json, ".approvalPolicy");
        address credential = vm.parseJsonAddress(json, ".incomeCredential");

        assertGt(payroll.code.length, 0);
        assertEq(ApprovalPolicy(policy).payroll(), payroll);
        assertEq(DayzePayroll(payroll).credential(), credential);
        assertTrue(DayzePayroll(payroll).s_supportedTokens(IFHERC20(vm.parseJsonAddress(json, ".cusdc"))));
        assertTrue(DayzePayroll(payroll).s_supportedTokens(IFHERC20(vm.parseJsonAddress(json, ".carb"))));
        assertTrue(DayzePayroll(payroll).s_supportedTokens(IFHERC20(vm.parseJsonAddress(json, ".ceth"))));
    }
}
