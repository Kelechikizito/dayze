# 01 — Setup (Foundry-only, no npm for contracts)

## Goal

A Foundry project that compiles against CoFHE and runs an encrypted test on mocks. **Every Solidity dependency comes from `forge install`.**

## Why this needs tweaks

Fhenix ships its contracts as Hardhat-style npm packages. Their docs say `npm install`, and their remappings point at `node_modules/`. We skip npm. Each package has a public git repo with a matching tag, so `forge install` works if:

- each remapping points at the right **subfolder**, and
- we fix one Hardhat-only import.

| npm package (what docs say)                                   | forge install (what we use)                              | Solidity lives in                                                |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| `@openzeppelin/contracts@5.4.0`                               | `OpenZeppelin/openzeppelin-contracts@v5.4.0`             | `contracts/`                                                     |
| `@openzeppelin/contracts-upgradeable@5.4.0`                   | `OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0` | `contracts/`                                                     |
| `@fhenixprotocol/cofhe-contracts@0.2.0`                       | `FhenixProtocol/cofhe-contracts@v0.2.0`                  | `contracts/` (npm flattens it to the root; git doesn't)          |
| `fhenix-confidential-contracts@0.4.0`                         | `FhenixProtocol/fhenix-confidential-contracts@v0.4.0`    | `contracts/`                                                     |
| `@cofhe/mock-contracts@0.7.1` + `@cofhe/foundry-plugin@0.7.1` | `FhenixProtocol/cofhesdk@8bda9b3…` (one monorepo)        | `packages/mock-contracts/`, `packages/foundry-plugin/contracts/` |

**Hardhat quirk:** `MockCoFHE.sol` imports `hardhat/console.sol`. forge-std has the same `console.sol`, so one remapping fixes it: `hardhat/=lib/forge-std/src/`. No Hardhat needed.

**Why a commit hash for cofhesdk:** its tags look like `@cofhe/foundry-plugin@0.7.1`. The extra `@` breaks `forge install repo@tag`. So we pin the tag's commit: `8bda9b39d39d9cf2969305ed20227edeb010f0c6` (mock-contracts 0.7.1 uses the same commit).

**Why OZ v5.4.0:** every Fhenix package is built and tested on it.

> Checked 2026-09-28 in a clean Foundry project: these commands, remappings and the `HelloFHE` test work. The test passes. Removing `allowThis` makes it fail with `ACLNotAllowed`, as expected.

## Prereqs

- Foundry (`foundryup`)
- Node 20+, only for the frontend and the seed script's encrypt helper (08). **Not** for contracts.
- A wallet with Arbitrum Sepolia ETH for later checkpoints

## Steps

### 1. Clean up the old OZ submodule and npm files

**To do:**
- [ ] Run the commands below to remove the old OZ submodule and the root npm files
- [ ] Check that `cat .gitmodules` lists only `lib/forge-std`
- [ ] Commit the cleanup (commit 1 at the bottom)

Git has `lib/openzeppelin-contracts` staged as deleted and `.gitmodules` edited. `forge install` won't run while `.gitmodules` has uncommitted changes (`cannot safely install dependency … has existing changes`). Finish the removal and commit first:

```bash
git rm -r --cached lib/openzeppelin-contracts 2>/dev/null
rm -rf lib/openzeppelin-contracts .git/modules/lib/openzeppelin-contracts
git config --remove-section submodule.lib/openzeppelin-contracts 2>/dev/null
rm -f package.json package-lock.json      # root npm files aren't needed for contracts
cat .gitmodules                          # should list only lib/forge-std
git add .gitmodules && git commit -m "Remove stale OpenZeppelin submodule before reinstalling pinned deps."
```

The next step reinstalls OZ at the right version.

### 2. Install dependencies

**To do:**
- [ ] Run the `forge install` command below
- [ ] Check that `ls lib` shows 6 folders

```bash
forge install \
  OpenZeppelin/openzeppelin-contracts@v5.4.0 \
  OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0 \
  FhenixProtocol/cofhe-contracts@v0.2.0 \
  FhenixProtocol/fhenix-confidential-contracts@v0.4.0 \
  FhenixProtocol/cofhesdk@8bda9b39d39d9cf2969305ed20227edeb010f0c6
```

`forge-std` is already there. `ls lib` should show 6 folders.

### 3. `remappings.txt`: replace the file

**To do:**
- [ ] Replace everything in `remappings.txt` with the block below
- [ ] Run `forge remappings` and check each path points at a folder that exists

```text
forge-std/=lib/forge-std/src/
hardhat/=lib/forge-std/src/
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
@fhenixprotocol/cofhe-contracts/=lib/cofhe-contracts/contracts/
@cofhe/mock-contracts/=lib/cofhesdk/packages/mock-contracts/
@cofhe/foundry-plugin/=lib/cofhesdk/packages/foundry-plugin/contracts/
fhenix-confidential-contracts/=lib/fhenix-confidential-contracts/contracts/
```

We keep the import **prefixes** Fhenix uses (`@fhenixprotocol/cofhe-contracts/…`, `@cofhe/mock-contracts/contracts/…`). We only change where they point. So their Hardhat-style imports compile in Forge as-is.

### 4. `foundry.toml`: one change

**To do:**
- [ ] Change `libs` to `["lib"]` in `foundry.toml`
- [ ] Leave `isolate = true` and `auto_detect_remappings = false` as they are

```toml
libs = ["lib"]          # was ["node_modules", "lib"]
```

The rest is already right.

- Keep `isolate = true`. Without it, ACL checks are skipped between calls, so tests pass on mocks but fail on Arbitrum Sepolia.
- Keep `auto_detect_remappings = false`. It stops Forge from guessing remappings from the monorepo's nested `foundry.toml` files.

### 5. Keys go in the Foundry keystore, not `.env`

**To do:**
- [ ] Import the deployer key: `cast wallet import dayze-deployer --interactive`
- [ ] Write down its address: `cast wallet address --account dayze-deployer`
- [ ] Create `.env` with the three non-secret values below
- [ ] Check that `.env` is ignored: `git check-ignore .env`

Never put a private key in `.env`, a script, or a shell variable. Import each signing key once into the encrypted keystore (`~/.foundry/keystores/`):

```bash
cast wallet import dayze-deployer --interactive   # paste key + set a password; also the employer/payer for seeding
cast wallet list
cast wallet address --account dayze-deployer      # note this address
```

Later, sign with `--account dayze-deployer` (plus `--sender <address>` for `forge script`). Foundry asks for the password. Other demo roles (second approver, worker, landlord, auditor) use **browser wallets**. They don't go in the keystore.

`.env` holds only non-secret config:

```bash
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBISCAN_API_KEY=...                 # for --verify
DEPLOYER=0x...                       # address of dayze-deployer, used as --sender
```

`.env` is gitignored (`git check-ignore .env`). With no keys in it, a leak does no harm.

The `0xA11CE`-style constants in tests are **test-only** keys. `CofheClient` uses them to sign mock inputs in Forge. They never touch a live network. Never put a real key there.

### 6. Smoke test: `HelloFHE`

**To do:**
- [ ] Create `src/HelloFHE.sol` with the code below
- [ ] Create `test/unit/HelloFHETest.t.sol` with the test below
- [ ] Run the commands in **Checkpoint** and tick every box
- [ ] Commit (commits 2 and 3 at the bottom)

`src/HelloFHE.sol` is a throwaway contract that proves the pipeline works:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {FHE, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title HelloFHE
 * @author Kaykay
 * @notice Throwaway smoke test that stores an encrypted number and can double it.
 * @dev Proves the CoFHE pipeline and ACL work under Forge mocks. Every FHE operation
 *      returns a new handle, so every new handle needs fresh `allowThis` and `allowSender` calls.
 */
contract HelloFHE {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Handle to the encrypted stored value
    euint64 private s_stored;

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Stores an encrypted value supplied by the caller
    /// @param value Encrypted input handle, bound to this contract
    /// @param proof Proof that verifies `value`
    function set(externalEuint64 value, bytes calldata proof) external {
        s_stored = FHE.asEuint64(value, proof);
        FHE.allowThis(s_stored); // contract can reuse it in later txs
        FHE.allowSender(s_stored); // caller can unseal it
    }

    /// @notice Doubles the stored encrypted value
    function double() external {
        s_stored = FHE.add(s_stored, s_stored);
        FHE.allowThis(s_stored); // EVERY new handle needs fresh allows
        FHE.allowSender(s_stored);
    }

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the handle to the encrypted stored value
    /// @return The `euint64` handle; only allowed addresses can unseal it
    function getStored() external view returns (euint64) {
        return s_stored;
    }
}
```

`test/unit/HelloFHETest.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {CofheTest} from "@cofhe/foundry-plugin/CofheTest.sol";
import {CofheClient} from "@cofhe/foundry-plugin/CofheClient.sol";
import {externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {HelloFHE} from "src/HelloFHE.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title HelloFHETest
 * @author Kaykay
 * @notice Checks that an encrypted value can be set, doubled and unsealed on CoFHE mocks.
 * @dev `CofheTest` already inherits forge-std `Test`. `ALICE_PK` is a throwaway test-only key.
 */
contract HelloFHETest is CofheTest {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Test-only private key used to sign mock encrypted inputs
    uint256 private constant ALICE_PK = 0xA11CE;

    /// @notice CoFHE client acting as alice
    CofheClient private s_alice;

    /// @notice Contract under test
    HelloFHE private s_hello;

    /*//////////////////////////////////////////////////////////////
                            PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the CoFHE mocks, connects alice and deploys `HelloFHE`
    function setUp() public {
        deployMocks();
        s_alice = createCofheClient();
        s_alice.connect(ALICE_PK);
        s_hello = new HelloFHE();
    }

    /// @notice Setting 21 and doubling it stores an encrypted 42
    function test_setAndDouble() public {
        (externalEuint64 handle, bytes memory proof) = s_alice.createExternalEuint64(21, address(s_hello));
        vm.startPrank(s_alice.account());
        s_hello.set(handle, proof);
        s_hello.double();
        vm.stopPrank();
        expectPlaintext(s_hello.getStored(), uint64(42));
    }
}
```

The encrypted input is **bound to the contract that uses it** (`address(hello)`). The browser SDK does the same with `.setConsumingContract(addr)`. A wrong address fails verification.

## ✅ Checkpoint

```bash
forge build
forge test --match-contract HelloFHETest -vv
```

- [ ] `forge build` is clean. Ignore the few warnings from mock contracts (unused parameter, mutability).
- [ ] `test_setAndDouble` passes
- [ ] Delete `FHE.allowThis(s_stored);` in `set` and re-run. It must **fail** with `ACLNotAllowed(...)`. This proves `isolate` and the ACL work.
- [ ] Put the line back
- [ ] `git status` shows new submodules in `lib/` and an updated `.gitmodules`. Commit them.

## Pitfalls

- **`Source "…" not found`**: a remapping is one level off. Check the "Solidity lives in" column above. Usually `cofhe-contracts` is missing `/contracts/`.
- **`hardhat/console.sol` not found**: add the `hardhat/` remapping.
- **Updating CoFHE later**: find the new cofhesdk commit with `git ls-remote --tags https://github.com/FhenixProtocol/cofhesdk | grep foundry-plugin`. Use the `^{}` (dereferenced) hash. Bump `cofhe-contracts` to the version in that release's `package.json`. Always update both together.
- **Stack too deep**: add `via_ir = true` to `foundry.toml` (slower builds).
- **Every FHE op returns a new handle.** Forgetting `FHE.allowThis(newHandle)` is the #1 CoFHE bug. It works in one transaction and fails in the next.
- `CofheTest` already inherits forge-std `Test`. Don't inherit `Test` again.

## Commits (one logical change each)

1. `Remove stale OpenZeppelin submodule before reinstalling pinned deps.` (step 1)
2. `Install pinned OZ, CoFHE and FHERC20 dependencies via forge.` (steps 2–4)
3. `Add HelloFHE smoke test proving CoFHE mocks and ACL work.` (step 6)
