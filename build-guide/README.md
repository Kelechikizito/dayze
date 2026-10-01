# Dayze Build Guide

A step-by-step path from an empty Foundry repo to the demo described in [`../architecture.md`](../architecture.md).

Each checkpoint gives you the **goal, interfaces, the tricky CoFHE snippets, tests to write, and a "done when" checklist**. You write the code. Don't move on until the ✅ checkpoint passes.

> **Versions this guide was written against (checked 2026-09-28):**
> Contracts (all via `forge install` into `lib/`, no npm): `cofhe-contracts v0.2.0`, `cofhesdk` @ `8bda9b3` (foundry-plugin + mock-contracts 0.7.1), `fhenix-confidential-contracts v0.4.0`, OpenZeppelin `v5.4.0`.
> Frontend (npm, inside `frontend/` only): `@cofhe/sdk@0.7.1`, `@cofhe/react@0.7.1`.
> CoFHE moves fast. If a function name below doesn't compile, grep the source in `lib/` before anything else.
>
> Fhenix ships Hardhat-first packages. [01-setup.md](01-setup.md) explains the remappings that make them work under pure Foundry.

## Things that changed from older CoFHE tutorials

If you've read older Fhenix examples, these are different now:

| Old tutorials | Current API |
|---|---|
| `InEuint64 calldata x` → `FHE.asEuint64(x)` | `externalEuint64 x, bytes calldata proof` → `FHE.asEuint64(x, proof)` |
| "Permits" | **ACPs** (Access Control Permits): `acps.getOrCreateSelfACP`, `decryptForView(...).withACP()` |
| `FHE.decrypt(x)` then poll | `FHE.allowPublic(x)` → client `decryptForTx(x).withoutACP().execute()` → contract `FHE.verifyDecryptResult(x, value, sig)` or `FHE.publishDecryptResult(...)` |
| Pass raw handles between contracts | `FHE.shareEuint64(x, target)` → target calls `FHE.receiveEuint64Param(shared)` |
| Write your own confidential token | `FHERC20ERC20Wrapper` from `fhenix-confidential-contracts` (shield / unshield / claimUnshielded) |

## Checkpoints

| # | File | What you build | Est. time |
|---|---|---|---|
| 01 | [01-setup.md](01-setup.md) | Dependencies, remappings, a `HelloFHE` contract passing on CoFHE mocks | 1–2h |
| 02 | [02-confidential-usdc.md](02-confidential-usdc.md) | `MockUSDC` + `ConfidentialUSDC` (FHERC20 wrapper) | 1–2h |
| 03 | [03-audit-registry.md](03-audit-registry.md) | `AuditRegistry` + the "allow to auditors" pattern | 1h |
| 04 | [04-approval-policy.md](04-approval-policy.md) | `ApprovalPolicy`: encrypted threshold, k-of-n approvers | 2h |
| 05 | [05-payroll-core.md](05-payroll-core.md) | `DayzePayroll`: orgs, vault, streams, accrual, withdraw | 4–6h |
| 06 | [06-payroll-approvals.md](06-payroll-approvals.md) | Policy check via async decrypt, Pending → Active, replay tests | 3h |
| 07 | [07-income-credential.md](07-income-credential.md) | `IncomeCredential`: issue / revoke / isValid | 2–3h |
| 08 | [08-deploy-and-fork-tests.md](08-deploy-and-fork-tests.md) | Deploy + seed on Arbitrum Sepolia, fork tests, export ABIs | 2–3h |
| 09 | [09-frontend-foundation.md](09-frontend-foundation.md) | wagmi + CoFHE SDK in Next.js, ACPs, routing | 3h |
| 10 | [10-employer-console.md](10-employer-console.md) | Org setup, policy, auditor, fund, create stream, approvals | 4h |
| 11 | [11-worker-app.md](11-worker-app.md) | Ticking balance, withdraw, unshield, issue credential | 4h |
| 12 | [12-verifier-and-auditor.md](12-verifier-and-auditor.md) | Verifier page, auditor view + CSV | 3h |
| 13 | [13-indexing-and-notifications.md](13-indexing-and-notifications.md) | *Stretch:* subgraph + notifications | optional |
| 14 | [14-demo-and-submission.md](14-demo-and-submission.md) | Demo script, security review, README, submission | 3h |

**Order matters.** Contracts go bottom-up (token → registry → policy → payroll → credential), so each one is tested on mocks before anything depends on it. Don't start the frontend until checkpoint 08 gives you live addresses.

**If you're short on time**, cut in this order: 13 → auditor CSV (12) → approvals UI (10, keep the contract logic) → fork tests (08, keep the deploy).

## Progress

- [x] 01 Setup
- [ ] 02 ConfidentialUSDC
- [ ] 03 AuditRegistry
- [ ] 04 ApprovalPolicy
- [ ] 05 DayzePayroll core
- [ ] 06 Payroll approvals
- [ ] 07 IncomeCredential
- [ ] 08 Deploy + fork tests
- [ ] 09 Frontend foundation
- [ ] 10 Employer console
- [ ] 11 Worker app
- [ ] 12 Verifier + auditor
- [ ] 13 Indexing + notifications (stretch)
- [ ] 14 Demo + submission

## Target file layout

```
src/
  HelloFHE.sol                   (delete after 02)
  MockUSDC.sol
  ConfidentialUSDC.sol
  AuditRegistry.sol
  ApprovalPolicy.sol
  DayzePayroll.sol
  IncomeCredential.sol
  interfaces/   IAuditRegistry.sol, IApprovalPolicy.sol, IDayzePayroll.sol
  libraries/    AuditAccess.sol  (shared _allowAuditors helper)
test/
  unit/         HelloFHETest, ConfidentialUSDCTest, AuditRegistryTest, ApprovalPolicyTest,
                DayzePayrollTest, PayrollApprovalsTest, DecryptReplayTest, IncomeCredentialTest  (*.t.sol)
  fuzz/         DayzePayrollFuzzTest.t.sol
  forks/        LiveForkTest.t.sol
  mocks/        AuditHarness.sol, PayrollHarness.sol
  utils/        DayzeTestBase.sol
script/
  Deploy.s.sol
  seed.sh                        (cast + keystore; encryption via frontend/scripts/encrypt.ts)
frontend/
  app/(employer|worker|verify|audit)/...
  lib/contracts/     addresses.ts + ABIs
```

Tests import with root-style paths (`import {X} from "src/X.sol";`). Every contract uses the pinned `pragma solidity 0.8.25;` to match `solc_version` in `foundry.toml`.

Use `/sol-style-guide` to scaffold each new contract so layout and NatSpec stay consistent.
