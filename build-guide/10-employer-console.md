# 10 — Employer console (`/employer`)

## Goal
Do everything in architecture §7.1 and §7.2 from the browser.

## Sections (build in this order)

### 0. Onboarding (`/onboarding/employer`)

**To do:**
- [ ] Create `app/onboarding/employer/page.tsx` with a `<Stepper>` of the 6 steps below
- [ ] Reuse the section components from §1–§5 inside each step
- [ ] Read each step's **Done when** value from the chain
- [ ] When done, go to `/employer`. Show skipped steps in a "Finish setup" card.

A first-time employer walks through the sections below as one `<Stepper>` (09 §7). Each step reuses the section's component, so you build each thing once.

| # | Step | Done when | Skippable |
|---|---|---|---|
| 1 | Sign in (Privy) | `usePrivy().authenticated` | no |
| 2 | Create your organisation (§1) | `orgs(me).exists` | no |
| 3 | Add funds (§2) | vault balance handle is set for any token | no |
| 4 | Set approval rules (§3) | `policy.hasPolicy(me)` | yes |
| 5 | Add an auditor (§4) | `auditorsOf(me).length > 0` | yes |
| 6 | Invite your first employee (§5) | invite link copied | yes |

At the end, go to `/employer`. Skipped steps show as a "Finish setup" card on the dashboard.

Copy: one short line per step. Example for step 3: "Shield tokens and move them into your private payroll vault."

### 1. Organisation

**To do:**
- [ ] Read `orgs(me)`
- [ ] No org: show a name form → `createOrg`
- [ ] Has org: show the name and a "Private payroll" badge

- If `orgs(address).exists` is false → form: name → `createOrg`
- Else show the name + a "Private payroll" badge

### 2. Fund

**To do:**
- [ ] Token picker with every allowlisted wrapper
- [ ] Shield step: `approve` + `shield` (ERC20) or `shieldNative` (ETH). Show the warning copy.
- [ ] Operator step: `setOperator(payroll, until)`. Skip it if already set for this token.
- [ ] Fund step: encrypt `amt / rate()` for `PAYROLL` → `fundVault`
- [ ] Show each vault balance, hidden behind a 👁 toggle

Each step is a tx, so show a stepper:
0. Token picker: any allowlisted wrapper (cUSDC, cARB, cETH, …)
1. Shield. ERC20: `token.approve(wrapper, amt)` → `wrapper.shield(me, amt)`. Native ETH: `wrapper.shieldNative(me, { value: amt })`. **Warning copy:** "Deposits are public. Individual salaries stay private."
2. `wrapper.setOperator(payroll, until)` (once per token)
3. Encrypt `amt / rate()` (confidential units) for `PAYROLL` → `fundVault(wrapper, handle, proof)`
- Show each token's vault balance, unsealed via ACP. Hide it by default with a 👁 toggle.

### 3. Policy

**To do:**
- [ ] Approver list + required count → `setPolicy`
- [ ] One threshold input per token → encrypt for `POLICY` → `setThreshold`
- [ ] Show "🔒 encrypted" per token and "k of n approvers". Warn about tokens with no threshold.

- Approver list + required k → `setPolicy`
- Per token: threshold input (encrypted for `POLICY`) → `setThreshold(wrapper, …)`
- Show "cUSDC threshold: 🔒 encrypted" per token + "2 of 3 approvers". Warn that a token with no threshold always needs approval.

### 4. Auditor

**To do:**
- [ ] Add / remove form → `AuditRegistry`
- [ ] Show the "new data only" note under the list

- Add/remove addresses → `AuditRegistry`
- Note under the list: "Removing an auditor stops access to *new* data only."

### 5. Streams

**To do:**
- [ ] Add a "Copy invite link" button
- [ ] Create form: payee address, token, monthly salary → encrypt → `createStream`
- [ ] Show the human badge as soon as an address is pasted
- [ ] After the tx, resolve the policy by itself and show "Checking policy privately…"
- [ ] Streams table with the columns below

- **Invite:** a "Copy invite link" button → `https://<app>/onboarding/employee?org=<payer>`. The link holds only the org address. No salary, no secret.
- The new employee signs up and sends back their wallet address (11 §0). Paste it into the create form. A QR scan is a nice extra.
- Create: payee address + token + monthly salary → encrypt for `PAYROLL` → `createStream(payee, wrapper, …)`
- After the tx: `AwaitingPolicy` → auto-run `decryptForTx(needsApproval)` → `resolvePolicy`. Show "Checking policy privately…"
- Table: payee · **human** · token · status · monthly (unsealed for the payer, blurred until hover) · started · cancel
- **Human** column: `humanRegistry.isHuman(payee)` (07a). Show "✓ verified human" or "not verified". It's a hint against ghost employees, not a block. Show it in the create form too, right after the address is pasted.

### 6. Approvals queue

**To do:**
- [ ] List `Pending` streams where you are an approver → `approve`
- [ ] Show "Activate" once the count reaches k → `activateApproved`

- List `Pending` streams for orgs where you're an approver → `approve`. When the count hits k, show "Activate" (`activateApproved`).
- For the demo, the employer wallet and one extra wallet are the 2 approvers.

## Data fetching

**To do:**
- [ ] Write a `useStreamsOfPayer()` hook with `getLogs` + `streamsOfPayer`

Until the subgraph exists (13), use `getLogs` on `StreamCreated` filtered by payer, plus `streamsOfPayer`. Fine at demo scale.

## ✅ Checkpoint
- [ ] New email sign-up → onboarding stepper → create org → shield + fund → set policy → add auditor → copy invite link, all in the UI
- [ ] Refresh mid-onboarding → the stepper resumes at the right step (it reads the chain)
- [ ] A verified payee shows "✓ verified human". An unverified one shows "not verified".
- [ ] Create a $3k stream → goes `Active` with no manual steps
- [ ] Create a $12k stream → `Pending` → second wallet approves → `Active`
- [ ] Every FHE action shows `<TxStatus>` states. No silent waits over 2 seconds.

## Commit
`feat(frontend): employer onboarding and console — org, funding, policy, auditors, streams, approvals`
