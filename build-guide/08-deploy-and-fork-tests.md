# 08 — Deploy to Arbitrum Sepolia + fork tests

## Goal
All contracts live on Arbitrum Sepolia with real CoFHE. Demo data seeded. Addresses and ABIs exported to the frontend.

## Steps

### 1. `script/Deploy.s.sol`
Deploy order and wiring:
```text
MockERC20("USDC", 6), MockERC20("ARB", 18)   ← demo tokens you can mint
ConfidentialToken(usdc, ...)                ← forge auto-deploys + links ERC20ConfidentialLib
ConfidentialToken(arb, ...)
ConfidentialNative(WETH)                    ← Arbitrum Sepolia's canonical WETH, from env
AuditRegistry
ApprovalPolicy
DayzePayroll(policy, registry, PERIOD)
IncomeCredential(payroll)
policy.setPayroll(payroll)                  ← one-shot setters from 04/07
payroll.setCredential(credential)
payroll.addToken(cusdc), addToken(carb), addToken(ceth)
```
- Read `PERIOD` from env (`DEMO_PERIOD=600`). Default: 30 days.
- Read `WETH` from env. Look up the address on Arbiscan.
- To add a real ERC20 later: deploy one more `ConfidentialToken` and call `addToken`. No payroll redeploy.
- Write addresses to `deployments/421614.json` with `vm.writeJson`.

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
source .env   # RPC URL, ARBISCAN_API_KEY, DEPLOYER address; no secrets
forge script script/Deploy.s.sol \
  --rpc-url arbitrum_sepolia \
  --account dayze-deployer --sender $DEPLOYER \
  --broadcast --verify -vvvv
```
Forge asks for the keystore password. `--sender` must match the keystore address. If not, the simulation runs as the wrong address and ownership ends up wrong. If the linked library fails to verify, verify it alone with `forge verify-contract`.

### 2. Seeding (works with the keystore)
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
Goal: prove the contracts work with the **real** Task Manager, not just mocks.
- Skip them by default locally: `forge test --no-match-path "test/forks/*"`.
- Can test on a fork: plaintext paths, deployed state, trivial encryptions (`FHE.asEuint64(uint)`) and FHE ops not reverting, ACL grants (`FHE.isAllowed`).
- Can't test: decrypting in Forge. The threshold network is off-chain. Do real end-to-end decrypts in the frontend (or with `decryptForTx` in `encrypt.ts`, no key needed). Treat that as your integration test.

```bash
forge test --match-path "test/forks/*" --fork-url $ARBITRUM_SEPOLIA_RPC_URL -vv
```

### 4. Export to the frontend
`scripts/export-abis.sh`:
- Copy each `.abi` from `out/<Contract>.sol/<Contract>.json` into `frontend/lib/contracts/abis/*.ts` as `export const X = [...] as const`, so viem infers types.
- Copy `deployments/421614.json` into `frontend/lib/contracts/addresses.ts`.

## ✅ Checkpoint
- [ ] All contracts (3 wrappers, 2 mock tokens, 4 core contracts + library) deployed and verified on Arbiscan
- [ ] `s_supportedTokens` is true for all three wrappers
- [ ] Seed done: 1 org, 1 policy, 1 auditor, 4 streams (one `Pending`)
- [ ] On Arbiscan, a `withdraw` tx shows **no readable amount**. Screenshot it for the pitch.
- [ ] Fork tests pass
- [ ] `frontend/lib/contracts/` has addresses + typed ABIs

## Pitfalls
- Gas estimates for FHE calls on Arbitrum Sepolia can be low. Raise the gas limit if txs run out.
- Never use `vm.envUint("PRIVATE_KEY")` or `--private-key`. If a tutorial does, swap in `vm.startBroadcast()` + `--account`.
- If `--sender` doesn't match the keystore address, simulation and broadcast disagree. Keep `DEPLOYER` in `.env` in sync.
- Redeploying changes addresses. Re-run the export each time.

## Commit
`feat: keystore-based deploy + seed scripts, fork tests, frontend ABI export`
