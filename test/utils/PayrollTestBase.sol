// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {ebool, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IFHERC20} from "fhenix-confidential-contracts/interfaces/IFHERC20.sol";
import {CofheClient} from "@cofhe/foundry-plugin/CofheClient.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {AuditRegistry} from "src/AuditRegistry.sol";
import {DayzePayroll} from "src/DayzePayroll.sol";
import {DayzeTestBase} from "./DayzeTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title PayrollTestBase
 * @author Kelechi Kizito Ugwu
 * @notice Shared setup for payroll tests: deploys payroll, allowlists the wrappers, creates the org.
 * @dev `_period()` is virtual so each suite runs once with 30 days and once with the 600s demo period.
 *      Amounts are in 6-decimal units: 3000e6 is 3,000 cUSDC, 1e6 is 1 cETH.
 */
abstract contract PayrollTestBase is DayzeTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    DayzePayroll internal payroll;

    /// @notice Approval policy payroll is wired to
    ApprovalPolicy internal policy;

    /// @notice Registry of the employer's auditors
    AuditRegistry internal registry;

    /// @notice Wrappers cast to the type payroll takes
    IFHERC20 internal tUsdc;
    IFHERC20 internal tArb;
    IFHERC20 internal tEth;

    /// @notice cUSDC the employer shields in setup
    uint64 internal constant EMPLOYER_USDC = 10_000e6;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys payroll, allowlists cUSDC and cETH, creates the employer's org and shields 10,000 USDC
    function setUp() public virtual override {
        super.setUp();

        policy = new ApprovalPolicy();
        registry = new AuditRegistry();
        payroll = new DayzePayroll(address(policy), address(registry), _period());
        policy.setPayroll(address(payroll));
        vm.label(address(policy), "ApprovalPolicy");
        vm.label(address(registry), "AuditRegistry");
        vm.label(address(payroll), "DayzePayroll");

        tUsdc = IFHERC20(address(cusdc));
        tArb = IFHERC20(address(carb));
        tEth = IFHERC20(address(ceth));
        payroll.addToken(tUsdc);
        payroll.addToken(tEth);

        vm.prank(employer);
        payroll.createOrg("Acme");

        _mintAndShield(usdc, cusdc, employer, EMPLOYER_USDC);
        vm.startPrank(employer);
        cusdc.setOperator(address(payroll), type(uint48).max);
        ceth.setOperator(address(payroll), type(uint48).max);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice The pay period payroll is deployed with
    /// @return Period length in seconds
    function _period() internal pure virtual returns (uint64);

    /// @notice Encrypts `amount` as `client` for payroll
    /// @param client The signer of the input
    /// @param amount Plaintext amount
    /// @return handle The encrypted input
    /// @return proof Proof that verifies `handle`
    function _encrypt(CofheClient client, uint64 amount) internal returns (externalEuint64 handle, bytes memory proof) {
        (handle, proof) = client.createExternalEuint64(amount, address(payroll));
    }

    /// @notice Funds the employer's vault for `token` with `amount`
    /// @param token The wrapper to fund
    /// @param amount Amount to pull
    function _fund(IFHERC20 token, uint64 amount) internal {
        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, amount);
        vm.prank(employer);
        payroll.fundVault(token, h, p);
    }

    /// @notice Shields `units` cETH (6-decimal units) for the employer
    /// @param units Amount in cETH units; 1e6 is 1 ETH
    function _shieldEth(uint64 units) internal {
        uint256 value = uint256(units) * ceth.rate();
        vm.deal(employer, value);
        vm.prank(employer);
        ceth.shieldNative{value: value}(employer);
    }

    /// @notice Creates a stream from the employer to alice; it waits in `AwaitingPolicy`
    /// @param token The wrapper to pay in
    /// @param monthly Monthly salary
    /// @return id The new stream id
    function _createStream(IFHERC20 token, uint64 monthly) internal returns (uint256 id) {
        (externalEuint64 h, bytes memory p) = _encrypt(employerClient, monthly);
        vm.prank(employer);
        id = payroll.createStream(alice, token, h, p);
    }

    /// @notice Decrypts a stream's public `needsApproval` bit, as any off-chain caller would
    /// @param id The stream
    /// @return needsApproval The decrypted bit
    /// @return sig Decrypt signature over `(handle, needsApproval)`
    function _decryptPolicyBit(uint256 id) internal view returns (bool needsApproval, bytes memory sig) {
        ebool bit = payroll.getStream(id).needsApproval;
        uint256 value;
        (, value, sig) = bobClient.decryptForTx_withoutACP(ebool.unwrap(bit));
        needsApproval = value == 1;
    }

    /// @notice Decrypts the policy bit and posts it with `resolvePolicy`
    /// @param id The stream
    /// @return needsApproval The decrypted bit
    function _resolve(uint256 id) internal returns (bool needsApproval) {
        bytes memory sig;
        (needsApproval, sig) = _decryptPolicyBit(id);
        payroll.resolvePolicy(id, needsApproval, sig);
    }

    /// @notice Creates a stream and resolves the policy. With no policy set, the stream goes `Active`.
    /// @param token The wrapper to pay in
    /// @param monthly Monthly salary
    /// @return id The new stream id
    function _createActiveStream(IFHERC20 token, uint64 monthly) internal returns (uint256 id) {
        id = _createStream(token, monthly);
        _resolve(id);
    }

    /// @notice Withdraws `amount` from stream `id` as alice
    /// @param id The stream
    /// @param amount Amount requested
    function _withdraw(uint256 id, uint64 amount) internal {
        (externalEuint64 h, bytes memory p) = _encrypt(aliceClient, amount);
        vm.prank(alice);
        payroll.withdraw(id, h, p);
    }

    /// @notice Returns alice's plaintext balance of `token`, treating an unset balance as 0
    /// @param token The wrapper to read
    /// @return The balance
    function _aliceBalance(IFHERC20 token) internal view returns (uint64) {
        euint64 bal = token.confidentialBalanceOf(alice);
        return euint64.unwrap(bal) == bytes32(0) ? 0 : getPlaintext(bal);
    }
}
