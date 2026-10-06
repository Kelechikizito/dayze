// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {FHE, ebool, euint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IApprovalPolicy} from "src/interfaces/IApprovalPolicy.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title PayrollHarness
 * @author Kelechi Kizito Ugwu
 * @notice Test-only stand-in for payroll: shares a salary with the policy and calls `evaluate`.
 */
contract PayrollHarness {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The policy under test
    IApprovalPolicy private immutable i_policy;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the policy to call
    /// @param policy The approval policy
    constructor(IApprovalPolicy policy) {
        i_policy = policy;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Encrypts `monthly`, shares it with the policy and returns the policy's answer
    /// @param payer The payer whose policy applies
    /// @param token The confidential wrapper the salary is paid in
    /// @param monthly Plaintext monthly salary, in 6-decimal units
    /// @return needsApproval Encrypted `monthly > threshold[token]`
    function evaluate(address payer, address token, uint64 monthly) external returns (ebool needsApproval) {
        euint64 amount = FHE.asEuint64(monthly);
        FHE.allowThis(amount);
        needsApproval = i_policy.evaluate(payer, token, FHE.shareEuint64(amount, address(i_policy)));
    }
}
