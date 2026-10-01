# 08 — Deploy to Arbitrum Sepolia + fork tests

## Goal
All contracts live on Arbitrum Sepolia against real CoFHE, seeded with demo data, with addresses and ABIs exported to the frontend.

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
Read `PERIOD` from env (`DEMO_PERIOD=600`), defaulting to 30 days, and `WETH` from env (look the address up on Arbiscan). To support another real ERC20 later, deploy one more `ConfidentialToken` for it and call `addToken`; no payroll redeploy needed. Write the addresses to `deployments/421614.json` with `vm.writeJson`.

**No private key in the script.** Use the no-argument `vm.startBroadcast()`. Forge then signs with whatever `--account` you pass on the command line:

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
Forge prompts for the keystore password. `--sender` must match the keystore address, or the simulation runs as the wrong address and ownership ends up wrong. If verification fails for the linked library, verify it separately with `forge verify-contract`.

### 2. Seeding (keystore-friendly)
Encrypted inputs can't be made inside a Forge script on a live network, because they need the CoFHE ZK verifier (off-chain HTTP). So split the job: **Node only encrypts, `cast` signs.** No key ever reaches Node.

**a) `frontend/scripts/encrypt.ts`** (run with `npx tsx`, reusing `frontend/`'s `@cofhe/sdk` + viem, so the root stays npm-free):
```bash
npx tsx scripts/encrypt.ts --value 3000000000 --account $DEPLOYER --contract $PAYROLL
# prints: <handle> <proof>
```
Inside it: `createCofheClient(createCofheConfig({ supportedChains: [arbSepolia] }))` from `@cofhe/sdk/node`, connect with a viem public client plus a wallet client that carries **only the address** (`createWalletClient({ account: DEPLOYER, ... })`, a JSON-RPC account that can't sign), then `encryptInputs([Encryptable.uint64(v)]).setAccount(DEPLOYER).setConsumingContract(c).execute()`. On a live chain, encryption is a ZK proof checked by the CoFHE verifier, not a wallet signature, so no key is needed. Verify this against `@cofhe/sdk/core/encrypt/` when you build it; only the **mock** path writes transactions.

**b) `script/seed.sh`** calls the helper and sends each tx with `cast`:
```bash
read -r H P < <(cd frontend && npx tsx scripts/encrypt.ts --value 10000000000 --account $DEPLOYER --contract $POLICY)
cast send $POLICY "setThreshold(address,bytes32,bytes)" $CUSDC $H $P \
  --account dayze-deployer --rpc-url arbitrum_sepolia
```
It creates the org, sets the policy (approvers + a 10,000 cUSDC threshold and a 2 cETH threshold), adds an auditor, shields and funds cUSDC and ETH, and creates 4 streams (3k, 6k and 12k cUSDC, where the 12k one triggers approval, plus 0.5 cETH). Each `cast send` prompts for the password. That's about 10 prompts for the whole seed, which is fine for a one-off. If it gets tedious, `--password-file` pointing at a file **outside the repo** is an option; that's your call.

**Or skip the script** and seed through the UI once checkpoint 10 works. The browser wallet signs, so no keystore is involved.

**Policy resolution (`resolvePolicy`)** needs no special key: the employer UI already runs `decryptForTx` and submits it (checkpoint 10), and the function is permissionless. You don't need a background keeper holding a key. For the seeded 12k cUSDC stream, open the employer console once and it resolves.

### 3. Fork tests: `test/forks/LiveForkTest.t.sol`
Goal: prove your contracts work against the **real** Task Manager, not just mocks.
- Tag them so the default run skips them: `forge test --no-match-path "test/forks/*"` locally.
- What's realistic on a fork: plaintext-path checks, reading deployed state, that `FHE.asEuint64(uint)` trivial encryptions and FHE ops don't revert, and that ACL grants exist (`FHE.isAllowed`).
- What isn't: decrypting results inside Forge. The threshold network is off-chain. Do real end-to-end decrypts through the frontend (or a `decryptForTx` call in `encrypt.ts`, which needs no key) and treat that as your integration test.

```bash
forge test --match-path "test/forks/*" --fork-url $ARBITRUM_SEPOLIA_RPC_URL -vv
```

### 4. Export to the frontend
`scripts/export-abis.sh`: copy `out/<Contract>.sol/<Contract>.json` `.abi` into `frontend/lib/contracts/abis/*.ts` (as `export const X = [...] as const` so viem infers types), and `deployments/421614.json` into `frontend/lib/contracts/addresses.ts`.

## ✅ Checkpoint
- [ ] All contracts (3 wrappers, 2 mock tokens, 4 core contracts + library) deployed and verified on Arbiscan
- [ ] `s_supportedTokens` is true for all three wrappers
- [ ] Seed script run: 1 org, 1 policy, 1 auditor, 3 streams (one `Pending`)
- [ ] On Arbiscan, a `withdraw` tx shows **no readable amount**. Screenshot it for the pitch.
- [ ] Fork tests pass
- [ ] `frontend/lib/contracts/` has addresses + typed ABIs

## Pitfalls
- Arbitrum Sepolia gas estimation for FHE calls can be low; bump the gas limit if txs run out of gas.
- Never `vm.envUint("PRIVATE_KEY")`, never `--private-key`. If a tutorial snippet uses either, replace it with `vm.startBroadcast()` + `--account`.
- `--sender` mismatch with the keystore address makes simulation and broadcast disagree. Keep `DEPLOYER` in `.env` in sync.
- Redeploying changes addresses. Re-run the export every time.

## Commit
`feat: keystore-based deploy + seed scripts, fork tests, frontend ABI export`
