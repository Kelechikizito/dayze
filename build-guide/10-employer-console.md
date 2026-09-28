# 10 — Employer console (`/employer`)

## Goal
Everything in architecture §7.1 and §7.2 from the browser.

## Sections (build in this order)

### 1. Organisation
- If `orgs(address).exists` is false → form: name → `createOrg`
- Otherwise show the name + a "Private payroll" badge

### 2. Fund
Three steps, shown as a stepper because each is a tx:
1. `usdc.approve(cusdc, amt)` → `cusdc.shield(me, amt)`. **Warning copy:** "Deposits are public. Individual salaries stay private."
2. `cusdc.setOperator(payroll, until)` (once)
3. Encrypt `amt` for `PAYROLL` → `fundVault(handle, proof)`
- Show the vault balance unsealed via ACP, with a 👁 toggle so it's hidden by default on screen too

### 3. Policy
- Threshold input (encrypted for `POLICY`), approver list, required k → `setPolicy`
- Display: "Threshold: 🔒 encrypted" + "2 of 3 approvers"

### 4. Auditor
- Add/remove addresses → `AuditRegistry`
- Note under the list: "Removing an auditor stops access to *new* data only."

### 5. Streams
- Create: payee address + monthly salary → encrypt for `PAYROLL` → `createStream`
- After the tx: `AwaitingPolicy` → auto-run `decryptForTx(needsApproval)` → `resolvePolicy`. Show "Checking policy privately…"
- Table: payee · status · monthly (unsealed for the payer, blurred until hover) · started · cancel

### 6. Approvals queue
- Streams in `Pending` for orgs where you're an approver → `approve` → when the count reaches k, show an "Activate" button (`activateApproved`)
- For the demo, the employer wallet and one extra wallet are the 2 approvers

## Data fetching
Until the subgraph exists (13), read with `getLogs` on `StreamCreated` filtered by payer, plus `streamsOfPayer`. That's fine for demo scale.

## ✅ Checkpoint
- [ ] Fresh wallet → create org → shield + fund → set policy → add auditor, all from UI
- [ ] Create a $3k stream → goes `Active` without manual steps
- [ ] Create a $12k stream → `Pending` → second wallet approves → `Active`
- [ ] Every FHE action shows `<TxStatus>` states; no silent waits over 2 seconds

## Commit
`feat(frontend): employer console — org, funding, policy, auditors, streams, approvals`
