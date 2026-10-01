# 13 — Indexing + notifications (stretch)

**Only do this if 01–12 are done and the demo runs end to end.** Neither is a security control, and the demo works without them.

## A. Subgraph (The Graph)
Goal: faster dashboards than `getLogs`, and a public index that is safe because it only holds handles and metadata (architecture §6.4).

1. `npm i -g @graphprotocol/graph-cli` → `graph init --from-contract <PAYROLL> --network arbitrum-sepolia subgraph`
2. Add data sources for `DayzePayroll`, `ApprovalPolicy` and `IncomeCredential`
3. Entities: `Org`, `Stream` (id, payer, payee, token, status, monthlyHandle, startTime), `Withdrawal` (handle only), `Approval`, `Credential` (token, threshold, expiresAt, revoked)
4. Deploy to Subgraph Studio; swap the frontend reads to GraphQL behind a flag, keeping `getLogs` as a fallback

**Check:** grep your schema. There should be no field named like an amount except `threshold` (plaintext by design) and `*Handle` fields.

## B. Notifications
Keep it tiny:
- **Approvers:** a small read-only watcher (viem `watchContractEvent` on `StreamPending`) that posts to a Telegram bot or Discord webhook. It only reads events, so it needs no key at all.
- **Workers:** in-app banner "Credential to 0xABC… expires in 1h" computed client-side from `credentialsOf(me)`. No backend needed.

## ✅ Checkpoint
- [ ] Employer and worker dashboards load from the subgraph
- [ ] One approval notification fires on a `Pending` stream

## Commit
`feat: subgraph for payroll/credential events and approval notifications`
