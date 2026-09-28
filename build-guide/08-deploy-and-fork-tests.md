# 08 — Deploy to Arbitrum Sepolia + fork tests

## Goal
All five contracts live on Arbitrum Sepolia against real CoFHE, seeded with demo data, with addresses and ABIs exported to the frontend.

## Steps

### 1. `script/Deploy.s.sol`
Deploy order and wiring:
```
MockUSDC
ConfidentialUSDC(usdc)                 ← forge auto-deploys + links ERC20ConfidentialLib
AuditRegistry
ApprovalPolicy
DayzePayroll(cusdc, policy, registry, PERIOD)
IncomeCredential(payroll, PERIOD)
policy.setPayroll(payroll)             ← one-shot setters from 04/07
payroll.setCredential(credential)
```
Read `PERIOD` from env (`DEMO_PERIOD=600`), defaulting to 30 days. Write the addresses to `deployments/421614.json` with `vm.writeJson`.

```bash
source .env
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify -vvvv
```
If verification fails for the linked library, verify it separately with `forge verify-contract`.

### 2. Seeding
Encrypted inputs can't be made inside a Forge script on a live network, because they need the CoFHE ZK verifier. Two options:
- **Recommended:** a small Node script (`scripts/seed.ts` using `@cofhe/sdk/node` + viem) that creates the org, sets the policy (threshold $10k), adds an auditor, shields and funds, and creates 3 streams (e.g. $3k, $6k, $12k, where the last one triggers approval).
- Or seed through the UI once checkpoint 10 works.

The Node route also doubles as your **keeper** for `resolvePolicy` (watch `PolicyCheckRequested`, then `decryptForTx`, then submit).

### 3. Fork tests: `test/fork/Live.t.sol`
Goal: prove your contracts work against the **real** Task Manager, not just mocks.
- Tag them so the default run skips them: `forge test --no-match-path "test/fork/*"` locally.
- What's realistic on a fork: plaintext-path checks, reading deployed state, that `FHE.asEuint64(uint)` trivial encryptions and FHE ops don't revert, and that ACL grants exist (`FHE.isAllowed`).
- What isn't: decrypting results inside Forge. The threshold network is off-chain. Do real end-to-end decrypts from the Node seed/keeper script and treat that as your integration test.

```bash
forge test --match-path "test/fork/*" --fork-url $ARBITRUM_SEPOLIA_RPC_URL -vv
```

### 4. Export to the frontend
`scripts/export-abis.sh`: copy `out/<Contract>.sol/<Contract>.json` `.abi` into `frontend/lib/contracts/abis/*.ts` (as `export const X = [...] as const` so viem infers types), and `deployments/421614.json` into `frontend/lib/contracts/addresses.ts`.

## ✅ Checkpoint
- [ ] All 6 contracts (+ library) deployed and verified on Arbiscan
- [ ] Seed script run: 1 org, 1 policy, 1 auditor, 3 streams (one `Pending`)
- [ ] On Arbiscan, a `withdraw` tx shows **no readable amount**. Screenshot it for the pitch.
- [ ] Fork tests pass
- [ ] `frontend/lib/contracts/` has addresses + typed ABIs

## Pitfalls
- Arbitrum Sepolia gas estimation for FHE calls can be low; bump the gas limit if txs run out of gas.
- `.env` must never be committed. Check again before pushing.
- Redeploying changes addresses. Re-run the export every time.

## Commit
`feat: deploy scripts, seed/keeper script, fork tests, frontend ABI export`
