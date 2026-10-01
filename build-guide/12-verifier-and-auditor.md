# 12 — Verifier page + Auditor view

## Part A: Verifier (`/verify/[id]`)

### Goal
A landlord opens a link and sees ✅ / ❌ plus metadata. Nothing else (architecture §6.1, §7.4).

### Page
1. Read `credential.get(id)` and `isValid(id)` with no wallet. Metadata is plaintext.
2. Show: issuing org (`payroll` org name), threshold in the credential's token ("≥ 3,000 USDC / month", converted with the wrapper's `rate()`), stream active since, issued at, expires at (live countdown).
3. Status banner: **Valid**, **Expired** or **Revoked**. If `isValid` is false, don't offer to decrypt.
4. "Reveal result" → connect wallet. If `address != verifier`, show "This credential was issued to 0xABC…". Else create an ACP → `decryptForView(ok, FheTypes.Bool)` → big ✅ / ❌.
5. Footer: "You learned one fact: whether this income meets your threshold. Not the salary."

### Demo detail
Keep the page open while the credential expires. Poll `isValid` every few seconds, or compute it from `expiresAt` in the browser. Flip the banner to **Expired** live. That's the moment from architecture §9.

## Part B: Auditor (`/audit`)

### Goal
Auditors unseal what they were granted and export a CSV locally (architecture §7.5).

### Page
1. Enter or pick a payer address. Check `isAuditor(payer, me)`.
2. List the payer's streams. Via ACP, unseal each stream's `monthly` and `withdrawn`, plus the payer's vault per token (`vaultOf(payer, token)`).
3. Table: payee · token · monthly · withdrawn · status
4. "Export CSV" builds a `Blob` in the browser and downloads it. **No fetch/POST on this page.** Say so in the UI.
5. Handles you can't access (e.g. made after removal): show "🔒 no access", not an error

## ✅ Checkpoint
- [ ] Verifier wallet sees ✅ for a passing threshold and ❌ for a failing one
- [ ] Another wallet can't unseal
- [ ] Credential flips to Expired on screen with no reload
- [ ] Auditor sees all streams and downloads a correct CSV. The network tab shows no upload.

## Commit
`feat(frontend): verifier page and auditor view with local CSV export`
