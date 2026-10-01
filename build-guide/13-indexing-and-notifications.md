# 13 — Indexing + notifications (stretch)

**Only do this once 01–12 are done and the demo runs end to end.** Neither is a security control. The demo works without them.

## A. Subgraph (The Graph)
Goal: faster dashboards than `getLogs`. A public index is safe because it only holds handles and metadata (architecture §6.4).

1. `npm i -g @graphprotocol/graph-cli` → `graph init --from-contract <PAYROLL> --network arbitrum-sepolia subgraph`
2. Add data sources for `DayzePayroll`, `ApprovalPolicy` and `IncomeCredential`
3. Entities: `Org`, `Stream` (id, payer, payee, token, status, monthlyHandle, startTime), `Withdrawal` (handle only), `Approval`, `Credential` (token, threshold, expiresAt, revoked)
4. Deploy to Subgraph Studio. Switch frontend reads to GraphQL behind a flag. Keep `getLogs` as a fallback.

**Check:** grep your schema. No amount-like field except `threshold` (plaintext by design) and `*Handle` fields.

## B. Notifications
Keep it small:
- **Approvers:** a small read-only watcher (viem `watchContractEvent` on `StreamPending`) posts to a Telegram bot or Discord webhook. It only reads events, so it needs no key.
- **Workers:** in-app banner "Credential to 0xABC… expires in 1h", computed in the browser from `credentialsOf(me)`. No backend.

## ✅ Checkpoint
- [ ] Employer and worker dashboards load from the subgraph
- [ ] One approval notification fires on a `Pending` stream

## Commit
`feat: subgraph for payroll/credential events and approval notifications`
