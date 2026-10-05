# 11 — Worker app (`/worker`)

## Goal
The consumer side and the demo moment: a salary ticking up every second while the explorer shows nothing (architecture §6.1, §7.3, §7.4).

## Sections

### 0. Onboarding (`/onboarding/employee?org=<payer>`)

**To do:**
- [ ] Create `app/onboarding/employee/page.tsx` with a `<Stepper>` of the 5 steps below
- [ ] Read `org` from the URL and show the org name
- [ ] World ID step: IDKit widget → `/api/world-id/attest` → `register`
- [ ] ACP step: reuse `useEnsureACP()` (09)
- [ ] Address step: big address, copy button, QR code
- [ ] Wait step: poll `streamsOfPayee(me)` every 10 seconds, then go to `/worker`
- [ ] Send users who already have a stream straight to `/worker`

The employee opens the invite link from their employer (10 §5). One `<Stepper>` (09 §7):

| # | Step | Done when | Skippable |
|---|---|---|---|
| 1 | Sign in (Privy, email is fine) | `usePrivy().authenticated` | no |
| 2 | Verify you're human (World ID, 07a) | `humanRegistry.isHuman(me)` | yes |
| 3 | Unlock your private data (create ACP, 09 §5) | an active self ACP exists | no |
| 4 | Send your address to your employer | address copied or QR shown | no |
| 5 | Wait for your first stream | `streamsOfPayee(me).length > 0` | — |

- **Step 1:** show the org name from `orgs(org)` so the employee knows who invited them. If `org` is missing or has no org, still let them sign up.
- **Step 2:** open the IDKit widget. Pass the wallet address as the signal. Send the result to `/api/world-id/attest`, then call `register(nullifier, deadline, signature)`. Copy: "Optional. Proves you're a real person without sharing who you are. Landlords will see it on your income proofs."
- **Step 4:** show the address big, with a copy button and a QR code. Copy: "Send this to your employer. They'll use it to start paying you."
- **Step 5:** poll every 10 seconds. When a stream appears, go to `/worker`.

An employee who already has a stream skips onboarding and lands on `/worker`.

### 1. Live balance (the hero)

**To do:**
- [ ] Load `streamsOfPayee(me)`. Unseal `monthly` and `withdrawn` once per stream.
- [ ] Read the latest block time once to fix clock skew (see **Pitfalls**)
- [ ] Tick the balance locally with BigInt math (code below)
- [ ] Show "Updating live. 0 transactions."

- On load: `streamsOfPayee(me)` → for each stream, unseal `monthly` and `withdrawn` **once** via `decryptForView` (ACP)
- Tick locally:
  ```ts
  const now = Date.now() / 1000;
  const accrued = (monthly * BigInt(Math.floor(now - startTime))) / PERIOD; // same formula as _accrued
  const available = accrued - withdrawn;
  ```
  Use `requestAnimationFrame` or a 100ms interval with **BigInt math**. Show 6 decimals so the cents visibly move.
- No transactions while it ticks. Say so in small print: "Updating live. 0 transactions."
- Unseal `withdrawn` again after each withdraw.

### 2. Withdraw

**To do:**
- [ ] Amount input (default: all available) → encrypt for `PAYROLL` → `withdraw`
- [ ] After it confirms, unseal `withdrawn` and the token balance again
- [ ] If nothing moved, show the "nothing moved" message

- Amount input (default: all available) → encrypt for `PAYROLL` → `withdraw`
- After confirmation, unseal your balance in the stream's token and show the change. If it's 0, explain: "Request was more than available, so nothing moved. (We don't revert, because that would leak information.)"

### 3. Cash out (unshield)

**To do:**
- [ ] Show the warning modal first
- [ ] `unshield` → find the claim → `decryptForTx` → `claimUnshielded`
- [ ] Show a 3-step progress bar

- Big warning modal: **"Cashing out reveals this amount publicly onchain."** (architecture §7.3)
- `wrapper.unshield(me, me, amt)` → find the claim → `decryptForTx(claimHandle).withoutACP()` → `claimUnshielded(id, value, sig)`
- Show a three-step progress bar. Decrypt can be slow on testnet.

### 4. Income credentials

**To do:**
- [ ] Issue form with the fields below → `issue`
- [ ] On success, show the share link, a copy button and a QR code
- [ ] "My credentials" list with a live countdown and a Revoke button

- **Issue** form: stream (sets the token), verifier address, threshold (token per month, converted to confidential units), expiry (5 min *(demo)*, 1 day, 7 days, 30 days) → `issue`
- On success: share link `https://<app>/verify/<id>` + copy button + QR code
- **My credentials** list: verifier, threshold, expires in (live countdown), status (Valid / Expired / Revoked), Revoke button

## ✅ Checkpoint
- [ ] Invite link → email sign-up → World ID (simulator) → ACP → address shown. Employer creates a stream → the page moves to `/worker` by itself.
- [ ] Skipping World ID still works. The credential then shows "not verified".
- [ ] Balance ticks smoothly. After a withdraw it matches on-chain accrual within rounding.
- [ ] Withdraw works. An over-withdraw shows the "nothing moved" message.
- [ ] Unshield round trip puts the underlying token in the wallet (native ETH for cETH)
- [ ] Issue a credential → link copied → revoke works
- [ ] The withdraw tx on Arbiscan shows no readable amount

## Pitfalls
- Clock skew: read the latest block timestamp once and use it as an offset, not just `Date.now()`. Otherwise the balance can briefly go negative after activation.
- Don't unseal on every tick. Unseal once, compute locally.

## Commit
`feat(frontend): employee onboarding and worker app — live balance, withdraw, cash-out, credentials`
