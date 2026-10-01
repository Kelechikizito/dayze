# 10 — Employer console (`/employer`)

## Goal
Do everything in architecture §7.1 and §7.2 from the browser.

## Sections (build in this order)

### 1. Organisation
- If `orgs(address).exists` is false → form: name → `createOrg`
- Else show the name + a "Private payroll" badge

### 2. Fund
Each step is a tx, so show a stepper:
0. Token picker: any allowlisted wrapper (cUSDC, cARB, cETH, …)
1. Shield. ERC20: `token.approve(wrapper, amt)` → `wrapper.shield(me, amt)`. Native ETH: `wrapper.shieldNative(me, { value: amt })`. **Warning copy:** "Deposits are public. Individual salaries stay private."
2. `wrapper.setOperator(payroll, until)` (once per token)
3. Encrypt `amt / rate()` (confidential units) for `PAYROLL` → `fundVault(wrapper, handle, proof)`
- Show each token's vault balance, unsealed via ACP. Hide it by default with a 👁 toggle.

### 3. Policy
- Approver list + required k → `setPolicy`
- Per token: threshold input (encrypted for `POLICY`) → `setThreshold(wrapper, …)`
- Show "cUSDC threshold: 🔒 encrypted" per token + "2 of 3 approvers". Warn that a token with no threshold always needs approval.

### 4. Auditor
- Add/remove addresses → `AuditRegistry`
- Note under the list: "Removing an auditor stops access to *new* data only."

### 5. Streams
- Create: payee address + token + monthly salary → encrypt for `PAYROLL` → `createStream(payee, wrapper, …)`
- After the tx: `AwaitingPolicy` → auto-run `decryptForTx(needsApproval)` → `resolvePolicy`. Show "Checking policy privately…"
- Table: payee · token · status · monthly (unsealed for the payer, blurred until hover) · started · cancel

### 6. Approvals queue
- List `Pending` streams for orgs where you're an approver → `approve`. When the count hits k, show "Activate" (`activateApproved`).
- For the demo, the employer wallet and one extra wallet are the 2 approvers.

## Data fetching
Until the subgraph exists (13), use `getLogs` on `StreamCreated` filtered by payer, plus `streamsOfPayer`. Fine at demo scale.

## ✅ Checkpoint
- [ ] Fresh wallet → create org → shield + fund → set policy → add auditor, all in the UI
- [ ] Create a $3k stream → goes `Active` with no manual steps
- [ ] Create a $12k stream → `Pending` → second wallet approves → `Active`
- [ ] Every FHE action shows `<TxStatus>` states. No silent waits over 2 seconds.

## Commit
`feat(frontend): employer console — org, funding, policy, auditors, streams, approvals`
