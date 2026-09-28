# 01 — Setup (Foundry-only, no npm for contracts)

## Goal

A Foundry project that compiles against CoFHE and runs an encrypted test on mocks, with **every Solidity dependency installed through `forge install`**.

## Why this needs tweaking

Fhenix publishes its contracts as Hardhat-style npm packages. Their READMEs say `npm install`, and their internal remappings point at `node_modules/`. We don't need npm, though: every package lives in a public git repo at a matching tag, so `forge install` works as long as the remappings point at the right **subfolder** of each repo and we paper over one Hardhat-only import.

| npm package (what docs say)                                   | forge install (what we use)                              | Solidity lives in                                                |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| `@openzeppelin/contracts@5.4.0`                               | `OpenZeppelin/openzeppelin-contracts@v5.4.0`             | `contracts/`                                                     |
| `@openzeppelin/contracts-upgradeable@5.4.0`                   | `OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0` | `contracts/`                                                     |
| `@fhenixprotocol/cofhe-contracts@0.2.0`                       | `FhenixProtocol/cofhe-contracts@v0.2.0`                  | `contracts/` (npm flattens it to the root; git doesn't)          |
| `fhenix-confidential-contracts@0.4.0`                         | `FhenixProtocol/fhenix-confidential-contracts@v0.4.0`    | `contracts/`                                                     |
| `@cofhe/mock-contracts@0.7.1` + `@cofhe/foundry-plugin@0.7.1` | `FhenixProtocol/cofhesdk@8bda9b3…` (one monorepo)        | `packages/mock-contracts/`, `packages/foundry-plugin/contracts/` |

**The Hardhat quirk:** `MockCoFHE.sol` imports `hardhat/console.sol`. forge-std ships an identical `console.sol`, so one remapping, `hardhat/=lib/forge-std/src/`, fixes it. No Hardhat needed.

**Why a commit hash for cofhesdk:** its tags look like `@cofhe/foundry-plugin@0.7.1`. The extra `@` breaks `forge install repo@tag` parsing, so we pin the commit that tag points to: `8bda9b39d39d9cf2969305ed20227edeb010f0c6` (mock-contracts 0.7.1 is the same commit).

**Why pin OZ to v5.4.0:** it's the version every Fhenix package is built and tested against.

> Verified on 2026-09-28: these exact commands, remappings and the `HelloFHE` test below were run in a clean Foundry project. The test passes, and removing `allowThis` makes it fail with `ACLNotAllowed`, as expected.

## Prereqs

- Foundry (`foundryup`)
- Node 20+, only for the frontend and the encrypt helper used by the seed script (08), **not** for contracts
- A wallet with Arbitrum Sepolia ETH for later checkpoints

## Steps

### 1. Clean up the half-removed OZ submodule and npm leftovers

Git currently has `lib/openzeppelin-contracts` staged as deleted and `.gitmodules` edited. `forge install` refuses to run while `.gitmodules` has uncommitted changes (`cannot safely install dependency … has existing changes`), so finish the removal and commit it first:

```bash
git rm -r --cached lib/openzeppelin-contracts 2>/dev/null
rm -rf lib/openzeppelin-contracts .git/modules/lib/openzeppelin-contracts
git config --remove-section submodule.lib/openzeppelin-contracts 2>/dev/null
rm -f package.json package-lock.json      # root npm files aren't needed for contracts
cat .gitmodules                          # should list only lib/forge-std
git add .gitmodules && git commit -m "Remove stale OpenZeppelin submodule before reinstalling pinned deps."
```

We reinstall OZ in the next step, pinned to the right version.

### 2. Install dependencies

```bash
forge install \
  OpenZeppelin/openzeppelin-contracts@v5.4.0 \
  OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0 \
  FhenixProtocol/cofhe-contracts@v0.2.0 \
  FhenixProtocol/fhenix-confidential-contracts@v0.4.0 \
  FhenixProtocol/cofhesdk@8bda9b39d39d9cf2969305ed20227edeb010f0c6
```

`forge-std` is already installed. `ls lib` should now show 6 folders.

### 3. `remappings.txt`: replace the whole file

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

We keep the import **prefixes** the Fhenix packages use internally (`@fhenixprotocol/cofhe-contracts/…`, `@cofhe/mock-contracts/contracts/…`) and only change where they resolve. That's why their Hardhat-style imports compile under Forge unchanged.

### 4. `foundry.toml`: one change

```toml
libs = ["lib"]          # was ["node_modules", "lib"]
```

Everything else is already right. Keep `isolate = true`: without it, tests pass on mocks and then fail on Arbitrum Sepolia because ACL checks are skipped between calls. Keep `auto_detect_remappings = false` so Forge doesn't guess remappings from the monorepo's nested `foundry.toml` files.

### 5. Keys live in the Foundry keystore, not `.env`

No private key ever goes in `.env`, a script, or a shell variable. Import each key you'll sign with on-chain once, into the encrypted keystore (`~/.foundry/keystores/`):

```bash
cast wallet import dayze-deployer --interactive   # paste key + set a password; also the employer/payer for seeding
cast wallet list
cast wallet address --account dayze-deployer      # note this address
```

For later checkpoints you'll sign with `--account dayze-deployer` (plus `--sender <address>` for `forge script`), and Foundry prompts for the password. The other demo roles (second approver, worker, landlord, auditor) are **browser wallets** and never need to be in the keystore.

`.env` then holds only non-secret config:

```bash
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBISCAN_API_KEY=...                 # for --verify
DEPLOYER=0x...                       # address of dayze-deployer, used as --sender
```

`.env` is gitignored anyway (`git check-ignore .env`), but with no keys in it, a leak is harmless.

The `0xA11CE`-style constants in the tests are throwaway **test-only** keys that `CofheClient` needs to sign mock inputs inside Forge. They never touch a live network. Don't reuse a real key there.

### 6. Smoke test: `HelloFHE`

`src/HelloFHE.sol`, a throwaway contract that proves the pipeline works:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract HelloFHE {
    euint64 public stored;

    function set(externalEuint64 v, bytes calldata proof) external {
        stored = FHE.asEuint64(v, proof);
        FHE.allowThis(stored);        // contract can reuse it in later txs
        FHE.allowSender(stored);      // caller can unseal it
    }

    function double() external {
        stored = FHE.add(stored, stored);
        FHE.allowThis(stored);        // EVERY new handle needs fresh allows
        FHE.allowSender(stored);
    }
}
```

`test/HelloFHE.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {CofheTest} from "@cofhe/foundry-plugin/CofheTest.sol";
import {CofheClient} from "@cofhe/foundry-plugin/CofheClient.sol";
import {externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {HelloFHE} from "../src/HelloFHE.sol";

contract HelloFHETest is CofheTest {
    CofheClient alice;
    HelloFHE hello;
    uint256 constant ALICE_PK = 0xA11CE;

    function setUp() public {
        deployMocks();
        alice = createCofheClient();
        alice.connect(ALICE_PK);
        hello = new HelloFHE();
    }

    function test_setAndDouble() public {
        (externalEuint64 h, bytes memory sig) = alice.createExternalEuint64(21, address(hello));
        vm.startPrank(alice.account());
        hello.set(h, sig);
        hello.double();
        vm.stopPrank();
        expectPlaintext(hello.stored(), uint64(42));
    }
}
```

The encrypted input is **bound to the consuming contract** (`address(hello)`). The browser SDK does the same with `.setConsumingContract(addr)`. If you pass the wrong address, verification fails.

## ✅ Checkpoint

```bash
forge build
forge test --match-contract HelloFHETest -vv
```

- [ ] `forge build` is clean. The mock contracts emit a few warnings (unused parameter, mutability); ignore them.
- [ ] `test_setAndDouble` passes
- [ ] Delete the `FHE.allowThis(stored);` line in `set` and re-run: it must **fail** with `ACLNotAllowed(...)`. This proves `isolate` and the ACL are active.
- [ ] Put the line back
- [ ] `git status` shows the new submodules under `lib/` and `.gitmodules` updated. Commit them.

## Pitfalls

- **`Source "…" not found`**: a remapping points one level too high or low. Compare it with the "Solidity lives in" column above. The usual culprit is `cofhe-contracts` needing `/contracts/`.
- **`hardhat/console.sol` not found**: the `hardhat/` remapping is missing.
- **Updating CoFHE later**: pick the new cofhesdk commit with `git ls-remote --tags https://github.com/FhenixProtocol/cofhesdk | grep foundry-plugin`, use the `^{}` (dereferenced) hash, and bump `cofhe-contracts` to whatever version that release's `package.json` depends on. Keep them in lockstep.
- **Stack too deep** in your own contracts: add `via_ir = true` to `foundry.toml` (slower compiles).
- **Every FHE op returns a new handle.** Forgetting `FHE.allowThis(newHandle)` is the #1 CoFHE bug. It works within one transaction and fails in the next.
- `CofheTest` already inherits forge-std `Test`. Don't inherit `Test` again.

## Commits (one logical change each)

1. `Remove stale OpenZeppelin submodule before reinstalling pinned deps.` (step 1)
2. `Install pinned OZ, CoFHE and FHERC20 dependencies via forge.` (steps 2–4)
3. `Add HelloFHE smoke test proving CoFHE mocks and ACL work.` (step 6)
