# 12 — Verifier page + Auditor view

## Part A: Verifier (`/verify/[id]`)

### Goal
A landlord opens a link and sees ✅ / ❌ plus metadata, nothing else (architecture §6.1, §7.4).

### Page
1. Read `credential.get(id)` and `isValid(id)` without a wallet. Metadata is plaintext.
2. Show: issuing organisation (`payroll` org name), threshold in the credential's token ("≥ 3,000 USDC / month", converted from confidential units with the wrapper's `rate()`), stream active since, issued at, expires at (live countdown).
3. Status banner: **Valid**, **Expired** or **Revoked**. When `isValid` is false, don't offer to decrypt.
4. "Reveal result" → connect wallet → if `address != verifier`, show "This credential was issued to 0xABC…". Otherwise create an ACP → `decryptForView(ok, FheTypes.Bool)` → big ✅ / ❌.
5. Footer copy: "You learned one fact: whether this income meets your threshold. Not the salary."

### Demo detail
Keep the page open while the credential expires. Poll `isValid` every few seconds, or compute it client-side from `expiresAt`, and flip the banner to **Expired** live. That's the moment from architecture §9.

## Part B: Auditor (`/audit`)

### Goal
Auditors unseal what they've been granted and export a CSV locally (architecture §7.5).

### Page
1. Input or select a payer address; check `isAuditor(payer, me)`
2. List the payer's streams; for each, unseal `monthly` and `withdrawn`, plus the payer's vault for each token (`vaultOf(payer, token)`), via ACP
3. Table: payee · token · monthly · withdrawn · status
4. "Export CSV" builds a `Blob` in the browser and downloads it. **No fetch/POST anywhere on this page.** Say so in the UI.
5. Handles you're not allowed on (e.g. created after removal): show "🔒 no access" instead of an error

## ✅ Checkpoint
- [ ] Verifier wallet sees ✅ for a passing threshold and ❌ for a failing one
- [ ] A different wallet can't unseal
- [ ] Credential flips to Expired on screen without a reload
- [ ] Auditor sees all streams and downloads a correct CSV; the network tab shows no upload

## Commit
`feat(frontend): verifier page and auditor view with local CSV export`
