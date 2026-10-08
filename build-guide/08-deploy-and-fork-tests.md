# 08 — Deploy to Arbitrum Sepolia + Base Sepolia, fork tests

## Goal
All contracts live on Arbitrum Sepolia and Base Sepolia with real CoFHE. Demo data seeded. Addresses and ABIs exported to the frontend.

**Two chains, one script.** CoFHE runs on both testnets, and the TaskManager sits at the same address on each. Everything below works per chain. Pick the chain with `CHAIN=arbitrum_sepolia` (default) or `CHAIN=base_sepolia` in the `make` targets. CoFHE has no mainnet chains yet, so mainnet RPCs aren't needed.

## Steps

### 1. `script/deployment/Deploy.s.sol`

**To do:**
- [ ] Create `script/deployment/Deploy.s.sol`. Deploy and wire everything in the order below.
- [ ] Put the wiring in a public `deploy(period, attester, weth)` function. `run()` calls it inside the broadcast. Fork tests call it directly.
- [ ] Read `DEMO_PERIOD` and `ATTESTER` from env. Pick WETH by chain id, with an optional `WETH` env override.
- [ ] Write the addresses to `deployments/<chainId>.json`, **only on `--broadcast`** (`vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)`)
- [ ] In `foundry.toml`: add `fs_permissions` for `./deployments`, and an `[etherscan]` entry per chain
- [ ] Check your keystore matches `DEPLOYER` (`make check-deployer`) and has gas (`make balance`)
- [ ] Dry run (`make deploy-dry`). Then broadcast (`make deploy`). Repeat with `CHAIN=base_sepolia`.
- [ ] Check every contract is verified on Arbiscan and Basescan

Deploy order and wiring:
```text
ERC20_Harness("USDC", 6), ERC20_Harness("ARB", 18)   ← demo tokens you can mint (Fhenix test harness)
ConfidentialToken(usdc, ...)                ← forge auto-deploys + links ERC20ConfidentialLib
ConfidentialToken(arb, ...)
ConfidentialNative(WETH)                    ← the chain's canonical WETH (below)
AuditRegistry
ApprovalPolicy
DayzePayroll(policy, registry, PERIOD)
HumanRegistry(ATTESTER)                     ← attester address from env (07a)
IncomeCredential(payroll, humanRegistry)
policy.setPayroll(payroll)                  ← one-shot setters from 04/07
payroll.setCredential(credential)
payroll.addToken(cusdc), addToken(carb), addToken(ceth)
```
- Read `PERIOD` from env (`DEMO_PERIOD=600`). Default: 30 days.
- WETH: Arbitrum Sepolia `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73`, Base Sepolia `0x4200000000000000000000000000000000000006` (OP Stack predeploy). Check both with `cast call <weth> "symbol()(string)"`.
- Read `ATTESTER` from env. It's the **address** of the backend attester key (07a), not the key.
- To add a real ERC20 later: deploy one more `ConfidentialToken` and call `addToken`. No payroll redeploy.
- Write addresses to `deployments/<chainId>.json` with `vm.writeJson`. A dry run must not write: fake addresses on disk end up in the frontend.
- Verification: one **Etherscan V2** key covers Arbiscan and Basescan. An old Arbiscan-only key won't verify on Base. Check it with `curl "https://api.etherscan.io/v2/api?chainid=84532&module=account&action=balance&address=$DEPLOYER&tag=latest&apikey=$KEY"`.

**No private key in the script.** Use `vm.startBroadcast()` with no argument. Forge signs with the `--account` you pass on the command line:

```solidity
/// @notice Deploys and wires every Dayze contract
/// @dev Signer comes from `--account`, never from `vm.envUint("PRIVATE_KEY")`. Set `DEMO_PERIOD` for short demo months.
function run() external {
    uint64 period = uint64(vm.envOr("DEMO_PERIOD", uint256(30 days)));
    vm.startBroadcast();
    // ... deploy + wire ...
    vm.stopBroadcast();
}
```

```bash
make check-deployer                 # keystore address == DEPLOYER
make deploy                         # Arbitrum Sepolia
make deploy CHAIN=base_sepolia      # Base Sepolia
```
`make deploy` runs:
```bash
DEMO_PERIOD=600 forge script script/deployment/Deploy.s.sol \
  --rpc-url $CHAIN --account $ACCOUNT --sender $DEPLOYER --broadcast --verify -vvvv
```
Forge asks for the keystore password. `--sender` must match the keystore address. If not, the simulation runs as the wrong address and ownership ends up wrong. If the linked library fails to verify, verify it alone with `forge verify-contract`.

### 2. Seeding (works with the keystore)

**To do:**
- [ ] Create `frontend/scripts/encrypt.ts` (**a** below)
- [ ] Create `script/seed.sh` (**b** below)
- [ ] Run it. Check: 1 org, 1 policy, 1 auditor, 4 streams.
- [ ] Or skip both and seed through the UI after checkpoint 10

A Forge script can't make encrypted inputs on a live network. They need the CoFHE ZK verifier (off-chain HTTP). So split the job: **Node only encrypts, `cast` signs.** No key ever reaches Node.

**a) `frontend/scripts/encrypt.ts`** (run with `npx tsx`). It reuses `frontend/`'s `@cofhe/sdk` + viem, so the root stays npm-free:
```bash
npx tsx scripts/encrypt.ts --value 3000000000 --account $DEPLOYER --contract $PAYROLL
# prints: <handle> <proof>
```
Inside it:
1. `createCofheClient(createCofheConfig({ supportedChains: [arbSepolia] }))` from `@cofhe/sdk/node`.
2. Connect with a viem public client and a wallet client that holds **only the address** (`createWalletClient({ account: DEPLOYER, ... })`, a JSON-RPC account that can't sign).
3. `encryptInputs([Encryptable.uint64(v)]).setAccount(DEPLOYER).setConsumingContract(c).execute()`.

On a live chain, encryption uses a ZK proof checked by the CoFHE verifier, not a wallet signature. So no key is needed. Confirm this in `@cofhe/sdk/core/encrypt/` when you build it. Only the **mock** path sends transactions.

**b) `script/seed.sh`** calls the helper and sends each tx with `cast`:
```bash
read -r H P < <(cd frontend && npx tsx scripts/encrypt.ts --value 10000000000 --account $DEPLOYER --contract $POLICY)
cast send $POLICY "setThreshold(address,bytes32,bytes)" $CUSDC $H $P \
  --account dayze-deployer --rpc-url arbitrum_sepolia
```
The seed does this:
- create the org
- set the policy: approvers, a 10,000 cUSDC threshold, a 2 cETH threshold
- add an auditor
- shield and fund cUSDC and ETH
- create 4 streams: 3k, 6k and 12k cUSDC (12k triggers approval), plus 0.5 cETH

Each `cast send` asks for the password, about 10 times in total. Fine for a one-off. If it gets annoying, use `--password-file` with a file **outside the repo**. Your call.

**Or skip the script.** Seed through the UI once checkpoint 10 works. The browser wallet signs, so no keystore needed.

**`resolvePolicy` needs no special key.** It is permissionless, and the employer UI already runs `decryptForTx` and submits it (checkpoint 10). No background keeper with a key. For the seeded 12k cUSDC stream, open the employer console once and it resolves.

### 3. Fork tests: `test/forks/LiveForkTest.t.sol`

**To do:**
- [ ] Create `test/forks/LiveForkTest.t.sol`. In `setUp`, skip unless the chain id is 421614 or 84532. Then run `new Deploy().deploy(...)` on the fork.
- [ ] Test the wiring, wrapper decimals, shielding USDC (real TaskManager) and ETH (real WETH), and plaintext payroll paths
- [ ] Add one test that reads `deployments/<chainId>.json` and checks the live contracts. It skips until you deploy.
- [ ] Run it on both chains: `make test-fork-all`

Goal: prove the contracts work with the **real** Task Manager, not just mocks.
- Skip them by default locally: `forge test --no-match-path "test/forks/*"`.
- Can test on a fork: plaintext paths, deployed state, trivial encryptions (`FHE.asEuint64(uint)`) and FHE ops not reverting, ACL grants (`FHE.isAllowed`).
- Can't test: decrypting in Forge. The threshold network is off-chain. Do real end-to-end decrypts in the frontend (or with `decryptForTx` in `encrypt.ts`, no key needed). Treat that as your integration test.

```bash
make test-fork                      # Arbitrum Sepolia
make test-fork CHAIN=base_sepolia
```
Because of the skip in `setUp`, plain `forge test` ignores these. No `--no-match-path` needed.

### 4. Export to the frontend

**To do:**
- [ ] Create `script/export-abis.sh` that copies ABIs and addresses (below)
- [ ] Run it (`make export-abis`). Check that `frontend/lib/contracts/` has typed ABIs and `addresses.ts`.
- [ ] Check the output type-checks: `cd frontend && npx tsc --noEmit`

`script/export-abis.sh`:
- Copy each `.abi` from `out/<Contract>.sol/<Contract>.json` into `frontend/lib/contracts/abis/*.ts` as `export const XAbi = [...] as const;`, so viem infers types. Keep `as const` on the same line as the `]`. A newline before it breaks the TypeScript.
- Merge every `deployments/*.json` into `frontend/lib/contracts/addresses.ts`, keyed by chain id.

## ✅ Checkpoint
- [ ] All contracts (3 wrappers, 2 mock tokens, 5 core contracts + library) deployed and verified on Arbiscan and Basescan
- [ ] `s_supportedTokens` is true for all three wrappers
- [ ] Seed done: 1 org, 1 policy, 1 auditor, 4 streams (one `Pending`)
- [ ] On Arbiscan, a `withdraw` tx shows **no readable amount**. Screenshot it for the pitch.
- [ ] Fork tests pass on both chains
- [ ] `frontend/lib/contracts/` has addresses + typed ABIs

## Pitfalls
- Gas estimates for FHE calls on Arbitrum Sepolia can be low. Raise the gas limit if txs run out.
- Never use `vm.envUint("PRIVATE_KEY")` or `--private-key`. If a tutorial does, swap in `vm.startBroadcast()` + `--account`.
- If `--sender` doesn't match the keystore address, simulation and broadcast disagree. Keep `DEPLOYER` in `.env` in sync.
- Redeploying changes addresses. Re-run the export each time.
- **Base fork tests and `isolate`:** each call is its own transaction, and on an OP Stack chain the sender also pays an L1 data fee. A test that sends a wallet's whole balance as `msg.value` reverts before the call runs. Deal a little extra.
- `forge fmt` with no paths formats the whole repo. Pass file paths, or run `make fmt` on purpose.

## Commit
`feat: keystore-based deploy + seed scripts, fork tests, frontend ABI export`
