# 01 — Setup

## Goal
A Foundry project that compiles against CoFHE and runs an encrypted test on mocks.

## Prereqs
- Foundry (`foundryup`), Node 20+, npm
- A wallet with Arbitrum Sepolia ETH (faucet) for later checkpoints

## Steps

### 1. Clean up the half-finished OZ submodule removal
Git shows `lib/openzeppelin-contracts` deleted and `.gitmodules` edited. OZ comes from npm now, so finish the removal:

```bash
git rm --cached lib/openzeppelin-contracts 2>/dev/null
rm -rf .git/modules/lib/openzeppelin-contracts
cat .gitmodules   # should only list lib/forge-std
```

### 2. Root `package.json` + dependencies
```bash
npm init -y
npm install --save-dev \
  @fhenixprotocol/cofhe-contracts@0.2.0 \
  @cofhe/mock-contracts@0.7.1 \
  @cofhe/foundry-plugin@0.7.1 \
  fhenix-confidential-contracts@0.4.0 \
  @openzeppelin/contracts@5.4.0 \
  @openzeppelin/contracts-upgradeable@5.4.0
```
Pin OZ to **5.4.0**, the version the CoFHE packages depend on. Mixing versions gives confusing duplicate-symbol errors.

### 3. Fix `remappings.txt`
Your current file maps `@cofhe/foundry-plugin/` to the package root, but the Solidity lives in `contracts/`. Replace the file with:

```
forge-std/=lib/forge-std/src/
@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/
@openzeppelin/contracts-upgradeable/=node_modules/@openzeppelin/contracts-upgradeable/
@fhenixprotocol/cofhe-contracts/=node_modules/@fhenixprotocol/cofhe-contracts/
@cofhe/mock-contracts/=node_modules/@cofhe/mock-contracts/
@cofhe/foundry-plugin/=node_modules/@cofhe/foundry-plugin/contracts/
fhenix-confidential-contracts/=node_modules/fhenix-confidential-contracts/contracts/
```

`foundry.toml` is already correct. Keep `isolate = true`: without it, tests pass on mocks and then fail on Arbitrum Sepolia because ACL checks are skipped between calls.

### 4. `.env`
```
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=0x...          # deployer / employer
ARBISCAN_API_KEY=...        # for --verify
```
`.env` is already gitignored. Check with `git check-ignore .env`.

### 5. Smoke test: `HelloFHE`
`src/HelloFHE.sol`, a throwaway contract that proves the whole pipeline works:

```solidity
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
import {CofheTest} from "@cofhe/foundry-plugin/CofheTest.sol";
import {CofheClient} from "@cofhe/foundry-plugin/CofheClient.sol";
import {externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

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

Note that the encrypted input is **bound to the consuming contract** (`address(hello)`). The SDK does the same in the browser with `.setConsumingContract(addr)`. If you pass the wrong address, verification fails.

## ✅ Checkpoint
```bash
forge build
forge test --match-contract HelloFHETest -vv
```
- [ ] `forge build` is clean (warnings are fine)
- [ ] `test_setAndDouble` passes
- [ ] Remove the `allowThis` in `set` and re-run: `double()` should now **fail**. This proves `isolate` and the ACL are active.
- [ ] Put the `allowThis` back

## Pitfalls
- **"Stack too deep" / code size errors** in mocks: `code_size_limit` is already raised. If you hit stack-too-deep in your own code, add `via_ir = true` to `foundry.toml` (slower compiles).
- **Every FHE op returns a new handle.** Forgetting `FHE.allowThis(newHandle)` is the #1 CoFHE bug. It works within one transaction and fails in the next.
- `CofheTest` inherits forge-std `Test`. Don't inherit `Test` again.

## Commit
`chore: set up CoFHE toolchain and remappings, add HelloFHE smoke test`
