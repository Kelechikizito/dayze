# Dayze Build Guide

Step-by-step path from an empty Foundry repo to the demo in [`../architecture.md`](../architecture.md).

How each checkpoint is laid out:
- **Goal:** what you build and why
- **Steps:** a numbered list. Each step has a **To do** checklist. Work through it top to bottom and tick each box.
- **Reference:** interfaces, CoFHE snippets and tests. The to-dos point here, e.g. "(**Withdraw** below)".
- **✅ Checkpoint:** a "done when" list. Pass it before moving on.

You write the code.

> **Versions used (checked 2026-09-28):**
> Contracts (all `forge install` into `lib/`, no npm): `cofhe-contracts v0.2.0`, `cofhesdk` @ `8bda9b3` (foundry-plugin + mock-contracts 0.7.1), `fhenix-confidential-contracts v0.4.0`, OpenZeppelin `v5.4.0`.
> Frontend (npm, only in `frontend/`): `@cofhe/sdk@0.7.1`, `@cofhe/react@0.7.1`, `@privy-io/react-auth` + `@privy-io/wagmi` (login), `@worldcoin/idkit` 4.x (World ID). Pin the Privy and IDKit versions when you install.
> CoFHE changes fast. If a function name fails to compile, grep the source in `lib/` first.
>
> Fhenix packages are built for Hardhat. [01-setup.md](01-setup.md) shows the remappings that make them work in Foundry.

## Changes from older CoFHE tutorials

| Old tutorials | Current API |
|---|---|
| `InEuint64 calldata x` → `FHE.asEuint64(x)` | `externalEuint64 x, bytes calldata proof` → `FHE.asEuint64(x, proof)` |
| "Permits" | **ACPs** (Access Control Permits): `acps.getOrCreateSelfACP`, `decryptForView(...).withACP()` |
| `FHE.decrypt(x)` then poll | `FHE.allowPublic(x)` → client `decryptForTx(x).withoutACP().execute()` → contract `FHE.verifyDecryptResult(x, value, sig)` or `FHE.publishDecryptResult(...)` |
| Pass raw handles between contracts | `FHE.shareEuint64(x, target)` → target calls `FHE.receiveEuint64Param(shared)` |
| Write your own confidential token | `FHERC20ERC20Wrapper` from `fhenix-confidential-contracts` (shield / unshield / claimUnshielded) |

## Checkpoints

| # | File | What you build | Time |
|---|---|---|---|
| 01 | [01-setup.md](01-setup.md) | Dependencies, remappings, a `HelloFHE` test passing on CoFHE mocks | 1–2h |
| 02 | [02-confidential-tokens.md](02-confidential-tokens.md) | `ConfidentialToken` (any ERC20) + `ConfidentialNative` (ETH) FHERC20 wrappers | 2h |
| 03 | [03-audit-registry.md](03-audit-registry.md) | `AuditRegistry` + the "allow to auditors" pattern | 1h |
| 04 | [04-approval-policy.md](04-approval-policy.md) | `ApprovalPolicy`: encrypted threshold, k-of-n approvers | 2h |
| 05 | [05-payroll-core.md](05-payroll-core.md) | `DayzePayroll`: orgs, vault, streams, accrual, withdraw | 4–6h |
| 06 | [06-payroll-approvals.md](06-payroll-approvals.md) | Policy check via async decrypt, Pending → Active, replay tests | 3h |
| 07a | [07a-human-registry.md](07a-human-registry.md) | `HumanRegistry`: World ID via a backend attester | 2–3h |
| 07 | [07-income-credential.md](07-income-credential.md) | `IncomeCredential`: issue / revoke / isValid | 2–3h |
| 08 | [08-deploy-and-fork-tests.md](08-deploy-and-fork-tests.md) | Deploy + seed on Arbitrum Sepolia, fork tests, export ABIs | 2–3h |
| 09 | [09-frontend-foundation.md](09-frontend-foundation.md) | Privy login + wagmi + CoFHE SDK in Next.js, ACPs, routing | 4h |
| 10 | [10-employer-console.md](10-employer-console.md) | Employer onboarding, org setup, policy, auditor, fund, create stream, approvals | 5h |
| 11 | [11-worker-app.md](11-worker-app.md) | Employee onboarding (World ID), ticking balance, withdraw, unshield, issue credential | 5h |
| 12 | [12-verifier-and-auditor.md](12-verifier-and-auditor.md) | Verifier page, auditor view + CSV | 3h |
| 13 | [13-indexing-and-notifications.md](13-indexing-and-notifications.md) | *Stretch:* subgraph + notifications | optional |
| 14 | [14-demo-and-submission.md](14-demo-and-submission.md) | Demo script, security review, README, submission | 3h |
| 15 | [15-payroll-agent.md](15-payroll-agent.md) | *Stretch:* Privy signer agent that tops up the vault within limits | optional |

**Order matters.** Build contracts bottom-up (token → registry → policy → payroll → human registry → credential). Test each on mocks before anything uses it. Start the frontend only after 08 gives you live addresses. 07a comes before 07 because `IncomeCredential` reads it.

**Short on time?** Cut in this order: 15 → 13 → World ID UI (07a backend + 11 step 2; still deploy `HumanRegistry`, so every badge reads "not verified") → auditor CSV (12) → approvals UI (10, keep the contract logic) → fork tests (08, keep the deploy). Keep Privy and onboarding: they are cheap and judges see them first.

## Progress

- [x] 01 Setup
- [x] 02 Confidential tokens
- [x] 03 AuditRegistry
- [x] 04 ApprovalPolicy
- [ ] 05 DayzePayroll core
- [ ] 06 Payroll approvals
- [ ] 07a HumanRegistry (World ID)
- [ ] 07 IncomeCredential
- [ ] 08 Deploy + fork tests
- [ ] 09 Frontend foundation
- [ ] 10 Employer console
- [ ] 11 Worker app
- [ ] 12 Verifier + auditor
- [ ] 13 Indexing + notifications (stretch)
- [ ] 14 Demo + submission
- [ ] 15 Payroll agent (stretch)

## Target file layout

```
src/
  HelloFHE.sol                   (delete after 02)
  ConfidentialToken.sol          (one deployment per ERC20)
  ConfidentialNative.sol         (native ETH)
  AuditRegistry.sol
  ApprovalPolicy.sol
  DayzePayroll.sol
  HumanRegistry.sol
  IncomeCredential.sol
  interfaces/   IAuditRegistry.sol, IApprovalPolicy.sol, IDayzePayroll.sol, IHumanRegistry.sol
  libraries/    AuditAccess.sol  (shared _allowAuditors helper)
test/
  unit/         HelloFHETest, ConfidentialTokenTest, AuditRegistryTest, ApprovalPolicyTest,
                DayzePayrollTest, PayrollApprovalsTest, DecryptReplayTest, HumanRegistryTest,
                IncomeCredentialTest  (*.t.sol)
  fuzz/         DayzePayrollFuzzTest.t.sol
  forks/        LiveForkTest.t.sol
  mocks/        AuditHarness.sol, PayrollHarness.sol  (ERC20 + WETH mocks come from Fhenix's ERC20_Harness.sol)
  utils/        DayzeTestBase.sol
script/
  Deploy.s.sol
  seed.sh                        (cast + keystore; encryption via frontend/scripts/encrypt.ts)
frontend/
  app/(employer|worker|verify|audit)/...
  app/onboarding/(employer|employee)/page.tsx
  app/api/world-id/(rp-signature|attest)/route.ts     (server-only secrets)
  app/api/agent/topup/route.ts                        (stretch, 15)
  lib/contracts/     addresses.ts + ABIs
```

Tests use root-style imports (`import {X} from "src/X.sol";`). Every contract uses `pragma solidity 0.8.25;` to match `solc_version` in `foundry.toml`.

Scaffold each new contract with `/sol-style-guide` so layout and NatSpec match.
