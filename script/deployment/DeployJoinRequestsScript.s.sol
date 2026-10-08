// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {JoinRequests} from "src/JoinRequests.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title DeployJoinRequestsScript
 * @author Kelechi Kizito Ugwu
 * @notice Adds JoinRequests to an existing deployment, without redeploying payroll.
 * @dev Reads payroll from deployments/<chainId>.json and writes `joinRequests` back into the same file,
 *      only on `--broadcast`. Fresh deployments get it from DeployScript instead.
 */
contract DeployJoinRequestsScript is Script {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when this chain has no deployments/<chainId>.json
    error DeployJoinRequestsScript__NotDeployed(uint256 chainId);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys JoinRequests against the chain's payroll and records its address
    /// @return joinRequests The new contract
    function run() external returns (address joinRequests) {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        if (!vm.exists(path)) revert DeployJoinRequestsScript__NotDeployed(block.chainid);
        address payroll = vm.parseJsonAddress(vm.readFile(path), ".payroll");

        vm.startBroadcast();
        joinRequests = address(new JoinRequests(payroll));
        vm.stopBroadcast();

        console.log("JoinRequests:", joinRequests);
        console.log("  for payroll:", payroll);
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            vm.writeJson(vm.toString(joinRequests), path, ".joinRequests");
        }
    }
}
